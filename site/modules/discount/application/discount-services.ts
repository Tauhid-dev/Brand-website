import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { PricingReferenceRepository } from "../../pricing/application/ports.ts";
import { EffectiveRange } from "../../pricing/domain/effective-range.ts";
import { Money } from "../../pricing/domain/money.ts";
import {
  CustomerDiscount,
  Discount,
  DiscountCalculator,
  PromotionCode,
  PromotionCodeValue,
  createDiscountRedemption,
  customerDiscountRange,
  customerDiscountStatus,
  type CustomerDiscountSource,
  type DiscountDuration,
  type DiscountType,
} from "../domain/discount.ts";
import type {
  DiscountPricingPort,
  DiscountRepository,
  PromotionCodeGeneratorPort,
  PurchaseHistoryPort,
} from "./ports.ts";

export class CryptoPromotionCodeGenerator implements PromotionCodeGeneratorPort {
  next(): string {
    return crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  }
}

export class CreateDiscountService {
  constructor(private readonly repository: DiscountRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: {
    code: string; name: string; description?: string | null; discountType: DiscountType;
    percentOffBasisPoints?: number | null; amountOffMinor?: number | null; currency?: string | null;
    durationType: DiscountDuration; durationMonths?: number | null; startsAt: Date; endsAt?: Date | null;
    maxRedemptions?: number | null; active?: boolean; stackable?: boolean; createdBy: string;
  }): Promise<Discount> {
    const code = new StableCode(input.code);
    if (await this.repository.findDiscountByCode(code.value)) throw new DomainConflictError("DISCOUNT_CODE_EXISTS", "Discount code already exists.");
    const now = this.clock.now();
    const discount = new Discount({
      id: new EntityId(this.ids.next()), code, name: input.name, description: input.description ?? null,
      discountType: input.discountType, percentOffBasisPoints: input.percentOffBasisPoints ?? null,
      amountOff: input.amountOffMinor == null ? null : new Money(input.amountOffMinor, input.currency ?? ""),
      durationType: input.durationType, durationMonths: input.durationMonths ?? null,
      effectiveRange: new EffectiveRange(input.startsAt, input.endsAt ?? null),
      maxRedemptions: input.maxRedemptions ?? null, active: input.active ?? true,
      stackable: input.stackable ?? false, createdBy: input.createdBy, createdAt: now, updatedAt: now,
    });
    await this.repository.saveDiscount(discount);
    await this.audit.record({ action: AUDIT_ACTIONS.discountCreated, entityType: "DISCOUNT", entityId: discount.props.id.value, after: discount.props });
    return discount;
  }
}

export class CreatePromotionCodeService {
  constructor(
    private readonly repository: DiscountRepository,
    private readonly references: PricingReferenceRepository,
    private readonly generator: PromotionCodeGeneratorPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}
  async execute(input: {
    discountId: string; code?: string | null; customerId?: string | null; planId?: string | null;
    startsAt: Date; expiresAt?: Date | null; maxRedemptions?: number | null;
    firstPurchaseOnly?: boolean; active?: boolean;
  }): Promise<PromotionCode> {
    const discountId = new EntityId(input.discountId);
    if (!await this.repository.findDiscountById(discountId.value)) throw new DomainConflictError("DISCOUNT_NOT_FOUND", "Discount does not exist.");
    if (input.customerId && !await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (input.planId && !await this.references.planExists(input.planId)) throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    const code = new PromotionCodeValue(input.code ?? this.generator.next());
    if (await this.repository.findPromotionByCode(code.value)) throw new DomainConflictError("PROMOTION_CODE_EXISTS", "Promotion code already exists.");
    const now = this.clock.now();
    const promotion = new PromotionCode({
      id: new EntityId(this.ids.next()), discountId, code, active: input.active ?? true,
      customerId: input.customerId ? new EntityId(input.customerId) : null,
      planId: input.planId ? new EntityId(input.planId) : null,
      effectiveRange: new EffectiveRange(input.startsAt, input.expiresAt ?? null),
      maxRedemptions: input.maxRedemptions ?? null, redemptionCount: 0,
      firstPurchaseOnly: input.firstPurchaseOnly ?? false, createdAt: now, updatedAt: now,
    });
    await this.repository.savePromotionCode(promotion);
    await this.audit.record({ action: AUDIT_ACTIONS.promotionCodeCreated, entityType: "PROMOTION_CODE", entityId: promotion.props.id.value, after: promotion.props });
    return promotion;
  }
}

export class ApplyCustomerDiscountService {
  constructor(private readonly repository: DiscountRepository, private readonly references: PricingReferenceRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { customerId: string; discountId: string; subscriptionId?: string | null; effectiveFrom: Date; source: Exclude<CustomerDiscountSource, "PROMOTION_CODE">; appliedBy: string; reason: string }): Promise<CustomerDiscount> {
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    const discount = await this.repository.findDiscountById(input.discountId);
    if (!discount) throw new DomainConflictError("DISCOUNT_NOT_FOUND", "Discount does not exist.");
    const now = this.clock.now();
    const range = customerDiscountRange(discount, input.effectiveFrom);
    const assignment = new CustomerDiscount({
      id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId), discountId: discount.props.id,
      subscriptionId: input.subscriptionId ? new EntityId(input.subscriptionId) : null,
      promotionCodeId: null, source: input.source, effectiveRange: range,
      status: customerDiscountStatus(range, now), appliedBy: input.appliedBy, reason: input.reason,
      createdAt: now, updatedAt: now,
    });
    await this.repository.saveCustomerDiscount(assignment);
    await this.audit.record({ action: AUDIT_ACTIONS.customerDiscountApplied, entityType: "CUSTOMER_DISCOUNT", entityId: assignment.props.id.value, after: assignment.props });
    return assignment;
  }
}

export class ValidatePromotionCodeService {
  constructor(
    private readonly repository: DiscountRepository, private readonly references: PricingReferenceRepository,
    private readonly purchaseHistory: PurchaseHistoryPort, private readonly clock: Clock,
  ) {}
  async execute(input: { code: string; customerId: string; planId: string }): Promise<{ promotion: PromotionCode; discount: Discount }> {
    const result = await this.repository.findPromotionByCode(new PromotionCodeValue(input.code).value);
    if (!result) throw new DomainConflictError("PROMOTION_CODE_NOT_FOUND", "Promotion code does not exist.");
    const { promotion, discount } = result;
    const now = this.clock.now();
    if (!promotion.props.active || !promotion.props.effectiveRange.contains(now) || !discount.props.active || !discount.props.effectiveRange.contains(now)) {
      throw new DomainConflictError("PROMOTION_CODE_INELIGIBLE", "Promotion code is inactive or outside its valid dates.");
    }
    if (promotion.props.customerId && promotion.props.customerId.value !== input.customerId) throw new DomainConflictError("PROMOTION_CUSTOMER_MISMATCH", "Promotion code is restricted to another customer.");
    if (promotion.props.planId && promotion.props.planId.value !== input.planId) throw new DomainConflictError("PROMOTION_PLAN_MISMATCH", "Promotion code is restricted to another plan.");
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (!await this.references.planExists(input.planId)) throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    if (promotion.props.firstPurchaseOnly && await this.purchaseHistory.hasPriorPurchase(input.customerId)) throw new DomainConflictError("FIRST_PURCHASE_REQUIRED", "Promotion code is limited to first purchases.");
    return result;
  }
}

export class RedeemPromotionCodeService {
  constructor(
    private readonly validation: ValidatePromotionCodeService,
    private readonly repository: DiscountRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}
  async execute(input: { code: string; customerId: string; planId: string; subscriptionId?: string | null; idempotencyKey: string; appliedBy: string; currency: string }): Promise<CustomerDiscount> {
    const { promotion, discount } = await this.validation.execute(input);
    const now = this.clock.now();
    const range = customerDiscountRange(discount, now);
    const assignment = new CustomerDiscount({
      id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId), discountId: discount.props.id,
      subscriptionId: input.subscriptionId ? new EntityId(input.subscriptionId) : null,
      promotionCodeId: promotion.props.id, source: "PROMOTION_CODE", effectiveRange: range, status: "ACTIVE",
      appliedBy: input.appliedBy, reason: `Promotion code ${promotion.props.code.value}`, createdAt: now, updatedAt: now,
    });
    const redemption = createDiscountRedemption({
      id: new EntityId(this.ids.next()), discountId: discount.props.id, promotionCodeId: promotion.props.id,
      customerDiscountId: assignment.props.id, customerId: assignment.props.customerId, planId: new EntityId(input.planId),
      redemptionType: "PROMOTION_CLAIM", idempotencyKey: input.idempotencyKey,
      amountDiscounted: new Money(0, input.currency), redeemedAt: now,
    });
    await this.repository.claimPromotionCode(assignment, redemption);
    await this.audit.record({ action: AUDIT_ACTIONS.promotionCodeRedeemed, entityType: "PROMOTION_CODE", entityId: promotion.props.id.value, after: { assignment: assignment.props, redemption } });
    return assignment;
  }
}

export class RecordDiscountApplicationService {
  constructor(private readonly repository: DiscountRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: {
    discountId: string; promotionCodeId?: string | null; customerDiscountId: string;
    customerId: string; planId: string; idempotencyKey: string; amountDiscountedMinor: number; currency: string;
  }): Promise<void> {
    const redemption = createDiscountRedemption({
      id: new EntityId(this.ids.next()), discountId: new EntityId(input.discountId),
      promotionCodeId: input.promotionCodeId ? new EntityId(input.promotionCodeId) : null,
      customerDiscountId: new EntityId(input.customerDiscountId), customerId: new EntityId(input.customerId),
      planId: new EntityId(input.planId), redemptionType: "CHARGE_APPLICATION",
      idempotencyKey: input.idempotencyKey,
      amountDiscounted: new Money(input.amountDiscountedMinor, input.currency), redeemedAt: this.clock.now(),
    });
    await this.repository.saveChargeRedemption(redemption);
    await this.audit.record({ action: AUDIT_ACTIONS.discountApplicationRecorded, entityType: "DISCOUNT_REDEMPTION", entityId: redemption.id.value, after: redemption });
  }
}

export class DiscountPricingAdapter implements DiscountPricingPort {
  constructor(private readonly repository: DiscountRepository, private readonly calculator: DiscountCalculator = new DiscountCalculator()) {}
  async resolve(input: { customerId: string; planId: string; subscriptionId?: string | null; effectiveAt: Date; charge: Money }) {
    const eligible = await this.repository.findEligibleCustomerDiscounts(input.customerId, input.planId, input.effectiveAt, input.subscriptionId);
    return this.calculator.apply(input.charge, eligible);
  }
}
