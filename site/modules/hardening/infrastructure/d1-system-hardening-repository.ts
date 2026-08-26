import { and, eq, isNotNull, lte, lt, or, sql } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { agentProvisioningJobs, apiRateLimits, auditEvents, billingCheckoutSessions, billingWebhookEvents, idempotencyKeys, notificationDeliveries, operationalQueueItems, serviceRateLimits, systemMaintenanceRuns } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import type { SystemHardeningRepository } from "../application/system-hardening-services.ts";
import type { MaintenanceSummary, ProductionReadiness, RetentionPolicy, SystemMaintenanceRun } from "../domain/system-maintenance.ts";

export class D1SystemHardeningRepository implements SystemHardeningRepository {
  constructor(private readonly db: AppDatabase) {}

  async readiness(now: Date): Promise<ProductionReadiness> {
    const [billingReady, billingTerminal, notificationReady, notificationExpired, agentReady, agentExpired, overdue, lastRun] = await Promise.all([
      this.db.select({ value: sql<number>`count(*)` }).from(billingWebhookEvents).where(and(eq(billingWebhookEvents.status, "FAILED"), lte(billingWebhookEvents.nextAttemptAt, now), lt(billingWebhookEvents.attemptCount, billingWebhookEvents.maxAttempts))),
      this.db.select({ value: sql<number>`count(*)` }).from(billingWebhookEvents).where(and(eq(billingWebhookEvents.status, "FAILED"), eq(billingWebhookEvents.attemptCount, billingWebhookEvents.maxAttempts))),
      this.db.select({ value: sql<number>`count(*)` }).from(notificationDeliveries).where(and(eq(notificationDeliveries.status, "FAILED"), lte(notificationDeliveries.nextAttemptAt, now), lt(notificationDeliveries.attemptCount, notificationDeliveries.maxAttempts))),
      this.db.select({ value: sql<number>`count(*)` }).from(notificationDeliveries).where(and(eq(notificationDeliveries.status, "PROCESSING"), lte(notificationDeliveries.leaseExpiresAt, now))),
      this.db.select({ value: sql<number>`count(*)` }).from(agentProvisioningJobs).where(and(eq(agentProvisioningJobs.status, "PENDING"), lte(agentProvisioningJobs.nextAttemptAt, now), lt(agentProvisioningJobs.attemptCount, agentProvisioningJobs.maxAttempts))),
      this.db.select({ value: sql<number>`count(*)` }).from(agentProvisioningJobs).where(and(eq(agentProvisioningJobs.status, "IN_PROGRESS"), lte(agentProvisioningJobs.leaseExpiresAt, now))),
      this.db.select({ value: sql<number>`count(*)` }).from(operationalQueueItems).where(and(sql`${operationalQueueItems.status} in ('OPEN', 'CLAIMED')`, lte(operationalQueueItems.dueAt, now))),
      this.db.select({ completedAt: systemMaintenanceRuns.completedAt }).from(systemMaintenanceRuns).where(eq(systemMaintenanceRuns.status, "SUCCEEDED")).orderBy(sql`${systemMaintenanceRuns.completedAt} desc`).limit(1),
    ]);
    const backlog = { billingWebhooksReady: Number(billingReady[0]?.value ?? 0), billingWebhooksTerminal: Number(billingTerminal[0]?.value ?? 0), notificationRetriesReady: Number(notificationReady[0]?.value ?? 0), notificationLeasesExpired: Number(notificationExpired[0]?.value ?? 0), agentRetriesReady: Number(agentReady[0]?.value ?? 0), agentLeasesExpired: Number(agentExpired[0]?.value ?? 0), overdueOperationalItems: Number(overdue[0]?.value ?? 0) };
    return { status: Object.values(backlog).some((value) => value > 0) ? "DEGRADED" : "HEALTHY", checkedAt: now, backlog, lastSuccessfulMaintenanceAt: lastRun[0]?.completedAt ?? null };
  }

  async start(run: SystemMaintenanceRun): Promise<void> {
    const p = run.props;
    try {
      await this.db.insert(systemMaintenanceRuns).values({ id: p.id.value, operation: "RETENTION_AND_RECOVERY", status: "IN_PROGRESS", requestedByAdminUserId: p.requestedByAdminUserId.value, policySnapshot: p.policy, summary: null, failureCode: null, startedAt: p.startedAt, completedAt: null, createdAt: p.startedAt, updatedAt: p.startedAt });
    } catch {
      throw new DomainConflictError("SYSTEM_MAINTENANCE_ALREADY_RUNNING", "A retention and recovery run is already active.");
    }
  }

  async applyRetention(policy: RetentionPolicy, now: Date) {
    const auditBefore = daysBefore(now, policy.auditNetworkMetadataDays);
    const rateLimitBefore = daysBefore(now, policy.rateLimitDays);
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const results = await this.db.batch([
      this.db.update(billingCheckoutSessions).set({ status: "EXPIRED", updatedAt: now }).where(and(eq(billingCheckoutSessions.status, "OPEN"), lte(billingCheckoutSessions.expiresAt, now))),
      this.db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, now)),
      this.db.delete(serviceRateLimits).where(lt(serviceRateLimits.windowStartedAt, rateLimitBefore)),
      this.db.delete(apiRateLimits).where(lt(apiRateLimits.windowStartedAt, rateLimitBefore)),
      this.db.update(auditEvents).set({ ipAddress: null, userAgent: null }).where(and(lte(auditEvents.createdAt, auditBefore), or(isNotNull(auditEvents.ipAddress), isNotNull(auditEvents.userAgent)))),
    ] as [BatchItem, ...BatchItem[]]);
    const changes = results.map((result) => Number(result.meta.changes));
    return { checkoutSessionsExpired: changes[0], idempotencyKeysDeleted: changes[1], serviceRateLimitsDeleted: changes[2], apiRateLimitsDeleted: changes[3], auditNetworkMetadataRedacted: changes[4] };
  }

  async succeed(runId: string, summary: MaintenanceSummary, at: Date): Promise<void> {
    const result = await this.db.update(systemMaintenanceRuns).set({ status: "SUCCEEDED", summary, completedAt: at, updatedAt: at }).where(and(eq(systemMaintenanceRuns.id, runId), eq(systemMaintenanceRuns.status, "IN_PROGRESS")));
    if (Number(result.meta.changes) !== 1) throw new DomainConflictError("SYSTEM_MAINTENANCE_COMPLETION_CONFLICT", "Maintenance run changed concurrently.");
  }

  async fail(runId: string, failureCode: string, at: Date): Promise<void> {
    await this.db.update(systemMaintenanceRuns).set({ status: "FAILED", failureCode, completedAt: at, updatedAt: at }).where(and(eq(systemMaintenanceRuns.id, runId), eq(systemMaintenanceRuns.status, "IN_PROGRESS")));
  }
}

function daysBefore(now: Date, days: number) { return new Date(now.getTime() - days * 86_400_000); }
