import assert from "node:assert/strict";
import test from "node:test";
import {
  CreatePriceOverrideService,
  CreatePriceQuoteService,
  PricingService,
  PreviewPriceService,
  PublicPricingProvider,
  PublishPlanPriceService,
} from "../modules/pricing/application/pricing-services.ts";
import type { PricingReferenceRepository, PricingRepository } from "../modules/pricing/application/ports.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import {
  CustomerPriceOverride,
  PlanPrice,
  type BillingInterval,
  type PriceQuote,
} from "../modules/pricing/domain/pricing.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { NOOP_AUDIT } from "./support/audit.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000010";

class SequenceIds {
  private value = 100;
  next(): string {
    this.value += 1;
    return `00000000-0000-4000-8000-${this.value.toString().padStart(12, "0")}`;
  }
}

class MemoryPricing implements PricingRepository, PricingReferenceRepository {
  readonly planPrices: PlanPrice[] = [];
  readonly overrides: CustomerPriceOverride[] = [];
  readonly quotes: PriceQuote[] = [];
  planExists = async (id: string) => id === PLAN_ID;
  customerExists = async (id: string) => id === CUSTOMER_ID;
  findActivePlanByCode = async (code: string) => code === "growth_engine"
    ? { id: PLAN_ID, code, name: "Growth Engine" }
    : null;

  async findPlanPriceAt(planId: string, interval: BillingInterval, at: Date) {
    return this.planPrices.find((price) => price.props.planId.value === planId &&
      price.props.billingInterval === interval && price.props.active &&
      price.props.effectiveRange.contains(at)) ?? null;
  }
  async findPlanPriceOverlaps(planId: string, interval: BillingInterval, range: EffectiveRange) {
    return this.planPrices.filter((price) => price.props.planId.value === planId &&
      price.props.billingInterval === interval && price.props.effectiveRange.overlaps(range));
  }
  async publishPlanPrice(price: PlanPrice, closePriceId: string | null) {
    if (closePriceId) {
      const index = this.planPrices.findIndex((value) => value.props.id.value === closePriceId);
      const existing = this.planPrices[index];
      if (!existing) throw new Error("Missing price to close.");
      this.planPrices[index] = new PlanPrice({
        ...existing.props,
        effectiveRange: new EffectiveRange(
          existing.props.effectiveRange.effectiveFrom,
          price.props.effectiveRange.effectiveFrom,
        ),
      });
    }
    this.planPrices.push(price);
  }
  async findCustomerOverrideAt(customerId: string, planId: string, interval: BillingInterval, at: Date) {
    return this.overrides.find((value) => value.props.customerId.value === customerId &&
      value.props.planId.value === planId && value.props.billingInterval === interval &&
      ["SCHEDULED", "ACTIVE"].includes(value.props.status) &&
      value.props.effectiveRange.contains(at)) ?? null;
  }
  async findCustomerOverrideOverlaps(
    customerId: string,
    planId: string,
    interval: BillingInterval,
    range: EffectiveRange,
  ) {
    return this.overrides.filter((value) => value.props.customerId.value === customerId &&
      value.props.planId.value === planId && value.props.billingInterval === interval &&
      ["SCHEDULED", "ACTIVE"].includes(value.props.status) &&
      value.props.effectiveRange.overlaps(range));
  }
  async saveCustomerOverride(value: CustomerPriceOverride) { this.overrides.push(value); }
  async saveQuote(value: PriceQuote) { this.quotes.push(value); }
  async findQuoteById(id: string) {
    return this.quotes.find((value) => value.props.id.value === id) ?? null;
  }
}

function basePrice(range = new EffectiveRange(NOW, null)): PlanPrice {
  return new PlanPrice({
    id: new EntityId("00000000-0000-4000-8000-000000000020"),
    planId: new EntityId(PLAN_ID),
    billingInterval: "MONTHLY",
    amount: new Money(64_900, "AUD"),
    setupFee: new Money(299_000, "AUD"),
    taxBehaviour: "EXCLUSIVE",
    effectiveRange: range,
    active: true,
    createdBy: "admin-1",
    createdAt: NOW,
  });
}

test("publishing a new version closes the current price without changing its amount", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const service = new PublishPlanPriceService(
    repository,
    repository,
    new SequenceIds(),
    { now: () => NOW },
    NOOP_AUDIT,
  );
  const nextFrom = new Date("2026-09-01T00:00:00.000Z");
  await service.execute({
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    amountMinor: 69_900,
    setupFeeMinor: 299_000,
    currency: "AUD",
    taxBehaviour: "EXCLUSIVE",
    effectiveFrom: nextFrom,
    createdBy: "admin-1",
  });
  assert.equal(repository.planPrices[0]?.props.amount.amountMinor, 64_900);
  assert.equal(repository.planPrices[0]?.props.effectiveRange.effectiveTo?.toISOString(), nextFrom.toISOString());
  assert.equal(repository.planPrices[1]?.props.amount.amountMinor, 69_900);
});

test("publishing rejects a range that collides with a future version", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice(new EffectiveRange(
    new Date("2026-09-01T00:00:00.000Z"),
    null,
  )));
  const service = new PublishPlanPriceService(repository, repository, new SequenceIds(), { now: () => NOW }, NOOP_AUDIT);
  await assert.rejects(service.execute({
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    amountMinor: 69_900,
    setupFeeMinor: 299_000,
    currency: "AUD",
    taxBehaviour: "EXCLUSIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    createdBy: "admin-1",
  }), { code: "PRICE_VERSION_CONFLICT" });
});

test("single resolver applies customer override before GST", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const overrideService = new CreatePriceOverrideService(
    repository,
    repository,
    new SequenceIds(),
    { now: () => NOW },
    NOOP_AUDIT,
  );
  await overrideService.execute({
    customerId: CUSTOMER_ID,
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    amountMinor: 54_900,
    setupFeeMinor: 0,
    currency: "AUD",
    effectiveFrom: NOW,
    reason: "Negotiated annual commitment",
    createdBy: "admin-1",
  });
  const result = await new PricingService(repository).resolvePrice({
    customerId: CUSTOMER_ID,
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    effectiveAt: NOW,
  });
  assert.deepEqual(
    [result.basePriceMinor, result.overridePriceMinor, result.subtotalMinor, result.taxMinor, result.totalMinor],
    [64_900, 54_900, 54_900, 5_490, 60_390],
  );
});

test("overlapping customer overrides are rejected", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const service = new CreatePriceOverrideService(repository, repository, new SequenceIds(), { now: () => NOW }, NOOP_AUDIT);
  const input = {
    customerId: CUSTOMER_ID,
    planId: PLAN_ID,
    billingInterval: "MONTHLY" as const,
    amountMinor: 54_900,
    setupFeeMinor: 0,
    currency: "AUD",
    effectiveFrom: NOW,
    reason: "Negotiated agreement",
    createdBy: "admin-1",
  };
  await service.execute(input);
  await assert.rejects(service.execute({ ...input, amountMinor: 49_900 }), {
    code: "PRICE_OVERRIDE_CONFLICT",
  });
});

test("preview service uses the same resolver as committed quotes", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const preview = await new PreviewPriceService(new PricingService(repository)).execute({
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    effectiveAt: NOW,
  });
  assert.equal(preview.totalMinor, 71_390);
  assert.equal(preview.basePriceVersionId, "00000000-0000-4000-8000-000000000020");
});

test("quote service stores an immutable transparent snapshot", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const pricing = new PricingService(repository);
  const service = new CreatePriceQuoteService(
    pricing,
    repository,
    repository,
    new SequenceIds(),
    { now: () => NOW },
    NOOP_AUDIT,
  );
  const quote = await service.execute({
    customerId: CUSTOMER_ID,
    planId: PLAN_ID,
    billingInterval: "MONTHLY",
    effectiveAt: NOW,
    includeSetupFee: true,
    createdBy: "admin-1",
  });
  assert.equal(quote.props.breakdown.subtotalMinor, 363_900);
  assert.equal(quote.props.breakdown.taxMinor, 36_390);
  assert.equal(Object.isFrozen(quote.props.breakdown), true);
  assert.equal((await repository.findQuoteById(quote.props.id.value))?.props.breakdown.totalMinor, 400_290);
});

test("public pricing provider exposes only current public terms and disclosure", async () => {
  const repository = new MemoryPricing();
  repository.planPrices.push(basePrice());
  const result = await new PublicPricingProvider(repository, repository).getPlanPrice({
    planCode: "growth_engine",
    billingInterval: "MONTHLY",
    effectiveAt: NOW,
  });
  assert.equal(result?.amountMinor, 64_900);
  assert.equal(result?.planName, "Growth Engine");
  assert.match(result?.taxDisclosure ?? "", /exclude GST/);
  assert.equal("createdBy" in (result ?? {}), false);
});
