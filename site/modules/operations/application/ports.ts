import type { OperationalQueueItem, QueueType } from "../domain/operational-queue.ts";

export interface OperationalQueueRepository {
  findById(id: string): Promise<OperationalQueueItem | null>;
  findActive(queueType: QueueType, sourceType: string, sourceId: string): Promise<OperationalQueueItem | null>;
  project(item: OperationalQueueItem): Promise<OperationalQueueItem>;
  save(item: OperationalQueueItem, expectedVersion: number): Promise<void>;
  listReady(queueType: QueueType, at: Date, limit: number): Promise<OperationalQueueItem[]>;
}
