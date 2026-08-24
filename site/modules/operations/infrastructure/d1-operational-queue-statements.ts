import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { operationalQueueItems } from "../../../db/schema.ts";
import type { OperationalQueueItem } from "../domain/operational-queue.ts";

export function insertOperationalQueueItem(db: AppDatabase, value: OperationalQueueItem) {
  const p = value.props;
  return db.insert(operationalQueueItems).values({ id: p.id.value, queueType: p.queueType, sourceType: p.sourceType, sourceId: p.sourceId, customerId: p.customerId?.value ?? null, status: p.status, priority: p.priority, title: p.title, availableAt: p.availableAt, dueAt: p.dueAt, assignedToAdminUserId: p.assignedToAdminUserId?.value ?? null, claimedAt: p.claimedAt, resolvedAt: p.resolvedAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt });
}

export function findActiveOperationalQueueRows(db: AppDatabase, sourceType: string, sourceId: string) {
  return db.select({ id: operationalQueueItems.id, version: operationalQueueItems.version }).from(operationalQueueItems).where(and(eq(operationalQueueItems.sourceType, sourceType), eq(operationalQueueItems.sourceId, sourceId), inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"])));
}

export function resolveOperationalQueueItem(db: AppDatabase, item: { id: string; version: number }, at: Date) {
  return db.update(operationalQueueItems).set({ status: "COMPLETED", resolvedAt: at, version: item.version + 1, updatedAt: at }).where(eq(operationalQueueItems.id, item.id));
}
