import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { PendingBillingWebhookRecovery } from "../../billing/application/billing-webhook-recovery-service.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import { DEFAULT_RETENTION_POLICY, SystemMaintenanceRun, type MaintenanceSummary, type ProductionReadiness, type RetentionPolicy } from "../domain/system-maintenance.ts";

export interface SystemHardeningRepository {
  readiness(now: Date): Promise<ProductionReadiness>;
  start(run: SystemMaintenanceRun): Promise<void>;
  applyRetention(policy: RetentionPolicy, now: Date): Promise<Omit<MaintenanceSummary, "webhooksProcessed" | "webhooksIgnored" | "webhooksFailed">>;
  succeed(runId: string, summary: MaintenanceSummary, at: Date): Promise<void>;
  fail(runId: string, failureCode: string, at: Date): Promise<void>;
}

export class GetProductionReadinessService {
  constructor(private readonly repository: SystemHardeningRepository, private readonly clock: Clock) {}
  execute() { return this.repository.readiness(this.clock.now()); }
}

export class RunSystemMaintenanceService {
  constructor(private readonly repository: SystemHardeningRepository, private readonly webhookRecovery: PendingBillingWebhookRecovery, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder, private readonly policy: RetentionPolicy = DEFAULT_RETENTION_POLICY) {}

  async execute(requestedByAdminUserId: string) {
    const startedAt = this.clock.now();
    const run = new SystemMaintenanceRun({ id: new EntityId(this.ids.next()), requestedByAdminUserId: new EntityId(requestedByAdminUserId), status: "IN_PROGRESS", policy: this.policy, startedAt });
    await this.repository.start(run);
    try {
      const retained = await this.repository.applyRetention(this.policy, this.clock.now());
      const recovered = { webhooksProcessed: 0, webhooksIgnored: 0, webhooksFailed: 0 };
      for (let index = 0; index < this.policy.maxWebhookRecoveries; index += 1) {
        const result = await this.webhookRecovery.execute();
        if (result === "EMPTY") break;
        if (result === "PROCESSED") recovered.webhooksProcessed += 1;
        if (result === "IGNORED") recovered.webhooksIgnored += 1;
        if (result === "FAILED") recovered.webhooksFailed += 1;
      }
      const summary = { ...retained, ...recovered };
      await this.audit.record({ action: AUDIT_ACTIONS.systemMaintenanceCompleted, entityType: "SYSTEM_MAINTENANCE_RUN", entityId: run.props.id.value, after: summary });
      await this.repository.succeed(run.props.id.value, summary, this.clock.now());
      return { runId: run.props.id.value, status: "SUCCEEDED" as const, summary };
    } catch (error) {
      const failureCode = stableFailureCode(error);
      await this.repository.fail(run.props.id.value, failureCode, this.clock.now());
      await this.audit.record({ action: AUDIT_ACTIONS.systemMaintenanceFailed, entityType: "SYSTEM_MAINTENANCE_RUN", entityId: run.props.id.value, after: { failureCode } });
      throw error;
    }
  }
}

function stableFailureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,119}$/.test(error.code)) return error.code;
  return "SYSTEM_MAINTENANCE_FAILED";
}
