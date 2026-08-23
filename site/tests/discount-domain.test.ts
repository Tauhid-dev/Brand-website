import assert from "node:assert/strict";
import test from "node:test";
import { CustomerDiscount, Discount, DiscountCalculator, customerDiscountRange, type DiscountProps } from "../modules/discount/domain/discount.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { EntityId, StableCode } from "../modules/shared/domain/value-objects.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
let sequence = 0;
const id = () => new EntityId(`50000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}`);

function discount(input: Partial<Omit<DiscountProps, "code">> & { code: string }): Discount {
  const { code, ...overrides } = input;
  return new Discount({
    id: id(), name: code, description: null,
    discountType: "PERCENTAGE", percentOffBasisPoints: 2_000, amountOff: null,
    durationType: "FOREVER", durationMonths: null, effectiveRange: new EffectiveRange(NOW, null),
    maxRedemptions: null, active: true, stackable: true, createdBy: "admin-1",
    createdAt: NOW, updatedAt: NOW, ...overrides, code: new StableCode(code),
  });
}

function assignment(value: Discount): CustomerDiscount {
  return new CustomerDiscount({
    id: id(), customerId: id(), discountId: value.props.id, subscriptionId: null, promotionCodeId: null, source: "ADMIN",
    effectiveRange: new EffectiveRange(NOW, null), status: "ACTIVE", appliedBy: "admin-1",
    reason: "Approved offer", createdAt: NOW, updatedAt: NOW,
  });
}

test("discount definitions enforce percentage, fixed currency, and duration invariants", () => {
  assert.throws(() => discount({ code: "invalid_percent", percentOffBasisPoints: 10_001 }), {
    code: "INVALID_PERCENTAGE_DISCOUNT",
  });
  const fixed = discount({
    code: "fixed_100", discountType: "FIXED_AMOUNT", percentOffBasisPoints: null,
    amountOff: new Money(10_000, "AUD"),
  });
  assert.throws(() => fixed.reductionFor(new Money(50_000, "USD")), {
    code: "DISCOUNT_CURRENCY_MISMATCH",
  });
  const repeating = discount({ code: "repeat_three", durationType: "REPEATING", durationMonths: 3 });
  assert.equal(customerDiscountRange(repeating, new Date("2026-08-31T00:00:00.000Z")).effectiveTo?.toISOString(),
    "2026-11-30T00:00:00.000Z");
});

test("stacking applies percentage before fixed and never discounts below zero", () => {
  const percentage = discount({ code: "welcome_20" });
  const fixed = discount({
    code: "fixed_100", discountType: "FIXED_AMOUNT", percentOffBasisPoints: null,
    amountOff: new Money(10_000, "AUD"),
  });
  const result = new DiscountCalculator().apply(new Money(64_900, "AUD"), [
    { assignment: assignment(fixed), discount: fixed },
    { assignment: assignment(percentage), discount: percentage },
  ]);
  assert.equal(result.total.amountMinor, 22_980);
  assert.deepEqual(result.applications.map((item) => item.discountCode), ["welcome_20", "fixed_100"]);
});

test("a better non-stackable offer wins without mixing policies", () => {
  const stackable = discount({ code: "small_stack", percentOffBasisPoints: 1_000 });
  const exclusive = discount({ code: "best_only", percentOffBasisPoints: 2_500, stackable: false });
  const result = new DiscountCalculator().apply(new Money(10_000, "AUD"), [
    { assignment: assignment(stackable), discount: stackable },
    { assignment: assignment(exclusive), discount: exclusive },
  ]);
  assert.equal(result.total.amountMinor, 2_500);
  assert.deepEqual(result.applications.map((item) => item.discountCode), ["best_only"]);
});
