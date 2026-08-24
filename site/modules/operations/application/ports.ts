import type { OperationalQueueItem, QueueType } from "../domain/operational-queue.ts";

export interface OperationalQueueRepository {
  findById(id: string): Promise<OperationalQueueItem | null>;
  findActive(queueType: QueueType, sourceType: string, sourceId: string): Promise<OperationalQueueItem | null>;
  project(item: OperationalQueueItem): Promise<OperationalQueueItem>;
  save(item: OperationalQueueItem, expectedVersion: number): Promise<void>;
  listReady(queueType: QueueType, at: Date, limit: number): Promise<OperationalQueueItem[]>;
  listActive(limit: number): Promise<OperationalQueueItem[]>;
}

export type ExpectedOperationalWork = {
  queueType: QueueType;
  sourceType: string;
  sourceId: string;
  customerId: string | null;
  priority: number;
  title: string;
  availableAt: Date;
  dueAt: Date | null;
};

export interface OperationalQueueProjectionSource {
  listExpected(at: Date, limit: number): Promise<ExpectedOperationalWork[]>;
}
