import assert from "node:assert/strict";
import test from "node:test";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { AustralianGstPolicy } from "../modules/pricing/domain/tax-policy.ts";
import { PriceQuote } from "../modules/pricing/domain/pricing.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";

test("Money accepts integer minor units and rejects floats or currency mixing", () => {
  assert.equal(new Money(64_900, "aud").currency, "AUD");
  assert.throws(() => new Money(649.5, "AUD"), { code: "INVALID_MONEY_AMOUNT" });
  assert.throws(() => new Money(100, "AUD").add(new Money(100, "USD")), {
    code: "CURRENCY_MISMATCH",
  });
});

test("effective ranges are half-open and detect overlap at boundaries", () => {
  const first = new EffectiveRange(
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-02-01T00:00:00.000Z"),
  );
  const adjacent = new EffectiveRange(new Date("2026-02-01T00:00:00.000Z"), null);
  assert.equal(first.contains(new Date("2026-01-01T00:00:00.000Z")), true);
  assert.equal(first.contains(new Date("2026-02-01T00:00:00.000Z")), false);
  assert.equal(first.overlaps(adjacent), false);
  assert.throws(() => new EffectiveRange(
    new Date("2026-02-01T00:00:00.000Z"),
    new Date("2026-01-01T00:00:00.000Z"),
  ), { code: "INVALID_EFFECTIVE_RANGE" });
});

test("Australian GST policy handles exclusive, inclusive, and exempt prices", () => {
  const policy = new AustralianGstPolicy();
  const exclusive = policy.calculate(new Money(54_900, "AUD"), "EXCLUSIVE");
  assert.deepEqual(
    [exclusive.subtotal.amountMinor, exclusive.tax.amountMinor, exclusive.total.amountMinor],
    [54_900, 5_490, 60_390],
  );
  const inclusive = policy.calculate(new Money(60_390, "AUD"), "INCLUSIVE");
  assert.deepEqual(
    [inclusive.subtotal.amountMinor, inclusive.tax.amountMinor, inclusive.total.amountMinor],
    [54_900, 5_490, 60_390],
  );
  assert.equal(policy.calculate(new Money(54_900, "AUD"), "EXEMPT").tax.amountMinor, 0);
});

test("quote domain rejects a snapshot whose arithmetic was altered", () => {
  assert.throws(() => new PriceQuote({
    id: new EntityId("00000000-0000-4000-8000-000000000001"),
    customerId: new EntityId("00000000-0000-4000-8000-000000000002"),
    planId: new EntityId("00000000-0000-4000-8000-000000000003"),
    billingInterval: "MONTHLY",
    breakdown: {
      planId: "00000000-0000-4000-8000-000000000003",
      customerId: "00000000-0000-4000-8000-000000000002",
      billingInterval: "MONTHLY",
      basePriceMinor: 100,
      baseSetupFeeMinor: 0,
      overridePriceMinor: null,
      overrideSetupFeeMinor: null,
      includesSetupFee: false,
      discounts: [],
      discountTotalMinor: 0,
      subtotalMinor: 100,
      taxMinor: 10,
      totalMinor: 999,
      currency: "AUD",
      taxBehaviour: "EXCLUSIVE",
      basePriceVersionId: "00000000-0000-4000-8000-000000000004",
      customerOverrideId: null,
      effectiveAt: "2026-08-23T00:00:00.000Z",
    },
    validUntil: new Date("2026-08-24T00:00:00.000Z"),
    createdBy: "admin-1",
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
  }), { code: "INVALID_QUOTE_TOTAL" });
});
