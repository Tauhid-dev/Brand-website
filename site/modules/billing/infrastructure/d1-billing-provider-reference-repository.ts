import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { billingCheckoutSessions, billingProviderPriceReferences } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { BillingProviderReferenceRepository } from "../application/ports.ts";
import { BillingCheckoutSession, BillingProviderPriceReference, type BillingCheckoutStatus } from "../domain/billing-provider.ts";

export class D1BillingProviderReferenceRepository implements BillingProviderReferenceRepository {
  constructor(private readonly db: AppDatabase) {}

  async findPrice(provider: string, subscriptionPriceId: string) {
    const [row] = await this.db.select().from(billingProviderPriceReferences).where(and(
      eq(billingProviderPriceReferences.provider, provider.toLowerCase()),
      eq(billingProviderPriceReferences.subscriptionPriceId, subscriptionPriceId),
    )).limit(1);
    return row ? new BillingProviderPriceReference({
      id: new EntityId(row.id), provider: row.provider, subscriptionPriceId: new EntityId(row.subscriptionPriceId),
      providerProductId: row.providerProductId, providerPriceId: row.providerPriceId,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }) : null;
  }

  async savePrice(reference: BillingProviderPriceReference) {
    const value = reference.props;
    try {
      await this.db.insert(billingProviderPriceReferences).values({
        id: value.id.value, provider: value.provider, subscriptionPriceId: value.subscriptionPriceId.value,
        providerProductId: value.providerProductId, providerPriceId: value.providerPriceId,
        createdAt: value.createdAt, updatedAt: value.updatedAt,
      }).onConflictDoNothing({ target: [billingProviderPriceReferences.provider, billingProviderPriceReferences.subscriptionPriceId] });
    } catch (error) { throw providerConflict(error); }
  }

  async findCheckoutByIdempotencyKey(customerId: string, idempotencyKey: string) {
    const [row] = await this.db.select().from(billingCheckoutSessions).where(and(
      eq(billingCheckoutSessions.customerId, customerId), eq(billingCheckoutSessions.idempotencyKey, idempotencyKey),
    )).limit(1);
    return row ? mapCheckout(row) : null;
  }

  async saveCheckout(session: BillingCheckoutSession) {
    const value = session.props;
    try { await this.db.insert(billingCheckoutSessions).values({
      id: value.id.value, customerId: value.customerId.value, subscriptionId: value.subscriptionId.value,
      provider: value.provider, providerSessionId: value.providerSessionId, idempotencyKey: value.idempotencyKey,
      status: value.status, expiresAt: value.expiresAt, completedAt: value.completedAt,
      createdAt: value.createdAt, updatedAt: value.updatedAt,
    }); } catch (error) { throw providerConflict(error); }
  }

  async completeCheckout(provider: string, providerSessionId: string, at: Date) {
    await this.db.update(billingCheckoutSessions).set({ status: "COMPLETED", completedAt: at, updatedAt: at }).where(and(
      eq(billingCheckoutSessions.provider, provider.toLowerCase()),
      eq(billingCheckoutSessions.providerSessionId, providerSessionId),
      eq(billingCheckoutSessions.status, "OPEN"),
    ));
  }
}

function mapCheckout(row: typeof billingCheckoutSessions.$inferSelect) {
  return new BillingCheckoutSession({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId), subscriptionId: new EntityId(row.subscriptionId),
    provider: row.provider, providerSessionId: row.providerSessionId, idempotencyKey: row.idempotencyKey,
    status: row.status as BillingCheckoutStatus, expiresAt: row.expiresAt, completedAt: row.completedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}

function providerConflict(error: unknown) {
  if (error instanceof Error && error.message.includes("UNIQUE")) return new DomainConflictError("BILLING_PROVIDER_REFERENCE_CONFLICT", "Billing provider reference already exists.");
  throw error;
}
