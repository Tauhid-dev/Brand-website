import type { Clock } from "../../modules/shared/application/ports.ts";
import { EntityId, StableCode } from "../../modules/shared/domain/value-objects.ts";
import type { CreateCustomerInput } from "../../modules/customer/application/customer-services.ts";
import type { CatalogueRepository } from "../../modules/catalogue/application/ports.ts";
import { Offering, Plan, createPlanFeature } from "../../modules/catalogue/domain/catalogue.ts";

const DEVELOPMENT_INSTANT = new Date("2026-01-01T00:00:00.000Z");

const OFFERING_FIXTURES = [
  ["website_design", "Website Design", "Web"],
  ["website_management", "Hosting & Maintenance", "Web"],
  ["local_seo", "Local SEO", "Growth"],
  ["google_business_profile", "Google Business Profile", "Growth"],
  ["reputation_management", "Reputation Management", "Growth"],
  ["social_presence", "Social Presence", "Growth"],
  ["ai_receptionist", "AI Receptionist", "Automation"],
  ["whatsapp_agent", "WhatsApp Agent", "Automation"],
  ["calendar_booking", "Calendar Booking", "Automation"],
  ["crm_integration", "CRM Integration", "Integration"],
] as const;

const PLAN_FIXTURES = [
  ["essential_presence", "Essential Presence", false, false],
  ["growth_engine", "Growth Engine", true, false],
  ["market_leader", "Market Leader", false, false],
  ["custom_multi_location", "Custom Multi-location", false, true],
] as const;

const FEATURE_FIXTURES = [
  ["essential_presence", "website_design", null, null],
  ["essential_presence", "website_management", null, null],
  ["essential_presence", "google_business_profile", null, null],
  ["growth_engine", "website_design", null, null],
  ["growth_engine", "website_management", null, null],
  ["growth_engine", "local_seo", null, null],
  ["growth_engine", "social_presence", 4, "posts_per_month"],
  ["growth_engine", "ai_receptionist", 500, "conversations_per_month"],
  ["market_leader", "website_design", null, null],
  ["market_leader", "website_management", null, null],
  ["market_leader", "local_seo", null, null],
  ["market_leader", "reputation_management", null, null],
  ["market_leader", "social_presence", 12, "posts_per_month"],
  ["market_leader", "ai_receptionist", 1500, "conversations_per_month"],
  ["market_leader", "whatsapp_agent", 1500, "conversations_per_month"],
  ["market_leader", "calendar_booking", null, null],
  ["market_leader", "crm_integration", null, null],
] as const;

export const DEVELOPMENT_CUSTOMERS: ReadonlyArray<Omit<CreateCustomerInput, "creationSource">> = [
  {
    externalReference: "demo-plumbing",
    businessName: "Example Plumbing Pty Ltd",
    contactName: "Demo Customer",
    email: "plumbing@example.invalid",
    industry: "Plumbing",
  },
  {
    externalReference: "demo-electrical",
    businessName: "Example Electrical Pty Ltd",
    contactName: "Demo Customer",
    email: "electrical@example.invalid",
    industry: "Electrical",
  },
];

export async function seedDevelopmentCatalogue(
  repository: CatalogueRepository,
  clock: Clock = { now: () => DEVELOPMENT_INSTANT },
): Promise<void> {
  const now = clock.now();
  const offeringIds = new Map<string, EntityId>();
  const planIds = new Map<string, EntityId>();

  for (const [index, [code, name, category]] of OFFERING_FIXTURES.entries()) {
    const existing = await repository.findOfferingByCode(code);
    const id = existing?.props.id ?? fixtureId("1", index + 1);
    await repository.saveOffering(new Offering({
      id,
      code: new StableCode(code),
      name,
      description: null,
      category,
      active: true,
      displayOrder: index,
      createdAt: existing?.props.createdAt ?? now,
      updatedAt: now,
    }));
    offeringIds.set(code, id);
  }

  for (const [index, [code, name, featured, custom]] of PLAN_FIXTURES.entries()) {
    const existing = await repository.findPlanByCode(code);
    const id = existing?.props.id ?? fixtureId("2", index + 1);
    await repository.savePlan(new Plan({
      id,
      code: new StableCode(code),
      name,
      description: null,
      active: true,
      featured,
      custom,
      displayOrder: index,
      createdAt: existing?.props.createdAt ?? now,
      updatedAt: now,
    }));
    planIds.set(code, id);
  }

  for (const [index, [planCode, offeringCode, limitValue, limitUnit]] of FEATURE_FIXTURES.entries()) {
    await repository.savePlanFeature(createPlanFeature({
      id: fixtureId("3", index + 1),
      planId: requiredFixtureId(planIds, planCode),
      offeringId: requiredFixtureId(offeringIds, offeringCode),
      included: true,
      limitValue,
      limitUnit,
      configuration: null,
      createdAt: now,
      updatedAt: now,
    }));
  }
}

function fixtureId(group: string, sequence: number): EntityId {
  return new EntityId(`${group}0000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`);
}

function requiredFixtureId(values: ReadonlyMap<string, EntityId>, code: string): EntityId {
  const value = values.get(code);
  if (!value) throw new Error(`Development fixture ${code} is missing.`);
  return value;
}
