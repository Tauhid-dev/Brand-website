import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import type { CustomerIntegration } from "../domain/customer-integration.ts";
export interface CustomerIntegrationRepository {
  findById(id: string): Promise<CustomerIntegration | null>;
  findByCustomerAndCode(customerId: string, code: string): Promise<CustomerIntegration | null>;
  create(value: CustomerIntegration): Promise<void>;
  saveWithProjection(value: CustomerIntegration, expectedVersion: number, queue: OperationalQueueItem | null): Promise<void>;
}
