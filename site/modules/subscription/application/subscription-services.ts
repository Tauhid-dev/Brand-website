import type { PlanEntitlementSource } from "../../catalogue/application/ports.ts";
import type { PricingReferenceRepository } from "../../pricing/application/ports.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";
import type { BillingInterval, PricingBreakdown } from "../../pricing/domain/pricing.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { SubscriptionPricingResolver, SubscriptionRepository } from "./ports.ts";
import {
  Subscription,
  SubscriptionEntitlement,
  SubscriptionPrice,
  subscriptionAllowsService,
  type CustomerEntitlements,
  type SubscriptionPricingSource,
  type SubscriptionStatus,
} from "../domain/subscription.ts";

export class CreateSubscriptionService {
  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly references: PricingReferenceRepository,
    private readonly catalogue: PlanEntitlementSource,
    private readonly pricing: SubscriptionPricingResolver,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: {
    customerId: string; planId: string; billingInterval: BillingInterval;
    initialStatus?: "PENDING" | "TRIAL" | "ACTIVE"; trialEndsAt?: Date | null;
    currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null;
    externalBillingProvider?: string | null; externalCustomerId?: string | null;
    externalSubscriptionId?: string | null;
  }): Promise<Subscription> {
    const [customerExists, planExists, current] = await Promise.all([
      this.references.customerExists(input.customerId), this.references.planExists(input.planId),
      this.repository.findCurrentForCustomer(input.customerId),
    ]);
    if (!customerExists) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (!planExists) throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    if (current) throw new DomainConflictError("CURRENT_SUBSCRIPTION_EXISTS", "Customer already has a current subscription.");
    const now = this.clock.now();
    const subscriptionId = new EntityId(this.ids.next());
    const breakdown = await this.pricing.resolvePrice({
      customerId: input.customerId, planId: input.planId, subscriptionId: subscriptionId.value,
      billingInterval: input.billingInterval, effectiveAt: now,
    });
    const status = input.initialStatus ?? "PENDING";
    const subscription = new Subscription({
      id: subscriptionId, customerId: new EntityId(input.customerId), planId: new EntityId(input.planId),
      status, billingInterval: input.billingInterval, currency: breakdown.currency,
      startedAt: status === "ACTIVE" || status === "TRIAL" ? now : null,
      currentPeriodStart: input.currentPeriodStart ?? null, currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAt: null, cancelledAt: null, trialEndsAt: input.trialEndsAt ?? null,
      externalBillingProvider: input.externalBillingProvider ?? null,
      externalCustomerId: input.externalCustomerId ?? null,
      externalSubscriptionId: input.externalSubscriptionId ?? null,
      version: 1, createdAt: now, updatedAt: now,
    });
    const price = contractedPrice(this.ids, subscriptionId, breakdown, now, "RESOLVED");
    const definitions = await this.catalogue.findPlanEntitlementDefinitions(input.planId);
    const entitlements = definitions.map((definition) => new SubscriptionEntitlement({
      id: new EntityId(this.ids.next()), subscriptionId, offeringCode: new StableCode(definition.offeringCode),
      enabled: definition.enabled, limitValue: definition.limitValue, limitUnit: definition.limitUnit,
      effectiveRange: new EffectiveRange(now, null), createdAt: now, updatedAt: now,
    }));
    await this.repository.create(subscription, price, entitlements);
    await this.audit.record({ action: AUDIT_ACTIONS.subscriptionCreated, entityType: "SUBSCRIPTION", entityId: subscription.props.id.value, after: { subscription: subscription.props, price: price.props, entitlements: entitlements.map((item) => item.props) } });
    return subscription;
  }
}

export class SubscriptionLifecycleService {
  constructor(private readonly repository: SubscriptionRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}

  async transition(subscriptionId: string, to: SubscriptionStatus): Promise<Subscription> {
    const current = await this.repository.findById(subscriptionId);
    if (!current) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Subscription does not exist.");
    const now = this.clock.now();
    const next = current.transition(to, now);
    const closeEntitlementsAt = ["SUSPENDED", "CANCELLED", "EXPIRED"].includes(to) ? now : null;
    let restored: SubscriptionEntitlement[] = [];
    if (!subscriptionAllowsService(current.props.status) && subscriptionAllowsService(to) && current.props.status === "SUSPENDED") {
      const definitions = await this.repository.findLatestEntitlementDefinitions(subscriptionId);
      restored = definitions.map((definition) => new SubscriptionEntitlement({
        id: new EntityId(this.ids.next()), subscriptionId: current.props.id,
        offeringCode: new StableCode(definition.offeringCode), enabled: definition.enabled,
        limitValue: definition.limitValue, limitUnit: definition.limitUnit,
        effectiveRange: new EffectiveRange(now, null), createdAt: now, updatedAt: now,
      }));
    }
    await this.repository.saveTransition(next, closeEntitlementsAt, restored);
    await this.audit.record({ action: AUDIT_ACTIONS.subscriptionChanged, entityType: "SUBSCRIPTION", entityId: subscriptionId, before: current.props, after: next.props });
    return next;
  }

  activate(id: string) { return this.transition(id, "ACTIVE"); }
  markPastDue(id: string) { return this.transition(id, "PAST_DUE"); }
  suspend(id: string) { return this.transition(id, "SUSPENDED"); }
  resume(id: string) { return this.transition(id, "ACTIVE"); }
  cancel(id: string) { return this.transition(id, "CANCELLED"); }
  expire(id: string) { return this.transition(id, "EXPIRED"); }
}

export class ScheduleSubscriptionPriceService {
  constructor(
    private readonly repository: SubscriptionRepository,
    private readonly pricing: SubscriptionPricingResolver,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: { subscriptionId: string; effectiveFrom: Date; source?: Exclude<SubscriptionPricingSource, "RESOLVED"> }): Promise<SubscriptionPrice> {
    const subscription = await this.repository.findById(input.subscriptionId);
    if (!subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Subscription does not exist.");
    if (input.effectiveFrom < this.clock.now()) throw new DomainValidationError("RETROACTIVE_SUBSCRIPTION_PRICE", "Contracted price changes cannot begin in the past.");
    const overlaps = await this.repository.findPriceOverlaps(input.subscriptionId, input.effectiveFrom, null);
    const closable = overlaps.filter((price) => price.props.effectiveRange.effectiveFrom < input.effectiveFrom && price.props.effectiveRange.contains(input.effectiveFrom));
    if (overlaps.length !== closable.length || closable.length > 1) throw new DomainConflictError("SUBSCRIPTION_PRICE_CONFLICT", "A contracted price already overlaps this period.");
    const breakdown = await this.pricing.resolvePrice({
      customerId: subscription.props.customerId.value, planId: subscription.props.planId.value,
      subscriptionId: subscription.props.id.value, billingInterval: subscription.props.billingInterval,
      effectiveAt: input.effectiveFrom,
    });
    const price = contractedPrice(this.ids, subscription.props.id, breakdown, input.effectiveFrom, input.source ?? "RENEWAL");
    await this.repository.publishPrice(price, closable[0]?.props.id.value ?? null);
    await this.audit.record({ action: AUDIT_ACTIONS.subscriptionPriceScheduled, entityType: "SUBSCRIPTION_PRICE", entityId: price.props.id.value, before: closable[0]?.props ?? null, after: price.props });
    return price;
  }
}

export class EntitlementService {
  constructor(private readonly repository: SubscriptionRepository, private readonly clock: Clock) {}

  async getEntitlements(customerId: string, at = this.clock.now()): Promise<CustomerEntitlements | null> {
    const subscription = await this.repository.findCurrentForCustomer(customerId) ??
      await this.repository.findLatestForCustomer(customerId);
    if (!subscription) return null;
    const valid = subscriptionAllowsService(subscription.props.status) &&
      (!subscription.props.currentPeriodEnd || subscription.props.currentPeriodEnd > at);
    const active = valid ? await this.repository.findEffectiveEntitlements(subscription.props.id.value, at) : [];
    const definitions = active.length > 0 ? active.map((item) => ({
      offeringCode: item.props.offeringCode.value, enabled: item.props.enabled,
      limitValue: item.props.limitValue, limitUnit: item.props.limitUnit,
    })) : await this.repository.findLatestEntitlementDefinitions(subscription.props.id.value);
    return Object.freeze({
      customerId, subscriptionId: subscription.props.id.value, subscriptionStatus: subscription.props.status,
      planId: subscription.props.planId.value, validUntil: subscription.props.currentPeriodEnd?.toISOString() ?? null,
      valid,
      entitlements: Object.freeze(Object.fromEntries(definitions.map((definition) => [definition.offeringCode, Object.freeze({
        enabled: valid && definition.enabled, limitValue: valid && definition.enabled ? definition.limitValue : null,
        limitUnit: valid && definition.enabled ? definition.limitUnit : null,
      })]))),
    });
  }

  async hasEntitlement(customerId: string, offeringCode: string): Promise<boolean> {
    return (await this.getEntitlements(customerId))?.entitlements[new StableCode(offeringCode).value]?.enabled ?? false;
  }

  async getUsageLimit(customerId: string, offeringCode: string) {
    const entitlement = (await this.getEntitlements(customerId))?.entitlements[new StableCode(offeringCode).value];
    return entitlement?.enabled ? { value: entitlement.limitValue, unit: entitlement.limitUnit } : null;
  }

  async validateSubscription(customerId: string): Promise<boolean> {
    return (await this.getEntitlements(customerId))?.valid ?? false;
  }
}

function contractedPrice(ids: IdGenerator, subscriptionId: EntityId, breakdown: PricingBreakdown, from: Date, source: SubscriptionPricingSource): SubscriptionPrice {
  const currency = breakdown.currency;
  return new SubscriptionPrice({
    id: new EntityId(ids.next()), subscriptionId,
    baseAmount: new Money(breakdown.basePriceMinor, currency),
    effectiveAmount: new Money(breakdown.subtotalMinor, currency),
    setupFee: new Money(breakdown.overrideSetupFeeMinor ?? breakdown.baseSetupFeeMinor, currency),
    discountTotal: new Money(breakdown.discountTotalMinor, currency), taxBehaviour: breakdown.taxBehaviour,
    effectiveRange: new EffectiveRange(from, null), pricingSource: source,
    pricingSnapshot: breakdown, createdAt: from,
  });
}
