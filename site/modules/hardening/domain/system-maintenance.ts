import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";

export type RetentionPolicy = Readonly<{ auditNetworkMetadataDays: number; rateLimitDays: number; maxWebhookRecoveries: number }>;
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = Object.freeze({ auditNetworkMetadataDays: 30, rateLimitDays: 2, maxWebhookRecoveries: 25 });
export type MaintenanceSummary = { checkoutSessionsExpired: number; idempotencyKeysDeleted: number; serviceRateLimitsDeleted: number; apiRateLimitsDeleted: number; auditNetworkMetadataRedacted: number; webhooksProcessed: number; webhooksIgnored: number; webhooksFailed: number };

export class SystemMaintenanceRun {
  constructor(readonly props: Readonly<{ id: EntityId; requestedByAdminUserId: EntityId; status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"; policy: RetentionPolicy; startedAt: Date }>) {
    if (!Number.isFinite(props.startedAt.getTime())) throw new DomainValidationError("INVALID_MAINTENANCE_TIME", "Maintenance start time must be valid.");
  }
}

export type ProductionReadiness = {
  status: "HEALTHY" | "DEGRADED";
  checkedAt: Date;
  backlog: { billingWebhooksReady: number; billingWebhooksTerminal: number; notificationRetriesReady: number; notificationLeasesExpired: number; agentRetriesReady: number; agentLeasesExpired: number; overdueOperationalItems: number };
  lastSuccessfulMaintenanceAt: Date | null;
};
