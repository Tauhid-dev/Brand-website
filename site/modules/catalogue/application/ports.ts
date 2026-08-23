import type { Offering, Plan, PlanFeature } from "../domain/catalogue.ts";

export interface CatalogueRepository {
  findOfferingByCode(code: string): Promise<Offering | null>;
  findPlanByCode(code: string): Promise<Plan | null>;
  saveOffering(offering: Offering): Promise<void>;
  savePlan(plan: Plan): Promise<void>;
  savePlanFeature(feature: PlanFeature): Promise<void>;
}
