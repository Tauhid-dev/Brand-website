import assert from "node:assert/strict";
import test from "node:test";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { EntityId, StableCode } from "../modules/shared/domain/value-objects.ts";
import { Subscription, SubscriptionEntitlement, SubscriptionPrice } from "../modules/subscription/domain/subscription.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const id = (suffix: string) => new EntityId(`80000000-0000-4000-8000-${suffix.padStart(12, "0")}`);

function subscription(status: ConstructorParameters<typeof Subscription>[0]["status"] = "ACTIVE") {
  return new Subscription({
    id: id("1"), customerId: id("2"), planId: id("3"), status, billingInterval: "MONTHLY",
    currency: "AUD", startedAt: NOW, currentPeriodStart: NOW,
    currentPeriodEnd: new Date("2026-09-23T00:00:00.000Z"), cancelAt: null,
    cancelledAt: status === "CANCELLED" ? NOW : null, trialEndsAt: status === "TRIAL" ? new Date("2026-08-30T00:00:00.000Z") : null,
    externalBillingProvider: null, externalCustomerId: null, externalSubscriptionId: null,
    version: 1, createdAt: NOW, updatedAt: NOW,
  });
}

test("subscription state machine permits controlled transitions and terminal states", () => {
  const suspended = subscription().transition("SUSPENDED", new Date("2026-08-24T00:00:00.000Z"));
  assert.equal(suspended.props.status, "SUSPENDED");
  assert.equal(suspended.props.version, 2);
  assert.equal(suspended.transition("ACTIVE", new Date("2026-08-25T00:00:00.000Z")).props.status, "ACTIVE");
  const cancelled = suspended.transition("CANCELLED", new Date("2026-08-25T00:00:00.000Z"));
  assert.equal(cancelled.props.cancelledAt?.toISOString(), "2026-08-25T00:00:00.000Z");
  assert.throws(() => cancelled.transition("ACTIVE", new Date("2026-08-26T00:00:00.000Z")), {
    code: "INVALID_SUBSCRIPTION_TRANSITION",
  });
});

test("contracted prices and entitlements enforce currency, range, and limit invariants", () => {
  const breakdown = {
    planId: id("3").value, customerId: id("2").value, billingInterval: "MONTHLY" as const,
    basePriceMinor: 64_900, baseSetupFeeMinor: 299_000, overridePriceMinor: null,
    overrideSetupFeeMinor: null, includesSetupFee: false, discounts: [], discountTotalMinor: 0,
    subtotalMinor: 64_900, taxMinor: 6_490, totalMinor: 71_390, currency: "AUD",
    taxBehaviour: "EXCLUSIVE" as const, basePriceVersionId: id("4").value,
    customerOverrideId: null, effectiveAt: NOW.toISOString(),
  };
  assert.throws(() => new SubscriptionPrice({
    id: id("5"), subscriptionId: id("1"), baseAmount: new Money(64_900, "AUD"),
    effectiveAmount: new Money(64_900, "USD"), setupFee: new Money(0, "AUD"),
    discountTotal: new Money(0, "AUD"), taxBehaviour: "EXCLUSIVE",
    effectiveRange: new EffectiveRange(NOW, null), pricingSource: "RESOLVED",
    pricingSnapshot: breakdown, createdAt: NOW,
  }), { code: "SUBSCRIPTION_PRICE_CURRENCY_MISMATCH" });
  assert.throws(() => new SubscriptionEntitlement({
    id: id("6"), subscriptionId: id("1"), offeringCode: new StableCode("ai_receptionist"),
    enabled: false, limitValue: 500, limitUnit: "conversations_per_month",
    effectiveRange: new EffectiveRange(NOW, null), createdAt: NOW, updatedAt: NOW,
  }), { code: "DISABLED_ENTITLEMENT_HAS_LIMIT" });
});
