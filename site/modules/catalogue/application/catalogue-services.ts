import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import { Offering, Plan, createPlanFeature, type PlanFeature } from "../domain/catalogue.ts";
import type { CatalogueRepository } from "./ports.ts";

export class CatalogueManagementService {
  constructor(
    private readonly repository: CatalogueRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async createOffering(input: {
    code: string;
    name: string;
    description?: string | null;
    category: string;
    active?: boolean;
    displayOrder?: number;
  }): Promise<Offering> {
    const code = new StableCode(input.code);
    if (await this.repository.findOfferingByCode(code.value)) {
      throw new DomainConflictError("OFFERING_CODE_EXISTS", "Offering code already exists.");
    }
    const now = this.clock.now();
    const offering = new Offering({
      id: new EntityId(this.ids.next()), code, name: input.name,
      description: input.description ?? null, category: input.category,
      active: input.active ?? true, displayOrder: input.displayOrder ?? 0,
      createdAt: now, updatedAt: now,
    });
    await this.repository.saveOffering(offering);
    await this.audit.record({ action: AUDIT_ACTIONS.offeringCreated, entityType: "OFFERING", entityId: offering.props.id.value, after: offering.props });
    return offering;
  }

  async createPlan(input: {
    code: string;
    name: string;
    description?: string | null;
    active?: boolean;
    featured?: boolean;
    custom?: boolean;
    displayOrder?: number;
  }): Promise<Plan> {
    const code = new StableCode(input.code);
    if (await this.repository.findPlanByCode(code.value)) {
      throw new DomainConflictError("PLAN_CODE_EXISTS", "Plan code already exists.");
    }
    const now = this.clock.now();
    const plan = new Plan({
      id: new EntityId(this.ids.next()), code, name: input.name,
      description: input.description ?? null, active: input.active ?? true,
      featured: input.featured ?? false, custom: input.custom ?? false,
      displayOrder: input.displayOrder ?? 0, createdAt: now, updatedAt: now,
    });
    await this.repository.savePlan(plan);
    await this.audit.record({ action: AUDIT_ACTIONS.planCreated, entityType: "PLAN", entityId: plan.props.id.value, after: plan.props });
    return plan;
  }

  async setPlanFeature(input: {
    planCode: string;
    offeringCode: string;
    included: boolean;
    limitValue?: number | null;
    limitUnit?: string | null;
    configuration?: Readonly<Record<string, unknown>> | null;
  }): Promise<PlanFeature> {
    const [plan, offering] = await Promise.all([
      this.repository.findPlanByCode(new StableCode(input.planCode).value),
      this.repository.findOfferingByCode(new StableCode(input.offeringCode).value),
    ]);
    if (!plan) throw new DomainConflictError("PLAN_NOT_FOUND", "Plan does not exist.");
    if (!offering) throw new DomainConflictError("OFFERING_NOT_FOUND", "Offering does not exist.");
    const now = this.clock.now();
    const feature = createPlanFeature({
      id: new EntityId(this.ids.next()), planId: plan.props.id, offeringId: offering.props.id,
      included: input.included, limitValue: input.limitValue ?? null,
      limitUnit: input.limitUnit ?? null, configuration: input.configuration ?? null,
      createdAt: now, updatedAt: now,
    });
    await this.repository.savePlanFeature(feature);
    await this.audit.record({ action: AUDIT_ACTIONS.planFeatureChanged, entityType: "PLAN_FEATURE", entityId: feature.id.value, after: feature });
    return feature;
  }
}
