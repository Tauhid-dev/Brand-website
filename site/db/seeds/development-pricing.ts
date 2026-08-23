import type { CatalogueRepository } from "../../modules/catalogue/application/ports.ts";
import type { PricingRepository } from "../../modules/pricing/application/ports.ts";
import { EffectiveRange } from "../../modules/pricing/domain/effective-range.ts";
import { Money } from "../../modules/pricing/domain/money.ts";
import { PlanPrice } from "../../modules/pricing/domain/pricing.ts";
import { EntityId } from "../../modules/shared/domain/value-objects.ts";

const DEVELOPMENT_PRICE_INSTANT = new Date("2026-01-01T00:00:00.000Z");

export const DEVELOPMENT_PRICE_FIXTURES = [
  { planCode: "essential_presence", amountMinor: 24_900, setupFeeMinor: 149_000 },
  { planCode: "growth_engine", amountMinor: 64_900, setupFeeMinor: 299_000 },
  { planCode: "market_leader", amountMinor: 129_000, setupFeeMinor: 549_000 },
  { planCode: "custom_multi_location", amountMinor: 249_000, setupFeeMinor: 0 },
] as const;

export async function seedDevelopmentPrices(
  catalogue: CatalogueRepository,
  pricing: PricingRepository,
): Promise<void> {
  for (const [index, fixture] of DEVELOPMENT_PRICE_FIXTURES.entries()) {
    const plan = await catalogue.findPlanByCode(fixture.planCode);
    if (!plan) throw new Error(`Development plan ${fixture.planCode} must be seeded first.`);
    const existing = await pricing.findPlanPriceAt(plan.props.id.value, "MONTHLY", DEVELOPMENT_PRICE_INSTANT);
    if (existing) continue;
    await pricing.publishPlanPrice(new PlanPrice({
      id: fixtureId(index + 1),
      planId: plan.props.id,
      billingInterval: "MONTHLY",
      amount: new Money(fixture.amountMinor, "AUD"),
      setupFee: new Money(fixture.setupFeeMinor, "AUD"),
      taxBehaviour: "EXCLUSIVE",
      effectiveRange: new EffectiveRange(DEVELOPMENT_PRICE_INSTANT, null),
      active: true,
      createdBy: "development-seed",
      createdAt: DEVELOPMENT_PRICE_INSTANT,
    }), null);
  }
}

function fixtureId(sequence: number): EntityId {
  return new EntityId(`40000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`);
}
