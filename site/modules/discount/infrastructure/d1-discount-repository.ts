import { and, eq, gt, inArray, isNull, lte, notExists, or } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  customerDiscounts,
  discountRedemptions,
  discounts,
  promotionCodes,
} from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";
import type { DiscountRepository } from "../application/ports.ts";
import {
  CustomerDiscount,
  Discount,
  PromotionCode,
  PromotionCodeValue,
  type CustomerDiscountSource,
  type CustomerDiscountStatus,
  type DiscountDuration,
  type DiscountRedemption,
  type DiscountType,
} from "../domain/discount.ts";

export class D1DiscountRepository implements DiscountRepository {
  constructor(private readonly db: AppDatabase) {}

  async findDiscountByCode(code: string): Promise<Discount | null> {
    const [row] = await this.db.select().from(discounts).where(eq(discounts.code, code)).limit(1);
    return row ? mapDiscount(row) : null;
  }
  async findDiscountById(id: string): Promise<Discount | null> {
    const [row] = await this.db.select().from(discounts).where(eq(discounts.id, id)).limit(1);
    return row ? mapDiscount(row) : null;
  }
  async saveDiscount(discount: Discount): Promise<void> {
    const value = discount.props;
    await this.db.insert(discounts).values({
      id: value.id.value, code: value.code.value, name: value.name, description: value.description,
      discountType: value.discountType, percentOffBasisPoints: value.percentOffBasisPoints,
      amountOffMinor: value.amountOff?.amountMinor ?? null, currency: value.amountOff?.currency ?? null,
      durationType: value.durationType, durationMonths: value.durationMonths,
      startsAt: value.effectiveRange.effectiveFrom, endsAt: value.effectiveRange.effectiveTo,
      maxRedemptions: value.maxRedemptions, active: value.active, stackable: value.stackable,
      createdBy: value.createdBy, createdAt: value.createdAt, updatedAt: value.updatedAt,
    });
  }

  async findPromotionByCode(code: string): Promise<{ promotion: PromotionCode; discount: Discount } | null> {
    const [row] = await this.db.select().from(promotionCodes)
      .where(eq(promotionCodes.code, code.toUpperCase())).limit(1);
    if (!row) return null;
    const discount = await this.findDiscountById(row.discountId);
    return discount ? { promotion: mapPromotion(row), discount } : null;
  }
  async savePromotionCode(promotion: PromotionCode): Promise<void> {
    const value = promotion.props;
    await this.db.insert(promotionCodes).values({
      id: value.id.value, discountId: value.discountId.value, code: value.code.value,
      active: value.active, customerId: value.customerId?.value ?? null, planId: value.planId?.value ?? null,
      startsAt: value.effectiveRange.effectiveFrom, expiresAt: value.effectiveRange.effectiveTo,
      maxRedemptions: value.maxRedemptions, redemptionCount: value.redemptionCount,
      firstPurchaseOnly: value.firstPurchaseOnly, createdAt: value.createdAt, updatedAt: value.updatedAt,
    });
  }
  async saveCustomerDiscount(assignment: CustomerDiscount): Promise<void> {
    try { await this.insertAssignment(assignment); } catch (error) { throw mapDiscountConflict(error); }
  }

  async findEligibleCustomerDiscounts(customerId: string, planId: string, at: Date, subscriptionId?: string | null) {
    const rows = await this.db.select({ assignment: customerDiscounts })
      .from(customerDiscounts)
      .innerJoin(discounts, eq(discounts.id, customerDiscounts.discountId))
      .leftJoin(promotionCodes, eq(promotionCodes.id, customerDiscounts.promotionCodeId))
      .where(and(
        eq(customerDiscounts.customerId, customerId),
        subscriptionId
          ? or(isNull(customerDiscounts.subscriptionId), eq(customerDiscounts.subscriptionId, subscriptionId))
          : isNull(customerDiscounts.subscriptionId),
        inArray(customerDiscounts.status, ["SCHEDULED", "ACTIVE"]),
        lte(customerDiscounts.effectiveFrom, at),
        or(isNull(customerDiscounts.effectiveTo), gt(customerDiscounts.effectiveTo, at)),
        eq(discounts.active, true),
        lte(discounts.startsAt, at),
        or(isNull(discounts.endsAt), gt(discounts.endsAt, at)),
        or(isNull(promotionCodes.planId), eq(promotionCodes.planId, planId)),
        or(
          eq(discounts.durationType, "REPEATING"),
          eq(discounts.durationType, "FOREVER"),
          notExists(this.db.select({ id: discountRedemptions.id }).from(discountRedemptions).where(and(
            eq(discountRedemptions.customerDiscountId, customerDiscounts.id),
            eq(discountRedemptions.redemptionType, "CHARGE_APPLICATION"),
          ))),
        ),
      ));
    const eligible = await Promise.all(rows.map(async (row) => {
      const assignment = mapCustomerDiscount(row.assignment);
      const discount = await this.findDiscountById(assignment.props.discountId.value);
      return discount ? { assignment, discount } : null;
    }));
    return eligible.filter((value) => value != null);
  }

  async claimPromotionCode(assignment: CustomerDiscount, redemption: DiscountRedemption): Promise<void> {
    try {
      await this.db.batch([this.insertAssignment(assignment), this.insertRedemption(redemption)]);
    } catch (error) {
      if (await this.redemptionExists(redemption.idempotencyKey)) throw duplicateRedemption();
      throw mapDiscountConflict(error);
    }
  }
  async saveChargeRedemption(redemption: DiscountRedemption): Promise<void> {
    try {
      await this.insertRedemption(redemption);
    } catch (error) {
      if (await this.redemptionExists(redemption.idempotencyKey)) throw duplicateRedemption();
      throw mapDiscountConflict(error);
    }
  }

  private async redemptionExists(idempotencyKey: string): Promise<boolean> {
    const [row] = await this.db.select({ id: discountRedemptions.id }).from(discountRedemptions)
      .where(eq(discountRedemptions.idempotencyKey, idempotencyKey)).limit(1);
    return row != null;
  }

  private insertAssignment(value: CustomerDiscount) {
    const props = value.props;
    return this.db.insert(customerDiscounts).values({
      id: props.id.value, customerId: props.customerId.value, discountId: props.discountId.value,
      subscriptionId: props.subscriptionId?.value ?? null,
      promotionCodeId: props.promotionCodeId?.value ?? null, source: props.source,
      effectiveFrom: props.effectiveRange.effectiveFrom, effectiveTo: props.effectiveRange.effectiveTo,
      status: props.status, appliedBy: props.appliedBy, reason: props.reason,
      createdAt: props.createdAt, updatedAt: props.updatedAt,
    });
  }
  private insertRedemption(value: DiscountRedemption) {
    return this.db.insert(discountRedemptions).values({
      id: value.id.value, discountId: value.discountId.value,
      promotionCodeId: value.promotionCodeId?.value ?? null, customerDiscountId: value.customerDiscountId.value,
      customerId: value.customerId.value, planId: value.planId.value, redemptionType: value.redemptionType,
      idempotencyKey: value.idempotencyKey, amountDiscountedMinor: value.amountDiscounted.amountMinor,
      currency: value.amountDiscounted.currency, redeemedAt: value.redeemedAt,
    });
  }
}

function mapDiscount(row: typeof discounts.$inferSelect): Discount {
  return new Discount({
    id: new EntityId(row.id), code: new StableCode(row.code), name: row.name, description: row.description,
    discountType: row.discountType as DiscountType, percentOffBasisPoints: row.percentOffBasisPoints,
    amountOff: row.amountOffMinor == null ? null : new Money(row.amountOffMinor, row.currency ?? ""),
    durationType: row.durationType as DiscountDuration, durationMonths: row.durationMonths,
    effectiveRange: new EffectiveRange(row.startsAt, row.endsAt), maxRedemptions: row.maxRedemptions,
    active: row.active, stackable: row.stackable, createdBy: row.createdBy,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapPromotion(row: typeof promotionCodes.$inferSelect): PromotionCode {
  return new PromotionCode({
    id: new EntityId(row.id), discountId: new EntityId(row.discountId), code: new PromotionCodeValue(row.code),
    active: row.active, customerId: row.customerId ? new EntityId(row.customerId) : null,
    planId: row.planId ? new EntityId(row.planId) : null,
    effectiveRange: new EffectiveRange(row.startsAt, row.expiresAt), maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount, firstPurchaseOnly: row.firstPurchaseOnly,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapCustomerDiscount(row: typeof customerDiscounts.$inferSelect): CustomerDiscount {
  return new CustomerDiscount({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId), discountId: new EntityId(row.discountId),
    subscriptionId: row.subscriptionId ? new EntityId(row.subscriptionId) : null,
    promotionCodeId: row.promotionCodeId ? new EntityId(row.promotionCodeId) : null,
    source: row.source as CustomerDiscountSource, effectiveRange: new EffectiveRange(row.effectiveFrom, row.effectiveTo),
    status: row.status as CustomerDiscountStatus, appliedBy: row.appliedBy, reason: row.reason,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapDiscountConflict(error: unknown): DomainConflictError {
  const mappings = [
    "PROMOTION_CODE_INELIGIBLE", "PROMOTION_ASSIGNMENT_MISMATCH", "DISCOUNT_APPLICATION_MISMATCH",
    "SUBSCRIPTION_DISCOUNT_CUSTOMER_MISMATCH", "SUBSCRIPTION_DISCOUNT_SCOPE_MISMATCH",
    "CUSTOMER_DISCOUNT_CONFLICT", "ONCE_DISCOUNT_ALREADY_USED",
  ];
  for (const code of mappings) if (errorChainIncludes(error, code)) return new DomainConflictError(code, "Discount redemption could not be completed.");
  if (errorChainIncludes(error, "UNIQUE constraint failed: discount_redemptions.idempotency_key")) {
    return new DomainConflictError("DUPLICATE_REDEMPTION", "This redemption was already processed.");
  }
  throw error;
}
function duplicateRedemption(): DomainConflictError {
  return new DomainConflictError("DUPLICATE_REDEMPTION", "This redemption was already processed.");
}
function errorChainIncludes(error: unknown, value: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes(value)) return true;
    current = current.cause;
  }
  return false;
}
