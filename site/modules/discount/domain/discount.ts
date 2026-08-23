import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";

export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";
export type DiscountDuration = "ONCE" | "REPEATING" | "FOREVER";
export type CustomerDiscountSource = "ADMIN" | "PROMOTION_CODE" | "SALES" | "MIGRATION" | "SYSTEM";
export type CustomerDiscountStatus = "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REVOKED";

export type DiscountProps = {
  id: EntityId;
  code: StableCode;
  name: string;
  description: string | null;
  discountType: DiscountType;
  percentOffBasisPoints: number | null;
  amountOff: Money | null;
  durationType: DiscountDuration;
  durationMonths: number | null;
  effectiveRange: EffectiveRange;
  maxRedemptions: number | null;
  active: boolean;
  stackable: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class Discount {
  readonly props: Readonly<DiscountProps>;
  constructor(input: DiscountProps) {
    if (input.discountType === "PERCENTAGE") {
      if (!Number.isInteger(input.percentOffBasisPoints) || (input.percentOffBasisPoints ?? 0) <= 0 ||
          (input.percentOffBasisPoints ?? 0) > 10_000 || input.amountOff != null) {
        throw new DomainValidationError("INVALID_PERCENTAGE_DISCOUNT", "Percentage discounts require 1–10000 basis points only.");
      }
    } else if (input.discountType === "FIXED_AMOUNT") {
      if (!input.amountOff || input.amountOff.amountMinor <= 0 || input.percentOffBasisPoints != null) {
        throw new DomainValidationError("INVALID_FIXED_DISCOUNT", "Fixed discounts require a positive money amount only.");
      }
    } else {
      throw new DomainValidationError("INVALID_DISCOUNT_TYPE", "Discount type is invalid.");
    }
    if (input.durationType === "REPEATING") requirePositiveInteger(input.durationMonths, "durationMonths");
    else if ((input.durationType === "ONCE" || input.durationType === "FOREVER") && input.durationMonths != null) {
      throw new DomainValidationError("INVALID_DISCOUNT_DURATION", "Only repeating discounts define durationMonths.");
    } else if (!["ONCE", "FOREVER"].includes(input.durationType)) {
      throw new DomainValidationError("INVALID_DISCOUNT_DURATION", "Discount duration is invalid.");
    }
    if (input.maxRedemptions != null) requirePositiveInteger(input.maxRedemptions, "maxRedemptions");
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = {
      ...input,
      name: requireText(input.name, "discount name", 160),
      description: optionalText(input.description, "discount description", 2_000),
      createdBy: requireText(input.createdBy, "createdBy", 200),
    };
  }

  reductionFor(charge: Money): Money {
    if (this.props.discountType === "PERCENTAGE") {
      return charge.multiplyBasisPoints(this.props.percentOffBasisPoints ?? 0);
    }
    const amount = this.props.amountOff;
    if (!amount) throw new DomainValidationError("INVALID_FIXED_DISCOUNT", "Fixed discount is incomplete.");
    if (amount.currency !== charge.currency) {
      throw new DomainValidationError("DISCOUNT_CURRENCY_MISMATCH", "Fixed discount currency does not match the price.");
    }
    return amount.amountMinor > charge.amountMinor ? charge : amount;
  }
}

export class PromotionCodeValue {
  readonly value: string;
  constructor(value: string) {
    const normalised = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(normalised)) {
      throw new DomainValidationError("INVALID_PROMOTION_CODE", "Promotion code must be 3–64 letters, numbers, underscores or hyphens.");
    }
    this.value = normalised;
  }
}

export type PromotionCodeProps = {
  id: EntityId; discountId: EntityId; code: PromotionCodeValue; active: boolean;
  customerId: EntityId | null; planId: EntityId | null; effectiveRange: EffectiveRange;
  maxRedemptions: number | null; redemptionCount: number; firstPurchaseOnly: boolean;
  createdAt: Date; updatedAt: Date;
};

export class PromotionCode {
  readonly props: Readonly<PromotionCodeProps>;
  constructor(input: PromotionCodeProps) {
    if (!Number.isSafeInteger(input.redemptionCount) || input.redemptionCount < 0) {
      throw new DomainValidationError("INVALID_REDEMPTION_COUNT", "Redemption count must be non-negative.");
    }
    if (input.maxRedemptions != null) {
      requirePositiveInteger(input.maxRedemptions, "maxRedemptions");
      if (input.redemptionCount > input.maxRedemptions) throw new DomainValidationError("REDEMPTION_LIMIT_EXCEEDED", "Redemption count exceeds its limit.");
    }
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = { ...input };
  }
}

export type CustomerDiscountProps = {
  id: EntityId; customerId: EntityId; discountId: EntityId; subscriptionId: EntityId | null;
  promotionCodeId: EntityId | null;
  source: CustomerDiscountSource; effectiveRange: EffectiveRange; status: CustomerDiscountStatus;
  appliedBy: string; reason: string; createdAt: Date; updatedAt: Date;
};

export class CustomerDiscount {
  readonly props: Readonly<CustomerDiscountProps>;
  constructor(input: CustomerDiscountProps) {
    if (!["ADMIN", "PROMOTION_CODE", "SALES", "MIGRATION", "SYSTEM"].includes(input.source)) {
      throw new DomainValidationError("INVALID_DISCOUNT_SOURCE", "Customer discount source is invalid.");
    }
    if (!["SCHEDULED", "ACTIVE", "EXPIRED", "REVOKED"].includes(input.status)) {
      throw new DomainValidationError("INVALID_CUSTOMER_DISCOUNT_STATUS", "Customer discount status is invalid.");
    }
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = { ...input, appliedBy: requireText(input.appliedBy, "appliedBy", 200), reason: requireText(input.reason, "reason", 1_000) };
  }
}

export type DiscountRedemption = {
  id: EntityId;
  discountId: EntityId;
  promotionCodeId: EntityId | null;
  customerDiscountId: EntityId;
  customerId: EntityId;
  planId: EntityId;
  redemptionType: "PROMOTION_CLAIM" | "CHARGE_APPLICATION";
  idempotencyKey: string;
  amountDiscounted: Money;
  redeemedAt: Date;
};

export function createDiscountRedemption(input: DiscountRedemption): DiscountRedemption {
  if (input.redemptionType === "PROMOTION_CLAIM" &&
      (!input.promotionCodeId || input.amountDiscounted.amountMinor !== 0)) {
    throw new DomainValidationError("INVALID_PROMOTION_CLAIM", "Promotion claims require a code and zero charge amount.");
  }
  if (input.redemptionType === "CHARGE_APPLICATION" && input.amountDiscounted.amountMinor <= 0) {
    throw new DomainValidationError("INVALID_DISCOUNT_APPLICATION", "Charge applications require a positive discounted amount.");
  }
  return { ...input, idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey", 200) };
}

export type EligibleDiscount = { assignment: CustomerDiscount; discount: Discount };
export type DiscountApplication = { customerDiscountId: string; discountCode: string; amountMinor: number };

export class DiscountCalculator {
  apply(charge: Money, eligible: readonly EligibleDiscount[]): { total: Money; applications: DiscountApplication[] } {
    const stackable = eligible.filter((item) => item.discount.props.stackable);
    const nonStackable = eligible.filter((item) => !item.discount.props.stackable);
    let remaining = charge;
    const stackApplications: DiscountApplication[] = [];
    for (const item of [...stackable].sort((a, b) => {
      const typeOrder = Number(a.discount.props.discountType === "FIXED_AMOUNT") - Number(b.discount.props.discountType === "FIXED_AMOUNT");
      return typeOrder || a.discount.props.code.value.localeCompare(b.discount.props.code.value);
    })) {
      const reduction = item.discount.reductionFor(remaining);
      remaining = remaining.subtract(reduction);
      stackApplications.push(application(item, reduction));
    }
    const stackTotal = charge.amountMinor - remaining.amountMinor;
    const bestSingle = nonStackable
      .map((item) => ({ item, reduction: item.discount.reductionFor(charge) }))
      .sort((a, b) => b.reduction.amountMinor - a.reduction.amountMinor ||
        a.item.discount.props.code.value.localeCompare(b.item.discount.props.code.value))[0];
    if (bestSingle && bestSingle.reduction.amountMinor > stackTotal) {
      return { total: bestSingle.reduction, applications: [application(bestSingle.item, bestSingle.reduction)] };
    }
    return { total: new Money(stackTotal, charge.currency), applications: stackApplications };
  }
}

export function customerDiscountRange(discount: Discount, effectiveFrom: Date): EffectiveRange {
  if (discount.props.durationType !== "REPEATING") return new EffectiveRange(effectiveFrom, null);
  const end = new Date(effectiveFrom);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (discount.props.durationMonths ?? 0));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return new EffectiveRange(effectiveFrom, end);
}

export function customerDiscountStatus(range: EffectiveRange, at: Date): CustomerDiscountStatus {
  if (range.contains(at)) return "ACTIVE";
  if (range.effectiveFrom > at) return "SCHEDULED";
  return "EXPIRED";
}

function application(item: EligibleDiscount, reduction: Money): DiscountApplication {
  return { customerDiscountId: item.assignment.props.id.value, discountCode: item.discount.props.code.value, amountMinor: reduction.amountMinor };
}

function requirePositiveInteger(value: number | null, field: string): void {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new DomainValidationError("INVALID_POSITIVE_INTEGER", `${field} must be a positive integer.`);
  }
}
