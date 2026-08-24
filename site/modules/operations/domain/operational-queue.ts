import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";

export const QUEUE_TYPES = ["CUSTOMER_ACTION", "INTERNAL_ACTION", "BILLING_ATTENTION", "AGENT_PROVISIONING"] as const;
export type QueueType = (typeof QUEUE_TYPES)[number];
export type QueueStatus = "OPEN" | "CLAIMED" | "COMPLETED" | "DISMISSED";

export type OperationalQueueItemProps = {
  id: EntityId; queueType: QueueType; sourceType: string; sourceId: string;
  customerId: EntityId | null; status: QueueStatus; priority: number; title: string;
  availableAt: Date; dueAt: Date | null; assignedToAdminUserId: EntityId | null;
  claimedAt: Date | null; resolvedAt: Date | null; version: number;
  createdAt: Date; updatedAt: Date;
};

export class OperationalQueueItem {
  readonly props: Readonly<OperationalQueueItemProps>;

  constructor(input: OperationalQueueItemProps) {
    if (!QUEUE_TYPES.includes(input.queueType)) throw new DomainValidationError("INVALID_QUEUE_TYPE", "Operational queue type is invalid.");
    if (!Number.isSafeInteger(input.priority) || input.priority < 0 || input.priority > 100) throw new DomainValidationError("INVALID_QUEUE_PRIORITY", "Queue priority must be from 0 to 100.");
    if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new DomainValidationError("INVALID_QUEUE_VERSION", "Queue version must be positive.");
    const sourceType = requireText(input.sourceType, "sourceType", 80).toUpperCase();
    const sourceId = requireText(input.sourceId, "sourceId", 255);
    const title = requireText(input.title, "title", 200);
    if (input.status === "OPEN" && (input.assignedToAdminUserId || input.claimedAt || input.resolvedAt)) throw new DomainValidationError("INVALID_OPEN_QUEUE_STATE", "Open queue items cannot be assigned or resolved.");
    if (input.status === "CLAIMED" && (!input.assignedToAdminUserId || !input.claimedAt || input.resolvedAt)) throw new DomainValidationError("INVALID_CLAIMED_QUEUE_STATE", "Claimed queue items require an assignee and claim time.");
    if (["COMPLETED", "DISMISSED"].includes(input.status) && !input.resolvedAt) throw new DomainValidationError("INVALID_RESOLVED_QUEUE_STATE", "Resolved queue items require a resolution time.");
    this.props = Object.freeze({ ...input, sourceType, sourceId, title });
  }

  claim(adminUserId: EntityId, at: Date): OperationalQueueItem {
    if (this.props.status !== "OPEN") throw new DomainConflictError("QUEUE_ITEM_NOT_OPEN", "Only open queue items can be claimed.");
    return new OperationalQueueItem({ ...this.props, status: "CLAIMED", assignedToAdminUserId: adminUserId, claimedAt: at, updatedAt: at, version: this.props.version + 1 });
  }

  resolve(status: "COMPLETED" | "DISMISSED", at: Date): OperationalQueueItem {
    if (!["OPEN", "CLAIMED"].includes(this.props.status)) throw new DomainConflictError("QUEUE_ITEM_ALREADY_RESOLVED", "Queue item is already resolved.");
    return new OperationalQueueItem({ ...this.props, status, resolvedAt: at, updatedAt: at, version: this.props.version + 1 });
  }
}
