import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { customerIntegrations } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import { findActiveOperationalQueueRows, insertOperationalQueueItem, resolveOperationalQueueItem } from "../../operations/infrastructure/d1-operational-queue-statements.ts";
import type { CustomerIntegrationRepository } from "../application/ports.ts";
import { CustomerIntegration, type CustomerIntegrationStatus } from "../domain/customer-integration.ts";

export class D1CustomerIntegrationRepository implements CustomerIntegrationRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string) {
    const [row] = await this.db.select().from(customerIntegrations).where(eq(customerIntegrations.id, id)).limit(1);
    return row ? map(row) : null;
  }

  async findByCustomerAndCode(customerId: string, code: string) {
    const [row] = await this.db.select().from(customerIntegrations).where(and(eq(customerIntegrations.customerId, customerId), eq(customerIntegrations.integrationCode, code))).limit(1);
    return row ? map(row) : null;
  }

  async create(value: CustomerIntegration) {
    const p = value.props;
    await this.db.insert(customerIntegrations).values({ id: p.id.value, customerId: p.customerId.value, integrationCode: p.integrationCode.value, category: p.category, status: p.status, lastCheckedAt: p.lastCheckedAt, lastSuccessfulAt: p.lastSuccessfulAt, errorCode: p.errorCode, metadata: { ...p.metadata }, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt });
  }

  async saveWithProjection(value: CustomerIntegration, expectedVersion: number, queue: OperationalQueueItem | null) {
    const p = value.props;
    const active = await findActiveOperationalQueueRows(this.db, "CUSTOMER_INTEGRATION", p.id.value);
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const statements: BatchItem[] = [
      this.db.update(customerIntegrations).set({ status: p.status, lastCheckedAt: p.lastCheckedAt, lastSuccessfulAt: p.lastSuccessfulAt, errorCode: p.errorCode, metadata: { ...p.metadata }, version: expectedVersion + 1, updatedAt: p.updatedAt }).where(eq(customerIntegrations.id, p.id.value)),
      ...active.map((item) => resolveOperationalQueueItem(this.db, item, p.updatedAt)),
    ];
    if (queue) {
      statements.push(insertOperationalQueueItem(this.db, queue));
    }
    try { await this.db.batch(statements as [BatchItem, ...BatchItem[]]); }
    catch (error) { if (error instanceof Error && error.message.includes("VERSION_CONFLICT")) throw new DomainConflictError("INTEGRATION_VERSION_CONFLICT", "Customer integration changed concurrently."); throw error; }
  }
}

function map(row: typeof customerIntegrations.$inferSelect) { return new CustomerIntegration({ id: new EntityId(row.id), customerId: new EntityId(row.customerId), integrationCode: new StableCode(row.integrationCode), category: row.category, status: row.status as CustomerIntegrationStatus, lastCheckedAt: row.lastCheckedAt, lastSuccessfulAt: row.lastSuccessfulAt, errorCode: row.errorCode, metadata: row.metadata, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
