import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import { EffectiveRange } from "../domain/effective-range.ts";
import { Money } from "../domain/money.ts";
import {
  CustomerPriceOverride,
  PlanPrice,
  PriceQuote,
  overrideStatusFor,
  type BillingInterval,
  type PricingBreakdown,
  type TaxBehaviour,
} from "../domain/pricing.ts";
import { AustralianGstPolicy, PUBLIC_PRICE_TAX_DISCLOSURE } from "../domain/tax-policy.ts";
import type { PricingReferenceRepository, PricingRepository } from "./ports.ts";

export type PublishPlanPriceInput = {
  planId: string;
  billingInterval: BillingInterval;
  amountMinor: number;
  setupFeeMinor: number;
  currency: string;
  taxBehaviour: TaxBehaviour;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  createdBy: string;
};

export class PublishPlanPriceService {
  constructor(
    private readonly prices: PricingRepository,
    private readonly references: PricingReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: PublishPlanPriceInput): Promise<PlanPrice> {
    const planId = new EntityId(input.planId);
    if (!await this.references.planExists(planId.value)) {
      throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    }
    const now = this.clock.now();
    if (input.effectiveFrom < now) {
      throw new DomainValidationError(
        "RETROACTIVE_PRICE_NOT_ALLOWED",
        "A new price version cannot begin in the past.",
      );
    }
    const range = new EffectiveRange(input.effectiveFrom, input.effectiveTo ?? null);
    const overlaps = await this.prices.findPlanPriceOverlaps(
      planId.value,
      input.billingInterval,
      range,
    );
    const closable = overlaps.filter((price) =>
      price.props.effectiveRange.effectiveFrom < range.effectiveFrom &&
      price.props.effectiveRange.contains(range.effectiveFrom)
    );
    if (overlaps.length !== closable.length || closable.length > 1) {
      throw new DomainConflictError(
        "PRICE_VERSION_CONFLICT",
        "A plan price already overlaps this effective period.",
      );
    }
    const price = new PlanPrice({
      id: new EntityId(this.ids.next()),
      planId,
      billingInterval: input.billingInterval,
      amount: new Money(input.amountMinor, input.currency),
      setupFee: new Money(input.setupFeeMinor, input.currency),
      taxBehaviour: input.taxBehaviour,
      effectiveRange: range,
      active: true,
      createdBy: input.createdBy,
      createdAt: now,
    });
    await this.prices.publishPlanPrice(price, closable[0]?.props.id.value ?? null);
    return price;
  }
}

export type CreatePriceOverrideInput = {
  customerId: string;
  planId: string;
  billingInterval: BillingInterval;
  amountMinor: number;
  setupFeeMinor: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  reason: string;
  createdBy: string;
};

export class CreatePriceOverrideService {
  constructor(
    private readonly prices: PricingRepository,
    private readonly references: PricingReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreatePriceOverrideInput): Promise<CustomerPriceOverride> {
    const customerId = new EntityId(input.customerId);
    const planId = new EntityId(input.planId);
    const [customerExists, planExists] = await Promise.all([
      this.references.customerExists(customerId.value),
      this.references.planExists(planId.value),
    ]);
    if (!customerExists) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (!planExists) throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    const now = this.clock.now();
    const range = new EffectiveRange(input.effectiveFrom, input.effectiveTo ?? null);
    if (range.effectiveTo != null && range.effectiveTo <= now) {
      throw new DomainValidationError("EXPIRED_OVERRIDE", "A new override cannot already be expired.");
    }
    const basePrice = await this.prices.findPlanPriceAt(
      planId.value,
      input.billingInterval,
      range.effectiveFrom,
    );
    if (!basePrice) {
      throw new DomainConflictError("PRICE_NOT_FOUND", "No plan price exists for the override start date.");
    }
    if (basePrice.props.amount.currency !== input.currency.trim().toUpperCase()) {
      throw new DomainConflictError(
        "PRICE_OVERRIDE_CURRENCY_MISMATCH",
        "The customer override currency does not match the plan price.",
      );
    }
    const overlaps = await this.prices.findCustomerOverrideOverlaps(
      customerId.value,
      planId.value,
      input.billingInterval,
      range,
    );
    if (overlaps.length > 0) {
      throw new DomainConflictError(
        "PRICE_OVERRIDE_CONFLICT",
        "An active or scheduled price override already overlaps this period.",
      );
    }
    const override = new CustomerPriceOverride({
      id: new EntityId(this.ids.next()),
      customerId,
      planId,
      billingInterval: input.billingInterval,
      amount: new Money(input.amountMinor, input.currency),
      setupFee: new Money(input.setupFeeMinor, input.currency),
      effectiveRange: range,
      reason: input.reason,
      status: overrideStatusFor(range, now),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.prices.saveCustomerOverride(override);
    return override;
  }
}

export class PricingService {
  constructor(
    private readonly prices: PricingRepository,
    private readonly taxPolicy: AustralianGstPolicy = new AustralianGstPolicy(),
  ) {}

  async resolvePrice(input: {
    customerId?: string | null;
    planId: string;
    billingInterval: BillingInterval;
    effectiveAt: Date;
    includeSetupFee?: boolean;
  }): Promise<PricingBreakdown> {
    if (!Number.isFinite(input.effectiveAt.getTime())) {
      throw new DomainValidationError("INVALID_EFFECTIVE_DATE", "Pricing date must be valid.");
    }
    const planId = new EntityId(input.planId);
    const customerId = input.customerId ? new EntityId(input.customerId) : null;
    const base = await this.prices.findPlanPriceAt(
      planId.value,
      input.billingInterval,
      input.effectiveAt,
    );
    if (!base) {
      throw new DomainConflictError("PRICE_NOT_FOUND", "No plan price is effective for this date.");
    }
    const override = customerId
      ? await this.prices.findCustomerOverrideAt(
          customerId.value,
          planId.value,
          input.billingInterval,
          input.effectiveAt,
        )
      : null;
    if (override && override.props.amount.currency !== base.props.amount.currency) {
      throw new DomainConflictError(
        "PRICE_OVERRIDE_CURRENCY_MISMATCH",
        "The customer override currency does not match the plan price.",
      );
    }
    const includeSetupFee = input.includeSetupFee ?? false;
    const charge = (override?.props.amount ?? base.props.amount).add(
      includeSetupFee
        ? override?.props.setupFee ?? base.props.setupFee
        : new Money(0, base.props.amount.currency),
    );
    const tax = this.taxPolicy.calculate(charge, base.props.taxBehaviour);
    return Object.freeze({
      planId: planId.value,
      customerId: customerId?.value ?? null,
      billingInterval: input.billingInterval,
      basePriceMinor: base.props.amount.amountMinor,
      baseSetupFeeMinor: base.props.setupFee.amountMinor,
      overridePriceMinor: override?.props.amount.amountMinor ?? null,
      overrideSetupFeeMinor: override?.props.setupFee.amountMinor ?? null,
      includesSetupFee: includeSetupFee,
      discountTotalMinor: 0 as const,
      subtotalMinor: tax.subtotal.amountMinor,
      taxMinor: tax.tax.amountMinor,
      totalMinor: tax.total.amountMinor,
      currency: base.props.amount.currency,
      taxBehaviour: base.props.taxBehaviour,
      basePriceVersionId: base.props.id.value,
      customerOverrideId: override?.props.id.value ?? null,
      effectiveAt: input.effectiveAt.toISOString(),
    });
  }
}

export class PreviewPriceService {
  constructor(private readonly pricing: PricingService) {}

  execute(input: Parameters<PricingService["resolvePrice"]>[0]): Promise<PricingBreakdown> {
    return this.pricing.resolvePrice(input);
  }
}

export class PublicPricingProvider {
  constructor(
    private readonly prices: PricingRepository,
    private readonly references: PricingReferenceRepository,
  ) {}

  async getPlanPrice(input: {
    planCode: string;
    billingInterval: BillingInterval;
    effectiveAt: Date;
  }): Promise<{
    planCode: string;
    planName: string;
    amountMinor: number;
    setupFeeMinor: number;
    currency: string;
    billingInterval: BillingInterval;
    taxBehaviour: TaxBehaviour;
    taxDisclosure: string;
  } | null> {
    const plan = await this.references.findActivePlanByCode(input.planCode.trim().toLowerCase());
    if (!plan) return null;
    const price = await this.prices.findPlanPriceAt(
      plan.id,
      input.billingInterval,
      input.effectiveAt,
    );
    return price ? {
      planCode: plan.code,
      planName: plan.name,
      amountMinor: price.props.amount.amountMinor,
      setupFeeMinor: price.props.setupFee.amountMinor,
      currency: price.props.amount.currency,
      billingInterval: price.props.billingInterval,
      taxBehaviour: price.props.taxBehaviour,
      taxDisclosure: PUBLIC_PRICE_TAX_DISCLOSURE,
    } : null;
  }
}

export class CreatePriceQuoteService {
  constructor(
    private readonly pricing: PricingService,
    private readonly prices: PricingRepository,
    private readonly references: PricingReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    customerId: string;
    planId: string;
    billingInterval: BillingInterval;
    effectiveAt: Date;
    includeSetupFee?: boolean;
    validForHours?: number;
    createdBy: string;
  }): Promise<PriceQuote> {
    const customerId = new EntityId(input.customerId);
    if (!await this.references.customerExists(customerId.value)) {
      throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    }
    const createdAt = this.clock.now();
    const validForHours = input.validForHours ?? 168;
    if (!Number.isSafeInteger(validForHours) || validForHours <= 0) {
      throw new DomainValidationError("INVALID_QUOTE_DURATION", "Quote duration must be positive hours.");
    }
    const breakdown = await this.pricing.resolvePrice({
      customerId: customerId.value,
      planId: input.planId,
      billingInterval: input.billingInterval,
      effectiveAt: input.effectiveAt,
      includeSetupFee: input.includeSetupFee,
    });
    const quote = new PriceQuote({
      id: new EntityId(this.ids.next()),
      customerId,
      planId: new EntityId(input.planId),
      billingInterval: input.billingInterval,
      breakdown,
      validUntil: new Date(createdAt.getTime() + validForHours * 3_600_000),
      createdBy: input.createdBy,
      createdAt,
    });
    await this.prices.saveQuote(quote);
    return quote;
  }
}
