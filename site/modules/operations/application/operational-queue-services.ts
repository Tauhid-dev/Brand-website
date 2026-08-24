import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { ExpectedOperationalWork, OperationalQueueProjectionSource, OperationalQueueRepository } from "./ports.ts";
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

export class OperationalQueueReconciliationService {
  constructor(
    private readonly repository: OperationalQueueRepository,
    private readonly source: OperationalQueueProjectionSource,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(limit = 1_000) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_000) throw new DomainValidationError("INVALID_QUEUE_RECONCILIATION_LIMIT", "Queue reconciliation limit must be from 1 to 2,000.");
    const now = this.clock.now();
    const expected = await this.source.listExpected(now, limit);
    const expectedByKey = new Map<string, ExpectedOperationalWork>();
    for (const work of expected) {
      const key = queueKey(work.queueType, work.sourceType, work.sourceId);
      if (expectedByKey.has(key)) throw new DomainConflictError("DUPLICATE_EXPECTED_QUEUE_WORK", "Operational projection source returned duplicate work.");
      expectedByKey.set(key, work);
    }
    const active = await this.repository.listActive(limit);
    const resolutionDeferred = expected.length >= limit || active.length >= limit;
    const activeByKey = new Map(active.map((item) => [queueKey(item.props.queueType, item.props.sourceType, item.props.sourceId), item]));
    let created = 0; let refreshed = 0; let resolved = 0;
    for (const [key, work] of expectedByKey) {
      const current = activeByKey.get(key);
      if (!current) {
        await this.repository.project(new OperationalQueueItem({
          id: new EntityId(this.ids.next()), queueType: work.queueType, sourceType: work.sourceType,
          sourceId: work.sourceId, customerId: work.customerId ? new EntityId(work.customerId) : null,
          status: "OPEN", priority: work.priority, title: work.title, availableAt: work.availableAt,
          dueAt: work.dueAt, assignedToAdminUserId: null, claimedAt: null, resolvedAt: null,
          version: 1, createdAt: now, updatedAt: now,
        }));
        created += 1;
      } else if (projectionChanged(current, work)) {
        const next = current.refresh({
          customerId: work.customerId ? new EntityId(work.customerId) : null,
          priority: work.priority, title: work.title, availableAt: work.availableAt, dueAt: work.dueAt,
        }, now);
        await this.repository.save(next, current.props.version);
        refreshed += 1;
      }
    }
    if (!resolutionDeferred) {
      for (const item of active) {
        if (!expectedByKey.has(queueKey(item.props.queueType, item.props.sourceType, item.props.sourceId))) {
          await this.repository.save(item.resolve("COMPLETED", now), item.props.version);
          resolved += 1;
        }
      }
    }
    const summary = Object.freeze({ expected: expected.length, created, refreshed, resolved, resolutionDeferred });
    await this.audit.record({ action: AUDIT_ACTIONS.operationalQueuesReconciled, entityType: "OPERATIONAL_QUEUE_RECONCILIATION", entityId: null, after: summary });
    return summary;
  }
}

function queueKey(queueType: QueueType, sourceType: string, sourceId: string) {
  return `${queueType}:${sourceType.toUpperCase()}:${sourceId}`;
}

function projectionChanged(item: OperationalQueueItem, work: ExpectedOperationalWork) {
  const current = item.props;
  return current.customerId?.value !== work.customerId ||
    current.priority !== work.priority ||
    current.title !== work.title ||
    current.availableAt.getTime() !== work.availableAt.getTime() ||
    current.dueAt?.getTime() !== work.dueAt?.getTime();
}
