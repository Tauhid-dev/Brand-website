import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { operationalQueueItems } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { OperationalQueueRepository } from "../application/ports.ts";
import { OperationalQueueItem, type QueueStatus, type QueueType } from "../domain/operational-queue.ts";
import { insertOperationalQueueItem } from "./d1-operational-queue-statements.ts";

export class D1OperationalQueueRepository implements OperationalQueueRepository {
  constructor(private readonly db: AppDatabase) {}
  async findById(id: string) { const [row] = await this.db.select().from(operationalQueueItems).where(eq(operationalQueueItems.id, id)).limit(1); return row ? map(row) : null; }
  async findActive(queueType: QueueType, sourceType: string, sourceId: string) {
    const [row] = await this.db.select().from(operationalQueueItems).where(and(eq(operationalQueueItems.queueType, queueType), eq(operationalQueueItems.sourceType, sourceType.toUpperCase()), eq(operationalQueueItems.sourceId, sourceId), inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"]))).limit(1);
    return row ? map(row) : null;
  }
  async project(item: OperationalQueueItem) {
    const p = item.props;
    try { await insertOperationalQueueItem(this.db, item); return item; }
    catch (error) { const existing = await this.findActive(p.queueType, p.sourceType, p.sourceId); if (existing) return existing; throw error; }
  }
  async save(item: OperationalQueueItem, expectedVersion: number) {
    const p = item.props;
    const result = await this.db.update(operationalQueueItems).set({ status: p.status, assignedToAdminUserId: p.assignedToAdminUserId?.value ?? null, claimedAt: p.claimedAt, resolvedAt: p.resolvedAt, version: p.version, updatedAt: p.updatedAt }).where(and(eq(operationalQueueItems.id, p.id.value), eq(operationalQueueItems.version, expectedVersion)));
    if (Number(result.meta.changes) !== 1) throw new DomainConflictError("QUEUE_VERSION_CONFLICT", "Operational queue item was changed concurrently.");
  }
  async listReady(queueType: QueueType, at: Date, limit: number) {
    const rows = await this.db.select().from(operationalQueueItems).where(and(eq(operationalQueueItems.queueType, queueType), inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"]), lte(operationalQueueItems.availableAt, at))).orderBy(asc(operationalQueueItems.priority), asc(operationalQueueItems.dueAt), asc(operationalQueueItems.createdAt)).limit(limit);
    return rows.map(map);
  }
  async listActive(limit: number) {
    const rows = await this.db.select().from(operationalQueueItems)
      .where(inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"]))
      .orderBy(asc(operationalQueueItems.priority), asc(operationalQueueItems.availableAt))
      .limit(limit);
    return rows.map(map);
  }
}

function map(row: typeof operationalQueueItems.$inferSelect) { return new OperationalQueueItem({ id: new EntityId(row.id), queueType: row.queueType as QueueType, sourceType: row.sourceType, sourceId: row.sourceId, customerId: row.customerId ? new EntityId(row.customerId) : null, status: row.status as QueueStatus, priority: row.priority, title: row.title, availableAt: row.availableAt, dueAt: row.dueAt, assignedToAdminUserId: row.assignedToAdminUserId ? new EntityId(row.assignedToAdminUserId) : null, claimedAt: row.claimedAt, resolvedAt: row.resolvedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
