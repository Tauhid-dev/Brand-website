import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";
import { EffectiveRange } from "./effective-range.ts";
import { Money } from "./money.ts";

export const BILLING_INTERVALS = ["MONTHLY", "ANNUAL"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const TAX_BEHAVIOURS = ["EXCLUSIVE", "INCLUSIVE", "EXEMPT"] as const;
export type TaxBehaviour = (typeof TAX_BEHAVIOURS)[number];

export type PlanPriceProps = {
  id: EntityId;
  planId: EntityId;
  billingInterval: BillingInterval;
  amount: Money;
  setupFee: Money;
  taxBehaviour: TaxBehaviour;
  effectiveRange: EffectiveRange;
  active: boolean;
  createdBy: string;
  createdAt: Date;
};

export class PlanPrice {
  readonly props: Readonly<PlanPriceProps>;

  constructor(input: PlanPriceProps) {
    validateBillingInterval(input.billingInterval);
    validateTaxBehaviour(input.taxBehaviour);
    if (input.amount.currency !== input.setupFee.currency) {
      throw new DomainValidationError("CURRENCY_MISMATCH", "Price and setup fee currencies must match.");
    }
    validateDate(input.createdAt, "createdAt");
    this.props = { ...input, createdBy: requireText(input.createdBy, "createdBy", 200) };
  }
}

export const PRICE_OVERRIDE_STATUSES = ["SCHEDULED", "ACTIVE", "EXPIRED", "REVOKED"] as const;
export type PriceOverrideStatus = (typeof PRICE_OVERRIDE_STATUSES)[number];

export type CustomerPriceOverrideProps = {
  id: EntityId;
  customerId: EntityId;
  planId: EntityId;
  billingInterval: BillingInterval;
  amount: Money;
  setupFee: Money;
  effectiveRange: EffectiveRange;
  reason: string;
  status: PriceOverrideStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class CustomerPriceOverride {
  readonly props: Readonly<CustomerPriceOverrideProps>;

  constructor(input: CustomerPriceOverrideProps) {
    validateBillingInterval(input.billingInterval);
    if (!PRICE_OVERRIDE_STATUSES.includes(input.status)) {
      throw new DomainValidationError("INVALID_OVERRIDE_STATUS", "Price override status is invalid.");
    }
    if (input.amount.currency !== input.setupFee.currency) {
      throw new DomainValidationError("CURRENCY_MISMATCH", "Override and setup fee currencies must match.");
    }
    validateDate(input.createdAt, "createdAt");
    validateDate(input.updatedAt, "updatedAt");
    if (input.updatedAt < input.createdAt) {
      throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    }
    this.props = {
      ...input,
      reason: requireText(input.reason, "reason", 1_000),
      createdBy: requireText(input.createdBy, "createdBy", 200),
    };
  }
}

export type PricingBreakdown = {
  planId: string;
  customerId: string | null;
  billingInterval: BillingInterval;
  basePriceMinor: number;
  baseSetupFeeMinor: number;
  overridePriceMinor: number | null;
  overrideSetupFeeMinor: number | null;
  includesSetupFee: boolean;
  discountTotalMinor: 0;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  taxBehaviour: TaxBehaviour;
  basePriceVersionId: string;
  customerOverrideId: string | null;
  effectiveAt: string;
};

export type PriceQuoteProps = {
  id: EntityId;
  customerId: EntityId;
  planId: EntityId;
  billingInterval: BillingInterval;
  breakdown: PricingBreakdown;
  validUntil: Date;
  createdBy: string;
  createdAt: Date;
};

export class PriceQuote {
  readonly props: Readonly<PriceQuoteProps>;

  constructor(input: PriceQuoteProps) {
    validateBillingInterval(input.billingInterval);
    validateDate(input.validUntil, "validUntil");
    validateDate(input.createdAt, "createdAt");
    if (input.validUntil <= input.createdAt) {
      throw new DomainValidationError("INVALID_QUOTE_VALIDITY", "Quote validity must be in the future.");
    }
    if (input.customerId.value !== input.breakdown.customerId || input.planId.value !== input.breakdown.planId) {
      throw new DomainValidationError("QUOTE_SCOPE_MISMATCH", "Quote scope must match its pricing snapshot.");
    }
    validatePricingBreakdown(input.breakdown, input.billingInterval);
    this.props = {
      ...input,
      breakdown: Object.freeze({ ...input.breakdown }),
      createdBy: requireText(input.createdBy, "createdBy", 200),
    };
  }
}

function validatePricingBreakdown(
  breakdown: PricingBreakdown,
  billingInterval: BillingInterval,
): void {
  if (breakdown.billingInterval !== billingInterval) {
    throw new DomainValidationError("QUOTE_INTERVAL_MISMATCH", "Quote interval must match its snapshot.");
  }
  validateTaxBehaviour(breakdown.taxBehaviour);
  const amounts = [
    breakdown.basePriceMinor,
    breakdown.baseSetupFeeMinor,
    breakdown.discountTotalMinor,
    breakdown.subtotalMinor,
    breakdown.taxMinor,
    breakdown.totalMinor,
    breakdown.overridePriceMinor ?? 0,
    breakdown.overrideSetupFeeMinor ?? 0,
  ];
  if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new DomainValidationError("INVALID_QUOTE_AMOUNT", "Quote amounts must be safe minor units.");
  }
  if (breakdown.totalMinor !== breakdown.subtotalMinor + breakdown.taxMinor) {
    throw new DomainValidationError("INVALID_QUOTE_TOTAL", "Quote total must equal subtotal plus tax.");
  }
  new Money(breakdown.totalMinor, breakdown.currency);
  new EntityId(breakdown.basePriceVersionId);
  if (breakdown.customerOverrideId) new EntityId(breakdown.customerOverrideId);
  if (!Number.isFinite(Date.parse(breakdown.effectiveAt))) {
    throw new DomainValidationError("INVALID_EFFECTIVE_DATE", "Quote effective date is invalid.");
  }
}

export function overrideStatusFor(range: EffectiveRange, at: Date): PriceOverrideStatus {
  if (range.contains(at)) return "ACTIVE";
  if (range.effectiveFrom > at) return "SCHEDULED";
  return "EXPIRED";
}

function validateBillingInterval(value: BillingInterval): void {
  if (!BILLING_INTERVALS.includes(value)) {
    throw new DomainValidationError("INVALID_BILLING_INTERVAL", "Billing interval is invalid.");
  }
}

function validateTaxBehaviour(value: TaxBehaviour): void {
  if (!TAX_BEHAVIOURS.includes(value)) {
    throw new DomainValidationError("INVALID_TAX_BEHAVIOUR", "Tax behaviour is invalid.");
  }
}

function validateDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new DomainValidationError("INVALID_DATE", `${field} must be a valid date.`);
  }
}
