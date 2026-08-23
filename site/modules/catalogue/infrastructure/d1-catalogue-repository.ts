import { eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { offerings, planFeatures, plans } from "../../../db/schema.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { CatalogueRepository, PlanEntitlementSource } from "../application/ports.ts";
import { Offering, Plan, type PlanFeature } from "../domain/catalogue.ts";

export class D1CatalogueRepository implements CatalogueRepository, PlanEntitlementSource {
  constructor(private readonly db: AppDatabase) {}

  async findOfferingByCode(code: string): Promise<Offering | null> {
    const [row] = await this.db.select().from(offerings).where(eq(offerings.code, code)).limit(1);
    return row ? new Offering({
      id: new EntityId(row.id), code: new StableCode(row.code), name: row.name,
      description: row.description, category: row.category, active: row.active, displayOrder: row.displayOrder,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }) : null;
  }

  async findPlanByCode(code: string): Promise<Plan | null> {
    const [row] = await this.db.select().from(plans).where(eq(plans.code, code)).limit(1);
    return row ? new Plan({
      id: new EntityId(row.id), code: new StableCode(row.code), name: row.name,
      description: row.description, active: row.active, featured: row.featured, custom: row.custom,
      displayOrder: row.displayOrder, createdAt: row.createdAt, updatedAt: row.updatedAt,
    }) : null;
  }

  async saveOffering(offering: Offering): Promise<void> {
    const value = offering.props;
    await this.db.insert(offerings).values({
      id: value.id.value, code: value.code.value, name: value.name,
      description: value.description, category: value.category, active: value.active, displayOrder: value.displayOrder,
      createdAt: value.createdAt, updatedAt: value.updatedAt,
    }).onConflictDoUpdate({ target: offerings.code, set: {
      name: value.name, description: value.description, category: value.category, active: value.active,
      displayOrder: value.displayOrder, updatedAt: value.updatedAt,
    }});
  }

  async savePlan(plan: Plan): Promise<void> {
    const value = plan.props;
    await this.db.insert(plans).values({
      id: value.id.value, code: value.code.value, name: value.name,
      description: value.description, active: value.active, featured: value.featured, custom: value.custom,
      displayOrder: value.displayOrder, createdAt: value.createdAt, updatedAt: value.updatedAt,
    }).onConflictDoUpdate({ target: plans.code, set: {
      name: value.name, description: value.description, active: value.active, featured: value.featured,
      custom: value.custom, displayOrder: value.displayOrder, updatedAt: value.updatedAt,
    }});
  }

  async savePlanFeature(feature: PlanFeature): Promise<void> {
    await this.db.insert(planFeatures).values({
      id: feature.id.value,
      planId: feature.planId.value,
      offeringId: feature.offeringId.value,
      included: feature.included,
      limitValue: feature.limitValue,
      limitUnit: feature.limitUnit,
      configuration: feature.configuration ? { ...feature.configuration } : null,
      createdAt: feature.createdAt,
      updatedAt: feature.updatedAt,
    }).onConflictDoUpdate({
      target: [planFeatures.planId, planFeatures.offeringId],
      set: {
        included: feature.included,
        limitValue: feature.limitValue,
        limitUnit: feature.limitUnit,
        configuration: feature.configuration ? { ...feature.configuration } : null,
        updatedAt: feature.updatedAt,
      },
    });
  }

  async findPlanEntitlementDefinitions(planId: string) {
    return this.db.select({
      offeringCode: offerings.code,
      enabled: planFeatures.included,
      limitValue: planFeatures.limitValue,
      limitUnit: planFeatures.limitUnit,
    }).from(planFeatures).innerJoin(offerings, eq(offerings.id, planFeatures.offeringId))
      .where(eq(planFeatures.planId, planId));
  }
}
