import { and, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  customerPriceOverrides,
  customers,
  planPrices,
  plans,
  priceQuotes,
} from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { PricingReferenceRepository, PricingRepository } from "../application/ports.ts";
import { EffectiveRange } from "../domain/effective-range.ts";
import { Money } from "../domain/money.ts";
import {
  CustomerPriceOverride,
  PlanPrice,
  PriceQuote,
  type BillingInterval,
  type PriceOverrideStatus,
  type PricingBreakdown,
  type TaxBehaviour,
} from "../domain/pricing.ts";

export class D1PricingRepository implements PricingRepository, PricingReferenceRepository {
  constructor(private readonly db: AppDatabase) {}

  async planExists(planId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)).limit(1);
    return row != null;
  }

  async customerExists(customerId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: customers.id }).from(customers)
      .where(eq(customers.id, customerId)).limit(1);
    return row != null;
  }

  async findActivePlanByCode(code: string): Promise<{ id: string; code: string; name: string } | null> {
    const [row] = await this.db.select({ id: plans.id, code: plans.code, name: plans.name })
      .from(plans).where(and(eq(plans.code, code), eq(plans.active, true))).limit(1);
    return row ?? null;
  }

  async findPlanPriceAt(
    planId: string,
    billingInterval: BillingInterval,
    at: Date,
  ): Promise<PlanPrice | null> {
    const [row] = await this.db.select().from(planPrices).where(and(
      eq(planPrices.planId, planId),
      eq(planPrices.billingInterval, billingInterval),
      eq(planPrices.active, true),
      lte(planPrices.effectiveFrom, at),
      or(isNull(planPrices.effectiveTo), gt(planPrices.effectiveTo, at)),
    )).orderBy(planPrices.effectiveFrom).limit(1);
    return row ? mapPlanPrice(row) : null;
  }

  async findPlanPriceOverlaps(
    planId: string,
    billingInterval: BillingInterval,
    range: EffectiveRange,
  ): Promise<PlanPrice[]> {
    const endCondition = range.effectiveTo == null
      ? undefined
      : lt(planPrices.effectiveFrom, range.effectiveTo);
    const rows = await this.db.select().from(planPrices).where(and(
      eq(planPrices.planId, planId),
      eq(planPrices.billingInterval, billingInterval),
      endCondition,
      or(isNull(planPrices.effectiveTo), gt(planPrices.effectiveTo, range.effectiveFrom)),
    ));
    return rows.map(mapPlanPrice);
  }

  async publishPlanPrice(price: PlanPrice, closePriceId: string | null): Promise<void> {
    const value = price.props;
    const insert = this.db.insert(planPrices).values({
      id: value.id.value,
      planId: value.planId.value,
      currency: value.amount.currency,
      billingInterval: value.billingInterval,
      amountMinor: value.amount.amountMinor,
      setupFeeMinor: value.setupFee.amountMinor,
      taxBehaviour: value.taxBehaviour,
      effectiveFrom: value.effectiveRange.effectiveFrom,
      effectiveTo: value.effectiveRange.effectiveTo,
      active: value.active,
      createdBy: value.createdBy,
      createdAt: value.createdAt,
    });
    try {
      if (closePriceId) {
        await this.db.batch([
          this.db.update(planPrices).set({ effectiveTo: value.effectiveRange.effectiveFrom })
            .where(eq(planPrices.id, closePriceId)),
          insert,
        ]);
      } else {
        await insert;
      }
    } catch (error) {
      throw mapPricingConflict(error, "PRICE_VERSION_CONFLICT");
    }
  }

  async findCustomerOverrideAt(
    customerId: string,
    planId: string,
    billingInterval: BillingInterval,
    at: Date,
  ): Promise<CustomerPriceOverride | null> {
    const [row] = await this.db.select().from(customerPriceOverrides).where(and(
      eq(customerPriceOverrides.customerId, customerId),
      eq(customerPriceOverrides.planId, planId),
      eq(customerPriceOverrides.billingInterval, billingInterval),
      inArray(customerPriceOverrides.status, ["SCHEDULED", "ACTIVE"]),
      lte(customerPriceOverrides.effectiveFrom, at),
      or(isNull(customerPriceOverrides.effectiveTo), gt(customerPriceOverrides.effectiveTo, at)),
    )).orderBy(customerPriceOverrides.effectiveFrom).limit(1);
    return row ? mapCustomerOverride(row) : null;
  }

  async findCustomerOverrideOverlaps(
    customerId: string,
    planId: string,
    billingInterval: BillingInterval,
    range: EffectiveRange,
  ): Promise<CustomerPriceOverride[]> {
    const endCondition = range.effectiveTo == null
      ? undefined
      : lt(customerPriceOverrides.effectiveFrom, range.effectiveTo);
    const rows = await this.db.select().from(customerPriceOverrides).where(and(
      eq(customerPriceOverrides.customerId, customerId),
      eq(customerPriceOverrides.planId, planId),
      eq(customerPriceOverrides.billingInterval, billingInterval),
      inArray(customerPriceOverrides.status, ["SCHEDULED", "ACTIVE"]),
      endCondition,
      or(
        isNull(customerPriceOverrides.effectiveTo),
        gt(customerPriceOverrides.effectiveTo, range.effectiveFrom),
      ),
    ));
    return rows.map(mapCustomerOverride);
  }

  async saveCustomerOverride(override: CustomerPriceOverride): Promise<void> {
    const value = override.props;
    try {
      await this.db.insert(customerPriceOverrides).values({
        id: value.id.value,
        customerId: value.customerId.value,
        planId: value.planId.value,
        currency: value.amount.currency,
        billingInterval: value.billingInterval,
        overrideAmountMinor: value.amount.amountMinor,
        overrideSetupFeeMinor: value.setupFee.amountMinor,
        effectiveFrom: value.effectiveRange.effectiveFrom,
        effectiveTo: value.effectiveRange.effectiveTo,
        reason: value.reason,
        status: value.status,
        createdBy: value.createdBy,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      });
    } catch (error) {
      throw mapPricingConflict(error, "PRICE_OVERRIDE_CONFLICT");
    }
  }

  async saveQuote(quote: PriceQuote): Promise<void> {
    const value = quote.props;
    await this.db.insert(priceQuotes).values({
      id: value.id.value,
      customerId: value.customerId.value,
      planId: value.planId.value,
      billingInterval: value.billingInterval,
      basePriceMinor: value.breakdown.basePriceMinor,
      overridePriceMinor: value.breakdown.overridePriceMinor,
      discountTotalMinor: value.breakdown.discountTotalMinor,
      subtotalMinor: value.breakdown.subtotalMinor,
      taxMinor: value.breakdown.taxMinor,
      totalMinor: value.breakdown.totalMinor,
      currency: value.breakdown.currency,
      pricingSnapshot: { ...value.breakdown },
      validUntil: value.validUntil,
      createdBy: value.createdBy,
      createdAt: value.createdAt,
    });
  }

  async findQuoteById(id: string): Promise<PriceQuote | null> {
    const [row] = await this.db.select().from(priceQuotes).where(eq(priceQuotes.id, id)).limit(1);
    return row ? new PriceQuote({
      id: new EntityId(row.id),
      customerId: new EntityId(row.customerId),
      planId: new EntityId(row.planId),
      billingInterval: row.billingInterval as BillingInterval,
      breakdown: row.pricingSnapshot as PricingBreakdown,
      validUntil: row.validUntil,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    }) : null;
  }
}

function mapPlanPrice(row: typeof planPrices.$inferSelect): PlanPrice {
  return new PlanPrice({
    id: new EntityId(row.id),
    planId: new EntityId(row.planId),
    billingInterval: row.billingInterval as BillingInterval,
    amount: new Money(row.amountMinor, row.currency),
    setupFee: new Money(row.setupFeeMinor, row.currency),
    taxBehaviour: row.taxBehaviour as TaxBehaviour,
    effectiveRange: new EffectiveRange(row.effectiveFrom, row.effectiveTo),
    active: row.active,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  });
}

function mapCustomerOverride(
  row: typeof customerPriceOverrides.$inferSelect,
): CustomerPriceOverride {
  return new CustomerPriceOverride({
    id: new EntityId(row.id),
    customerId: new EntityId(row.customerId),
    planId: new EntityId(row.planId),
    billingInterval: row.billingInterval as BillingInterval,
    amount: new Money(row.overrideAmountMinor, row.currency),
    setupFee: new Money(row.overrideSetupFeeMinor, row.currency),
    effectiveRange: new EffectiveRange(row.effectiveFrom, row.effectiveTo),
    reason: row.reason,
    status: row.status as PriceOverrideStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapPricingConflict(error: unknown, code: string): DomainConflictError {
  if (errorChainIncludes(error, code) || errorChainIncludes(error, "UNIQUE constraint failed")) {
    return new DomainConflictError(code, code === "PRICE_VERSION_CONFLICT"
      ? "A plan price already overlaps this effective period."
      : "An active or scheduled price override already overlaps this period.");
  }
  throw error;
}

function errorChainIncludes(error: unknown, value: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes(value)) return true;
    current = current.cause;
  }
  return false;
}
