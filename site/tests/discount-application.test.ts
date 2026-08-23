import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplyCustomerDiscountService,
  CreateDiscountService,
  CreatePromotionCodeService,
  DiscountPricingAdapter,
  RecordDiscountApplicationService,
  RedeemPromotionCodeService,
  ValidatePromotionCodeService,
} from "../modules/discount/application/discount-services.ts";
import type { PurchaseHistoryPort } from "../modules/discount/application/ports.ts";
import { D1DiscountRepository } from "../modules/discount/infrastructure/d1-discount-repository.ts";
import { PricingService } from "../modules/pricing/application/pricing-services.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { PlanPrice } from "../modules/pricing/domain/pricing.ts";
import { AustralianGstPolicy } from "../modules/pricing/domain/tax-policy.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const CUSTOMER_ONE = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_TWO = "00000000-0000-4000-8000-000000000002";
const PLAN_ID = "00000000-0000-4000-8000-000000000010";

class SequenceIds {
  private value = 100;
  next(): string {
    this.value += 1;
    return `60000000-0000-4000-8000-${this.value.toString().padStart(12, "0")}`;
  }
}

class PurchaseHistory implements PurchaseHistoryPort {
  constructor(private readonly customersWithPurchases = new Set<string>()) {}
  async hasPriorPurchase(customerId: string): Promise<boolean> {
    return this.customersWithPurchases.has(customerId);
  }
}

function setup() {
  const result = repositoryDatabase();
  result.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1),('00000000-0000-4000-8000-000000000002','customer-2','Example Electrical Pty Ltd','Alex Example','alex@example.invalid','ACTIVE','ADMIN',1,1)");
  result.client.database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  const ids = new SequenceIds();
  const clock = { now: () => NOW };
  const pricing = new D1PricingRepository(result.database);
  const discounts = new D1DiscountRepository(result.database);
  return { ...result, ids, clock, pricing, discounts };
}

async function percentageDiscount(context: ReturnType<typeof setup>, input: {
  code: string; percentage?: number; duration?: "ONCE" | "REPEATING" | "FOREVER"; stackable?: boolean;
}) {
  return new CreateDiscountService(context.discounts, context.ids, context.clock).execute({
    code: input.code, name: input.code, discountType: "PERCENTAGE",
    percentOffBasisPoints: input.percentage ?? 2_000, durationType: input.duration ?? "FOREVER",
    startsAt: NOW, stackable: input.stackable ?? true, createdBy: "admin-1",
  });
}

test("promotion validation normalises codes and enforces customer, plan, date, and first-purchase restrictions", async () => {
  const context = setup();
  const discount = await percentageDiscount(context, { code: "customer_welcome" });
  const promotion = await new CreatePromotionCodeService(
    context.discounts, context.pricing, { next: () => "UNUSED" }, context.ids, context.clock,
  ).execute({
    discountId: discount.props.id.value, code: "welcome-20", customerId: CUSTOMER_ONE,
    planId: PLAN_ID, startsAt: NOW, firstPurchaseOnly: true,
  });
  assert.equal(promotion.props.code.value, "WELCOME-20");

  const validate = new ValidatePromotionCodeService(
    context.discounts, context.pricing, new PurchaseHistory(new Set([CUSTOMER_TWO])), context.clock,
  );
  assert.equal((await validate.execute({ code: "welcome-20", customerId: CUSTOMER_ONE, planId: PLAN_ID })).discount.props.id.value,
    discount.props.id.value);
  await assert.rejects(validate.execute({
    code: "welcome-20", customerId: CUSTOMER_ONE, planId: "00000000-0000-4000-8000-000000000011",
  }), { code: "PROMOTION_PLAN_MISMATCH" });
  await assert.rejects(validate.execute({ code: "welcome-20", customerId: CUSTOMER_TWO, planId: PLAN_ID }), {
    code: "PROMOTION_CUSTOMER_MISMATCH",
  });
  const priorPurchaseValidation = new ValidatePromotionCodeService(
    context.discounts, context.pricing, new PurchaseHistory(new Set([CUSTOMER_ONE])), context.clock,
  );
  await assert.rejects(priorPurchaseValidation.execute({ code: "welcome-20", customerId: CUSTOMER_ONE, planId: PLAN_ID }), {
    code: "FIRST_PURCHASE_REQUIRED",
  });
  await new CreatePromotionCodeService(
    context.discounts, context.pricing, { next: () => "DISABLED20" }, context.ids, context.clock,
  ).execute({ discountId: discount.props.id.value, startsAt: NOW, active: false });
  await assert.rejects(validate.execute({ code: "disabled20", customerId: CUSTOMER_ONE, planId: PLAN_ID }), {
    code: "PROMOTION_CODE_INELIGIBLE",
  });
  context.client.close();
});

test("promotion claims are atomic, idempotent, and protected by database redemption limits", async () => {
  const context = setup();
  const discount = await percentageDiscount(context, { code: "launch_offer" });
  await new CreatePromotionCodeService(
    context.discounts, context.pricing, { next: () => "LAUNCH20" }, context.ids, context.clock,
  ).execute({ discountId: discount.props.id.value, startsAt: NOW, maxRedemptions: 1 });
  const validation = new ValidatePromotionCodeService(
    context.discounts, context.pricing, new PurchaseHistory(), context.clock,
  );
  const redeem = new RedeemPromotionCodeService(validation, context.discounts, context.ids, context.clock);
  const input = {
    code: "launch20", customerId: CUSTOMER_ONE, planId: PLAN_ID,
    idempotencyKey: "checkout-1", appliedBy: "customer-1", currency: "AUD",
  };
  await redeem.execute(input);
  assert.equal(context.client.database.prepare("select redemption_count from promotion_codes where code = 'LAUNCH20'").get()?.redemption_count, 1);
  await assert.rejects(redeem.execute(input), { code: "DUPLICATE_REDEMPTION" });
  await assert.rejects(redeem.execute({ ...input, customerId: CUSTOMER_TWO, idempotencyKey: "checkout-2" }), {
    code: "PROMOTION_CODE_INELIGIBLE",
  });
  assert.equal(context.client.database.prepare("select count(*) as count from customer_discounts").get()?.count, 1);
  context.client.close();
});

test("direct discounts feed the canonical pricing resolver before GST", async () => {
  const context = setup();
  await context.pricing.publishPlanPrice(new PlanPrice({
    id: new EntityId("00000000-0000-4000-8000-000000000020"), planId: new EntityId(PLAN_ID),
    billingInterval: "MONTHLY", amount: new Money(64_900, "AUD"), setupFee: new Money(0, "AUD"),
    taxBehaviour: "EXCLUSIVE", effectiveRange: new EffectiveRange(NOW, null), active: true,
    createdBy: "admin-1", createdAt: NOW,
  }), null);
  const percentage = await percentageDiscount(context, { code: "welcome_20", stackable: true });
  const fixed = await new CreateDiscountService(context.discounts, context.ids, context.clock).execute({
    code: "fixed_100", name: "Fixed $100", discountType: "FIXED_AMOUNT", amountOffMinor: 10_000,
    currency: "AUD", durationType: "FOREVER", startsAt: NOW, stackable: true, createdBy: "admin-1",
  });
  const apply = new ApplyCustomerDiscountService(context.discounts, context.pricing, context.ids, context.clock);
  await apply.execute({ customerId: CUSTOMER_ONE, discountId: percentage.props.id.value, effectiveFrom: NOW, source: "ADMIN", appliedBy: "admin-1", reason: "Launch concession" });
  await apply.execute({ customerId: CUSTOMER_ONE, discountId: fixed.props.id.value, effectiveFrom: NOW, source: "SALES", appliedBy: "sales-1", reason: "Signed proposal" });

  const result = await new PricingService(
    context.pricing, new AustralianGstPolicy(), new DiscountPricingAdapter(context.discounts),
  ).resolvePrice({ customerId: CUSTOMER_ONE, planId: PLAN_ID, billingInterval: "MONTHLY", effectiveAt: NOW });
  assert.deepEqual(
    [result.discountTotalMinor, result.subtotalMinor, result.taxMinor, result.totalMinor],
    [22_980, 41_920, 4_192, 46_112],
  );
  assert.deepEqual(result.discounts.map((item) => item.discountCode), ["welcome_20", "fixed_100"]);
  context.client.close();
});

test("once discounts stop resolving after their charge application is recorded", async () => {
  const context = setup();
  const discount = await percentageDiscount(context, { code: "once_only", duration: "ONCE" });
  const assignment = await new ApplyCustomerDiscountService(
    context.discounts, context.pricing, context.ids, context.clock,
  ).execute({ customerId: CUSTOMER_ONE, discountId: discount.props.id.value, effectiveFrom: NOW, source: "SYSTEM", appliedBy: "system", reason: "First charge credit" });
  const adapter = new DiscountPricingAdapter(context.discounts);
  assert.equal((await adapter.resolve({ customerId: CUSTOMER_ONE, planId: PLAN_ID, effectiveAt: NOW, charge: new Money(10_000, "AUD") })).total.amountMinor, 2_000);
  const record = new RecordDiscountApplicationService(context.discounts, context.ids, context.clock);
  const input = {
    discountId: discount.props.id.value, customerDiscountId: assignment.props.id.value,
    customerId: CUSTOMER_ONE, planId: PLAN_ID, idempotencyKey: "invoice-1-once",
    amountDiscountedMinor: 2_000, currency: "AUD",
  };
  await assert.rejects(record.execute({ ...input, amountDiscountedMinor: 0 }), {
    code: "INVALID_DISCOUNT_APPLICATION",
  });
  await record.execute(input);
  assert.equal((await adapter.resolve({ customerId: CUSTOMER_ONE, planId: PLAN_ID, effectiveAt: NOW, charge: new Money(10_000, "AUD") })).total.amountMinor, 0);
  await assert.rejects(record.execute(input), { code: "DUPLICATE_REDEMPTION" });
  await assert.rejects(record.execute({ ...input, idempotencyKey: "invoice-2-once" }), {
    code: "ONCE_DISCOUNT_ALREADY_USED",
  });
  context.client.close();
});
