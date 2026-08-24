import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";
import type { BillingInterval, PricingBreakdown, TaxBehaviour } from "../../pricing/domain/pricing.ts";

export const SUBSCRIPTION_STATUSES = [
  "PENDING", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type SubscriptionPricingSource = "QUOTE" | "RESOLVED" | "MANUAL" | "RENEWAL";

const TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  PENDING: ["TRIAL", "ACTIVE", "CANCELLED", "EXPIRED"],
  TRIAL: ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: [],
};

export type SubscriptionProps = {
  id: EntityId; customerId: EntityId; planId: EntityId; status: SubscriptionStatus;
  billingInterval: BillingInterval; currency: string; startedAt: Date | null;
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null; cancelAt: Date | null;
  cancelledAt: Date | null; trialEndsAt: Date | null; externalBillingProvider: string | null;
  externalCustomerId: string | null; externalSubscriptionId: string | null;
  version: number; createdAt: Date; updatedAt: Date;
};

export class Subscription {
  readonly props: Readonly<SubscriptionProps>;

  constructor(input: SubscriptionProps) {
    if (!SUBSCRIPTION_STATUSES.includes(input.status)) throw new DomainValidationError("INVALID_SUBSCRIPTION_STATUS", "Subscription status is invalid.");
    if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new DomainValidationError("INVALID_SUBSCRIPTION_VERSION", "Subscription version must be positive.");
    const currency = new Money(0, input.currency).currency;
    for (const [field, value] of Object.entries({
      startedAt: input.startedAt, currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd, cancelAt: input.cancelAt,
      cancelledAt: input.cancelledAt, trialEndsAt: input.trialEndsAt,
      createdAt: input.createdAt, updatedAt: input.updatedAt,
    })) if (value && !Number.isFinite(value.getTime())) throw new DomainValidationError("INVALID_DATE", `${field} must be a valid date.`);
    validateRange(input.currentPeriodStart, input.currentPeriodEnd, "subscription period");
    if (input.status === "TRIAL" && (!input.trialEndsAt || input.trialEndsAt <= input.createdAt)) {
      throw new DomainValidationError("INVALID_TRIAL_PERIOD", "Trial subscriptions require a future trial end.");
    }
    if ((input.status === "CANCELLED") !== (input.cancelledAt != null)) {
      throw new DomainValidationError("INVALID_CANCELLATION_STATE", "Cancelled subscriptions require cancelledAt exclusively.");
    }
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    const externalValues = [input.externalBillingProvider, input.externalCustomerId, input.externalSubscriptionId];
    if (externalValues.some((value) => value != null) && (!input.externalBillingProvider || !input.externalCustomerId)) {
      throw new DomainValidationError("INVALID_BILLING_REFERENCE", "External billing references require provider and customer identifiers.");
    }
    this.props = { ...input, currency };
  }

  transition(to: SubscriptionStatus, at: Date): Subscription {
    if (!TRANSITIONS[this.props.status].includes(to)) {
      throw new DomainConflictError("INVALID_SUBSCRIPTION_TRANSITION", `Cannot transition ${this.props.status} to ${to}.`);
    }
    if (!Number.isFinite(at.getTime()) || at < this.props.updatedAt) throw new DomainValidationError("RETROACTIVE_SUBSCRIPTION_TRANSITION", "Subscription transitions cannot move backwards in time.");
    return new Subscription({
      ...this.props,
      status: to,
      startedAt: this.props.startedAt ?? (to === "ACTIVE" || to === "TRIAL" ? at : null),
      cancelledAt: to === "CANCELLED" ? at : null,
      version: this.props.version + 1,
      updatedAt: at,
    });
  }

  reconcileProvider(to: SubscriptionStatus, periodStart: Date | null, periodEnd: Date | null, at: Date): Subscription {
    if (to !== this.props.status && !TRANSITIONS[this.props.status].includes(to)) throw new DomainConflictError("INVALID_SUBSCRIPTION_TRANSITION", `Cannot transition ${this.props.status} to ${to}.`);
    if (!Number.isFinite(at.getTime()) || at < this.props.updatedAt) throw new DomainValidationError("RETROACTIVE_SUBSCRIPTION_TRANSITION", "Subscription reconciliation cannot move backwards in time.");
    validateRange(periodStart, periodEnd, "subscription period");
    return new Subscription({
      ...this.props,
      status: to,
      startedAt: this.props.startedAt ?? (to === "ACTIVE" || to === "TRIAL" ? at : null),
      currentPeriodStart: periodStart ?? this.props.currentPeriodStart,
      currentPeriodEnd: periodEnd ?? this.props.currentPeriodEnd,
      cancelledAt: to === "CANCELLED" ? this.props.cancelledAt ?? at : null,
      version: this.props.version + 1,
      updatedAt: at,
    });
  }
}

export function subscriptionAllowsService(status: SubscriptionStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE" || status === "PAST_DUE";
}

export type SubscriptionPriceProps = {
  id: EntityId; subscriptionId: EntityId; baseAmount: Money; effectiveAmount: Money;
  setupFee: Money; discountTotal: Money; taxBehaviour: TaxBehaviour; effectiveRange: EffectiveRange;
  pricingSource: SubscriptionPricingSource; pricingSnapshot: Readonly<PricingBreakdown>;
  createdAt: Date;
};

export class SubscriptionPrice {
  readonly props: Readonly<SubscriptionPriceProps>;
  constructor(input: SubscriptionPriceProps) {
    const currencies = [input.baseAmount, input.effectiveAmount, input.setupFee, input.discountTotal]
      .map((money) => money.currency);
    if (currencies.some((currency) => currency !== currencies[0])) {
      throw new DomainValidationError("SUBSCRIPTION_PRICE_CURRENCY_MISMATCH", "Contracted price amounts must use one currency.");
    }
    if (!["QUOTE", "RESOLVED", "MANUAL", "RENEWAL"].includes(input.pricingSource)) {
      throw new DomainValidationError("INVALID_PRICING_SOURCE", "Subscription pricing source is invalid.");
    }
    const snapshotSetupFee = input.pricingSnapshot.overrideSetupFeeMinor ?? input.pricingSnapshot.baseSetupFeeMinor;
    if (input.baseAmount.amountMinor !== input.pricingSnapshot.basePriceMinor ||
      input.effectiveAmount.amountMinor !== input.pricingSnapshot.subtotalMinor ||
      input.setupFee.amountMinor !== snapshotSetupFee ||
      input.discountTotal.amountMinor !== input.pricingSnapshot.discountTotalMinor ||
      input.baseAmount.currency !== input.pricingSnapshot.currency ||
      input.taxBehaviour !== input.pricingSnapshot.taxBehaviour) {
      throw new DomainValidationError("SUBSCRIPTION_PRICE_SNAPSHOT_MISMATCH", "Contracted amounts must match their pricing snapshot.");
    }
    this.props = { ...input, pricingSnapshot: Object.freeze({ ...input.pricingSnapshot }) };
  }
}

export type SubscriptionEntitlementProps = {
  id: EntityId; subscriptionId: EntityId; offeringCode: StableCode; enabled: boolean;
  limitValue: number | null; limitUnit: string | null; effectiveRange: EffectiveRange;
  createdAt: Date; updatedAt: Date;
};

export class SubscriptionEntitlement {
  readonly props: Readonly<SubscriptionEntitlementProps>;
  constructor(input: SubscriptionEntitlementProps) {
    if (input.limitValue == null ? input.limitUnit != null :
      (!Number.isSafeInteger(input.limitValue) || input.limitValue < 0 || !input.limitUnit?.trim())) {
      throw new DomainValidationError("INVALID_ENTITLEMENT_LIMIT", "Entitlement limits require a non-negative value and unit together.");
    }
    if (!input.enabled && input.limitValue != null) {
      throw new DomainValidationError("DISABLED_ENTITLEMENT_HAS_LIMIT", "Disabled entitlements cannot grant a limit.");
    }
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = { ...input, limitUnit: input.limitUnit?.trim() ?? null };
  }
}

export type EntitlementDefinition = {
  offeringCode: string; enabled: boolean; limitValue: number | null; limitUnit: string | null;
};

export type CustomerEntitlements = {
  customerId: string; subscriptionId: string; subscriptionStatus: SubscriptionStatus;
  planId: string; validUntil: string | null; valid: boolean;
  entitlements: Readonly<Record<string, { enabled: boolean; limitValue: number | null; limitUnit: string | null }>>;
};

function validateRange(start: Date | null, end: Date | null, label: string): void {
  if ((start == null) !== (end == null) || (start && end && end <= start)) {
    throw new DomainValidationError("INVALID_DATE_RANGE", `${label} must have both dates and end after start.`);
  }
}
