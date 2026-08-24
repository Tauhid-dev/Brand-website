import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { OperationalQueueRepository } from "./ports.ts";
import { OperationalQueueItem, type QueueStatus, type QueueType } from "../domain/operational-queue.ts";

export class OperationalQueueService {
  constructor(private readonly repository: OperationalQueueRepository, private readonly clock: Clock, private readonly audit: AuditRecorder) {}

  async listReady(queueType: QueueType, limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new DomainValidationError("INVALID_QUEUE_LIMIT", "Queue limit must be from 1 to 200.");
    return this.repository.listReady(queueType, this.clock.now(), limit);
  }

  async claim(id: string, adminUserId: string) {
    const current = await this.required(id);
    const next = current.claim(new EntityId(adminUserId), this.clock.now());
    await this.repository.save(next, current.props.version);
    await this.audit.record({ action: AUDIT_ACTIONS.operationalQueueItemClaimed, entityType: "OPERATIONAL_QUEUE_ITEM", entityId: id, before: current.props, after: next.props });
    return next;
  }

  async resolve(id: string, status: Extract<QueueStatus, "COMPLETED" | "DISMISSED">) {
    const current = await this.required(id);
    const next = current.resolve(status, this.clock.now());
    await this.repository.save(next, current.props.version);
    await this.audit.record({ action: status === "COMPLETED" ? AUDIT_ACTIONS.operationalQueueItemCompleted : AUDIT_ACTIONS.operationalQueueItemDismissed, entityType: "OPERATIONAL_QUEUE_ITEM", entityId: id, before: current.props, after: next.props });
    return next;
  }

  private async required(id: string) {
    const item = await this.repository.findById(new EntityId(id).value);
    if (!item) throw new DomainConflictError("QUEUE_ITEM_NOT_FOUND", "Operational queue item does not exist.");
    return item;
  }
}

export class BillingAttentionProjectionService {
  constructor(private readonly repository: OperationalQueueRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async project(input: { sourceType: "INVOICE" | "PAYMENT_REMINDER" | "SUBSCRIPTION"; sourceId: string; customerId: string; title: string; priority?: number; dueAt?: Date | null; requiresAttention: boolean }) {
    const active = await this.repository.findActive("BILLING_ATTENTION", input.sourceType, input.sourceId);
    if (!input.requiresAttention) { if (active) await new OperationalQueueService(this.repository, this.clock, this.audit).resolve(active.props.id.value, "COMPLETED"); return null; }
    if (active) return active;
    const now = this.clock.now(); const item = new OperationalQueueItem({ id: new EntityId(this.ids.next()), queueType: "BILLING_ATTENTION", sourceType: input.sourceType, sourceId: input.sourceId, customerId: new EntityId(input.customerId), status: "OPEN", priority: input.priority ?? 25, title: input.title, availableAt: now, dueAt: input.dueAt ?? null, assignedToAdminUserId: null, claimedAt: null, resolvedAt: null, version: 1, createdAt: now, updatedAt: now });
    const projected = await this.repository.project(item); await this.audit.record({ action: AUDIT_ACTIONS.billingAttentionProjected, entityType: "OPERATIONAL_QUEUE_ITEM", entityId: projected.props.id.value, after: projected.props }); return projected;
  }
}
