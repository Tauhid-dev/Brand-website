import { and, asc, eq, lte, or } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { agentLinks, agentProvisioningAttempts, agentProvisioningJobs } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import { findActiveOperationalQueueRows, insertOperationalQueueItem, resolveOperationalQueueItem } from "../../operations/infrastructure/d1-operational-queue-statements.ts";
import type { AgentProvisioningRepository } from "../application/ports.ts";
import { AgentLink, AgentProvisioningAttempt, AgentProvisioningJob, type AgentAttemptStatus, type AgentJobStatus, type AgentLinkStatus, type AgentOperation } from "../domain/agent-provisioning.ts";

export class D1AgentProvisioningRepository implements AgentProvisioningRepository {
  constructor(private readonly db: AppDatabase) {}
  async findLink(customerId: string, platform: string) { const [row] = await this.db.select().from(agentLinks).where(and(eq(agentLinks.customerId, customerId), eq(agentLinks.agentPlatform, platform))).limit(1); return row ? mapLink(row) : null; }
  async findLinkById(id: string) { const [row] = await this.db.select().from(agentLinks).where(eq(agentLinks.id, id)).limit(1); return row ? mapLink(row) : null; }
  async findJobByIdempotencyKey(key: string) { const [row] = await this.db.select().from(agentProvisioningJobs).where(eq(agentProvisioningJobs.idempotencyKey, key)).limit(1); return row ? mapJob(row) : null; }
  async findProcessingAttempt(jobId: string) { const [row] = await this.db.select().from(agentProvisioningAttempts).where(and(eq(agentProvisioningAttempts.jobId, jobId), eq(agentProvisioningAttempts.status, "PROCESSING"))).limit(1); return row ? mapAgentAttempt(row) : null; }
  async findReadyJob(at: Date) {
    const [row] = await this.db.select().from(agentProvisioningJobs).where(or(
      and(eq(agentProvisioningJobs.status, "PENDING"), lte(agentProvisioningJobs.nextAttemptAt, at)),
      and(eq(agentProvisioningJobs.status, "IN_PROGRESS"), lte(agentProvisioningJobs.leaseExpiresAt, at)),
    )).orderBy(asc(agentProvisioningJobs.nextAttemptAt), asc(agentProvisioningJobs.leaseExpiresAt), asc(agentProvisioningJobs.requestedAt)).limit(1);
    return row ? mapJob(row) : null;
  }
  async createRequest(link: AgentLink, expectedLinkVersion: number | null, job: AgentProvisioningJob, queue: OperationalQueueItem) {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number]; const lp = link.props;
    const linkStatement = expectedLinkVersion == null
      ? this.db.insert(agentLinks).values(linkValues(link))
      : this.db.update(agentLinks).set({ status: lp.status, version: lp.version, updatedAt: lp.updatedAt }).where(and(eq(agentLinks.id, lp.id.value), eq(agentLinks.version, expectedLinkVersion)));
    try {
      const results = await this.db.batch([linkStatement, this.db.insert(agentProvisioningJobs).values(jobValues(job)), insertOperationalQueueItem(this.db, queue)] as [BatchItem, ...BatchItem[]]);
      if (expectedLinkVersion !== null && Number(results[0].meta.changes) !== 1) throw new DomainConflictError("AGENT_VERSION_CONFLICT", "Agent provisioning state changed concurrently.");
    } catch (error) { throw mapConflict(error); }
  }
  async startJob(job: AgentProvisioningJob, expectedVersion: number, attempt: AgentProvisioningAttempt) {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    try {
      const results = await this.db.batch([
        jobUpdate(this.db, job, expectedVersion),
        this.db.update(agentProvisioningAttempts).set({ status: "FAILED", errorCategory: "LEASE_EXPIRED", retryable: true, completedAt: job.props.processingStartedAt }).where(and(eq(agentProvisioningAttempts.jobId, job.props.id.value), eq(agentProvisioningAttempts.status, "PROCESSING"))),
        this.db.insert(agentProvisioningAttempts).values(attemptValues(attempt)),
      ] as [BatchItem, ...BatchItem[]]);
      if (Number(results[0].meta.changes) !== 1) throw new DomainConflictError("AGENT_JOB_VERSION_CONFLICT", "Agent job changed concurrently.");
    } catch (error) { throw mapConflict(error); }
  }
  async saveOutcome(link: AgentLink, expectedLinkVersion: number, job: AgentProvisioningJob, expectedJobVersion: number, attempt: AgentProvisioningAttempt, resolveQueue: boolean) {
    const queues = resolveQueue ? await findActiveOperationalQueueRows(this.db, "AGENT_PROVISIONING_JOB", job.props.id.value) : [];
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const statements: BatchItem[] = [
      linkUpdate(this.db, link, expectedLinkVersion), jobUpdate(this.db, job, expectedJobVersion),
      this.db.update(agentProvisioningAttempts).set({ status: attempt.props.status, providerReference: attempt.props.providerReference, errorCategory: attempt.props.errorCategory, retryable: attempt.props.retryable, completedAt: attempt.props.completedAt }).where(and(eq(agentProvisioningAttempts.id, attempt.props.id.value), eq(agentProvisioningAttempts.status, "PROCESSING"))),
      ...queues.map((queue) => resolveOperationalQueueItem(this.db, queue, job.props.updatedAt)),
    ];
    try {
      const results = await this.db.batch(statements as [BatchItem, ...BatchItem[]]);
      if (results.slice(0, 3).some((result) => Number(result.meta.changes) !== 1)) throw new DomainConflictError("AGENT_VERSION_CONFLICT", "Agent provisioning state changed concurrently.");
    } catch (error) { throw mapConflict(error); }
  }
  async saveLink(link: AgentLink, expectedVersion: number | null) {
    try {
      if (expectedVersion === null) { await this.db.insert(agentLinks).values(linkValues(link)); return; }
      const result = await linkUpdate(this.db, link, expectedVersion);
      if (Number(result.meta.changes) !== 1) throw new DomainConflictError("AGENT_VERSION_CONFLICT", "Agent link changed concurrently.");
    } catch (error) { throw mapConflict(error); }
  }
}

function linkUpdate(db: AppDatabase, value: AgentLink, expectedVersion: number) { const p = value.props; return db.update(agentLinks).set({ externalAgentId: p.externalAgentId, status: p.status, lastSyncedAt: p.lastSyncedAt, version: p.version, updatedAt: p.updatedAt }).where(and(eq(agentLinks.id, p.id.value), eq(agentLinks.version, expectedVersion))); }
function jobUpdate(db: AppDatabase, value: AgentProvisioningJob, expectedVersion: number) { const p = value.props; return db.update(agentProvisioningJobs).set({ status: p.status, attemptCount: p.attemptCount, nextAttemptAt: p.nextAttemptAt, processingStartedAt: p.processingStartedAt, leaseExpiresAt: p.leaseExpiresAt, errorCategory: p.errorCategory, startedAt: p.startedAt, completedAt: p.completedAt, version: p.version, updatedAt: p.updatedAt }).where(and(eq(agentProvisioningJobs.id, p.id.value), eq(agentProvisioningJobs.version, expectedVersion))); }
function linkValues(value: AgentLink) { const p = value.props; return { id: p.id.value, customerId: p.customerId.value, agentPlatform: p.agentPlatform.value, externalAgentId: p.externalAgentId, status: p.status, lastSyncedAt: p.lastSyncedAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt }; }
function jobValues(value: AgentProvisioningJob) { const p = value.props; return { id: p.id.value, agentLinkId: p.agentLinkId.value, customerId: p.customerId.value, operation: p.operation, status: p.status, idempotencyKey: p.idempotencyKey, attemptCount: p.attemptCount, maxAttempts: p.maxAttempts, nextAttemptAt: p.nextAttemptAt, processingStartedAt: p.processingStartedAt, leaseExpiresAt: p.leaseExpiresAt, errorCategory: p.errorCategory, requestedAt: p.requestedAt, startedAt: p.startedAt, completedAt: p.completedAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt }; }
function attemptValues(value: AgentProvisioningAttempt) { const p = value.props; return { id: p.id.value, jobId: p.jobId.value, attemptNumber: p.attemptNumber, provider: p.provider, status: p.status, providerReference: p.providerReference, errorCategory: p.errorCategory, retryable: p.retryable, startedAt: p.startedAt, completedAt: p.completedAt, createdAt: p.createdAt }; }
function mapLink(row: typeof agentLinks.$inferSelect) { return new AgentLink({ id: new EntityId(row.id), customerId: new EntityId(row.customerId), agentPlatform: new StableCode(row.agentPlatform), externalAgentId: row.externalAgentId, status: row.status as AgentLinkStatus, lastSyncedAt: row.lastSyncedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
function mapJob(row: typeof agentProvisioningJobs.$inferSelect) { return new AgentProvisioningJob({ id: new EntityId(row.id), agentLinkId: new EntityId(row.agentLinkId), customerId: new EntityId(row.customerId), operation: row.operation as AgentOperation, status: row.status as AgentJobStatus, idempotencyKey: row.idempotencyKey, attemptCount: row.attemptCount, maxAttempts: row.maxAttempts, nextAttemptAt: row.nextAttemptAt, processingStartedAt: row.processingStartedAt, leaseExpiresAt: row.leaseExpiresAt, errorCategory: row.errorCategory, requestedAt: row.requestedAt, startedAt: row.startedAt, completedAt: row.completedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
export function mapAgentAttempt(row: typeof agentProvisioningAttempts.$inferSelect) { return new AgentProvisioningAttempt({ id: new EntityId(row.id), jobId: new EntityId(row.jobId), attemptNumber: row.attemptNumber, provider: row.provider, status: row.status as AgentAttemptStatus, providerReference: row.providerReference, errorCategory: row.errorCategory, retryable: row.retryable, startedAt: row.startedAt, completedAt: row.completedAt, createdAt: row.createdAt }); }
function mapConflict(error: unknown): DomainConflictError { const message = error instanceof Error ? error.message : ""; if (message.includes("idempotency_key")) return new DomainConflictError("AGENT_JOB_IDEMPOTENCY_CONFLICT", "Agent job already exists."); if (message.includes("agent_provisioning_attempts")) return new DomainConflictError("AGENT_ATTEMPT_CONFLICT", "Agent provisioning attempt already exists."); if (message.includes("VERSION_CONFLICT")) return new DomainConflictError("AGENT_VERSION_CONFLICT", "Agent provisioning state changed concurrently."); if (error instanceof DomainConflictError) return error; throw error; }
