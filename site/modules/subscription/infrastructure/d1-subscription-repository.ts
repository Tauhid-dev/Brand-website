import { and, desc, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { subscriptionEntitlements, subscriptionPrices, subscriptions } from "../../../db/schema.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";
import type { BillingInterval, PricingBreakdown, TaxBehaviour } from "../../pricing/domain/pricing.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { SubscriptionRepository } from "../application/ports.ts";
import {
  Subscription,
  SubscriptionEntitlement,
  SubscriptionPrice,
  type EntitlementDefinition,
  type SubscriptionPricingSource,
  type SubscriptionStatus,
} from "../domain/subscription.ts";

export class D1SubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string): Promise<Subscription | null> {
    const [row] = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    return row ? mapSubscription(row) : null;
  }

  async findByProviderReference(provider: string, externalSubscriptionId: string): Promise<Subscription | null> {
    const [row] = await this.db.select().from(subscriptions).where(and(eq(subscriptions.externalBillingProvider, provider.toLowerCase()), eq(subscriptions.externalSubscriptionId, externalSubscriptionId))).limit(1);
    return row ? mapSubscription(row) : null;
  }

  async findCurrentForCustomer(customerId: string): Promise<Subscription | null> {
    const [row] = await this.db.select().from(subscriptions).where(and(
      eq(subscriptions.customerId, customerId),
      or(eq(subscriptions.status, "PENDING"), eq(subscriptions.status, "TRIAL"), eq(subscriptions.status, "ACTIVE"), eq(subscriptions.status, "PAST_DUE"), eq(subscriptions.status, "SUSPENDED"), eq(subscriptions.status, "CANCEL_AT_PERIOD_END")),
    )).limit(1);
    return row ? mapSubscription(row) : null;
  }

  async findLatestForCustomer(customerId: string): Promise<Subscription | null> {
    const [row] = await this.db.select().from(subscriptions).where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.createdAt)).limit(1);
    return row ? mapSubscription(row) : null;
  }

  async create(subscription: Subscription, price: SubscriptionPrice, entitlements: readonly SubscriptionEntitlement[]): Promise<void> {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const statements: BatchItem[] = [
      this.insertSubscription(subscription), this.insertPrice(price),
      ...entitlements.map((entitlement) => this.insertEntitlement(entitlement)),
    ];
    try {
      await this.db.batch(statements as [BatchItem, ...BatchItem[]]);
    } catch (error) { throw mapSubscriptionConflict(error); }
  }

  async saveTransition(subscription: Subscription, closeEntitlementsAt: Date | null, restoredEntitlements: readonly SubscriptionEntitlement[]): Promise<void> {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const value = subscription.props;
    const statements: BatchItem[] = [this.db.update(subscriptions).set({
      status: value.status, startedAt: value.startedAt, currentPeriodStart: value.currentPeriodStart,
      currentPeriodEnd: value.currentPeriodEnd, gracePeriodEndsAt: value.gracePeriodEndsAt,
      serviceExtendedUntil: value.serviceExtendedUntil, cancelAt: value.cancelAt, cancelledAt: value.cancelledAt,
      trialEndsAt: value.trialEndsAt, version: value.version, updatedAt: value.updatedAt,
    }).where(eq(subscriptions.id, value.id.value))];
    if (closeEntitlementsAt) statements.push(this.db.update(subscriptionEntitlements).set({
      effectiveTo: closeEntitlementsAt, updatedAt: closeEntitlementsAt,
    }).where(and(
      eq(subscriptionEntitlements.subscriptionId, value.id.value),
      lte(subscriptionEntitlements.effectiveFrom, closeEntitlementsAt),
      or(isNull(subscriptionEntitlements.effectiveTo), gt(subscriptionEntitlements.effectiveTo, closeEntitlementsAt)),
    )));
    statements.push(...restoredEntitlements.map((entitlement) => this.insertEntitlement(entitlement)));
    try { await this.db.batch(statements as [BatchItem, ...BatchItem[]]); }
    catch (error) { throw mapSubscriptionConflict(error); }
  }

  async findEffectiveEntitlements(subscriptionId: string, at: Date): Promise<SubscriptionEntitlement[]> {
    const rows = await this.db.select().from(subscriptionEntitlements).where(and(
      eq(subscriptionEntitlements.subscriptionId, subscriptionId),
      lte(subscriptionEntitlements.effectiveFrom, at),
      or(isNull(subscriptionEntitlements.effectiveTo), gt(subscriptionEntitlements.effectiveTo, at)),
    ));
    return rows.map(mapEntitlement);
  }

  async findLatestEntitlementDefinitions(subscriptionId: string): Promise<EntitlementDefinition[]> {
    const rows = await this.db.select().from(subscriptionEntitlements)
      .where(eq(subscriptionEntitlements.subscriptionId, subscriptionId))
      .orderBy(desc(subscriptionEntitlements.effectiveFrom));
    const definitions = new Map<string, EntitlementDefinition>();
    for (const row of rows) if (!definitions.has(row.offeringCode)) definitions.set(row.offeringCode, {
      offeringCode: row.offeringCode, enabled: row.enabled, limitValue: row.limitValue, limitUnit: row.limitUnit,
    });
    return [...definitions.values()];
  }

  async findPriceAt(subscriptionId: string, at: Date): Promise<SubscriptionPrice | null> {
    const [row] = await this.db.select().from(subscriptionPrices).where(and(
      eq(subscriptionPrices.subscriptionId, subscriptionId), lte(subscriptionPrices.effectiveFrom, at),
      or(isNull(subscriptionPrices.effectiveTo), gt(subscriptionPrices.effectiveTo, at)),
    )).orderBy(desc(subscriptionPrices.effectiveFrom)).limit(1);
    return row ? mapPrice(row) : null;
  }

  async findPriceOverlaps(subscriptionId: string, from: Date, to: Date | null): Promise<SubscriptionPrice[]> {
    const rows = await this.db.select().from(subscriptionPrices).where(and(
      eq(subscriptionPrices.subscriptionId, subscriptionId),
      to ? lt(subscriptionPrices.effectiveFrom, to) : undefined,
      or(isNull(subscriptionPrices.effectiveTo), gt(subscriptionPrices.effectiveTo, from)),
    ));
    return rows.map(mapPrice);
  }

  async publishPrice(price: SubscriptionPrice, closePriceId: string | null): Promise<void> {
    const insert = this.insertPrice(price);
    try {
      if (closePriceId) await this.db.batch([
        this.db.update(subscriptionPrices).set({ effectiveTo: price.props.effectiveRange.effectiveFrom })
          .where(eq(subscriptionPrices.id, closePriceId)), insert,
      ]);
      else await insert;
    } catch (error) { throw mapSubscriptionConflict(error); }
  }

  private insertSubscription(value: Subscription) {
    const props = value.props;
    return this.db.insert(subscriptions).values({
      id: props.id.value, customerId: props.customerId.value, planId: props.planId.value,
      status: props.status, billingInterval: props.billingInterval, currency: props.currency,
      startedAt: props.startedAt, currentPeriodStart: props.currentPeriodStart,
      currentPeriodEnd: props.currentPeriodEnd, gracePeriodEndsAt: props.gracePeriodEndsAt,
      serviceExtendedUntil: props.serviceExtendedUntil, cancelAt: props.cancelAt, cancelledAt: props.cancelledAt,
      trialEndsAt: props.trialEndsAt, externalBillingProvider: props.externalBillingProvider,
      externalCustomerId: props.externalCustomerId, externalSubscriptionId: props.externalSubscriptionId,
      version: props.version, createdAt: props.createdAt, updatedAt: props.updatedAt,
    });
  }

  private insertPrice(value: SubscriptionPrice) {
    const props = value.props;
    return this.db.insert(subscriptionPrices).values({
      id: props.id.value, subscriptionId: props.subscriptionId.value,
      baseAmountMinor: props.baseAmount.amountMinor, effectiveAmountMinor: props.effectiveAmount.amountMinor,
      setupFeeMinor: props.setupFee.amountMinor, discountTotalMinor: props.discountTotal.amountMinor,
      currency: props.baseAmount.currency, taxBehaviour: props.taxBehaviour,
      effectiveFrom: props.effectiveRange.effectiveFrom, effectiveTo: props.effectiveRange.effectiveTo,
      pricingSource: props.pricingSource, pricingSnapshot: { ...props.pricingSnapshot }, createdAt: props.createdAt,
    });
  }

  private insertEntitlement(value: SubscriptionEntitlement) {
    const props = value.props;
    return this.db.insert(subscriptionEntitlements).values({
      id: props.id.value, subscriptionId: props.subscriptionId.value, offeringCode: props.offeringCode.value,
      enabled: props.enabled, limitValue: props.limitValue, limitUnit: props.limitUnit,
      effectiveFrom: props.effectiveRange.effectiveFrom, effectiveTo: props.effectiveRange.effectiveTo,
      createdAt: props.createdAt, updatedAt: props.updatedAt,
    });
  }
}

function mapSubscription(row: typeof subscriptions.$inferSelect): Subscription {
  return new Subscription({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId), planId: new EntityId(row.planId),
    status: row.status as SubscriptionStatus, billingInterval: row.billingInterval as BillingInterval,
    currency: row.currency, startedAt: row.startedAt, currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd, gracePeriodEndsAt: row.gracePeriodEndsAt,
    serviceExtendedUntil: row.serviceExtendedUntil, cancelAt: row.cancelAt, cancelledAt: row.cancelledAt,
    trialEndsAt: row.trialEndsAt, externalBillingProvider: row.externalBillingProvider,
    externalCustomerId: row.externalCustomerId, externalSubscriptionId: row.externalSubscriptionId,
    version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapPrice(row: typeof subscriptionPrices.$inferSelect): SubscriptionPrice {
  return new SubscriptionPrice({
    id: new EntityId(row.id), subscriptionId: new EntityId(row.subscriptionId),
    baseAmount: new Money(row.baseAmountMinor, row.currency), effectiveAmount: new Money(row.effectiveAmountMinor, row.currency),
    setupFee: new Money(row.setupFeeMinor, row.currency), discountTotal: new Money(row.discountTotalMinor, row.currency),
    taxBehaviour: row.taxBehaviour as TaxBehaviour, effectiveRange: new EffectiveRange(row.effectiveFrom, row.effectiveTo),
    pricingSource: row.pricingSource as SubscriptionPricingSource,
    pricingSnapshot: row.pricingSnapshot as PricingBreakdown, createdAt: row.createdAt,
  });
}
function mapEntitlement(row: typeof subscriptionEntitlements.$inferSelect): SubscriptionEntitlement {
  return new SubscriptionEntitlement({
    id: new EntityId(row.id), subscriptionId: new EntityId(row.subscriptionId),
    offeringCode: new StableCode(row.offeringCode), enabled: row.enabled,
    limitValue: row.limitValue, limitUnit: row.limitUnit,
    effectiveRange: new EffectiveRange(row.effectiveFrom, row.effectiveTo),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapSubscriptionConflict(error: unknown): DomainConflictError {
  const codes = ["CURRENT_SUBSCRIPTION_EXISTS", "SUBSCRIPTION_VERSION_CONFLICT", "INVALID_SUBSCRIPTION_TRANSITION", "SUBSCRIPTION_PRICE_CONFLICT", "ENTITLEMENT_VERSION_CONFLICT"];
  for (const code of codes) if (errorChainIncludes(error, code)) return new DomainConflictError(code, "Subscription operation conflicts with current state.");
  if (errorChainIncludes(error, "UNIQUE constraint failed: subscriptions.customer_id")) return new DomainConflictError("CURRENT_SUBSCRIPTION_EXISTS", "Customer already has a current subscription.");
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
