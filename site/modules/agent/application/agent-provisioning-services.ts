import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { AgentProvisioner, AgentProvisioningRepository, CustomerEntitlementReader } from "./ports.ts";
import { AgentProviderError } from "./provider-failure.ts";
import { AgentLink, AgentProvisioningAttempt, AgentProvisioningJob, type AgentLinkStatus, type AgentOperation } from "../domain/agent-provisioning.ts";

export class RequestAgentProvisioningService {
  constructor(private readonly repository: AgentProvisioningRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { customerId: string; platform: string; operation: AgentOperation; idempotencyKey: string }) {
    const existingJob = await this.repository.findJobByIdempotencyKey(input.idempotencyKey);
    if (existingJob) return existingJob;
    const now = this.clock.now(); const platform = new StableCode(input.platform);
    const currentLink = await this.repository.findLink(input.customerId, platform.value);
    if (!currentLink && input.operation !== "PROVISION") throw new DomainConflictError("AGENT_LINK_NOT_FOUND", "Agent link must be provisioned first.");
    const baseLink = currentLink ?? new AgentLink({ id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId), agentPlatform: platform, externalAgentId: null, status: "NOT_PROVISIONED", lastSyncedAt: null, version: 1, createdAt: now, updatedAt: now });
    const link = baseLink.request(now);
    const job = new AgentProvisioningJob({ id: new EntityId(this.ids.next()), agentLinkId: link.props.id, customerId: link.props.customerId, operation: input.operation, status: "PENDING", idempotencyKey: input.idempotencyKey, attemptCount: 0, maxAttempts: 5, nextAttemptAt: now, processingStartedAt: null, leaseExpiresAt: null, errorCategory: null, requestedAt: now, startedAt: null, completedAt: null, version: 1, createdAt: now, updatedAt: now });
    const queue = new OperationalQueueItem({ id: new EntityId(this.ids.next()), queueType: "AGENT_PROVISIONING", sourceType: "AGENT_PROVISIONING_JOB", sourceId: job.props.id.value, customerId: link.props.customerId, status: "OPEN", priority: 30, title: `${input.operation.toLowerCase()} ${platform.value} agent`, availableAt: now, dueAt: null, assignedToAdminUserId: null, claimedAt: null, resolvedAt: null, version: 1, createdAt: now, updatedAt: now });
    await this.repository.createRequest(link, currentLink?.props.version ?? null, job, queue);
    await this.audit.record({ action: AUDIT_ACTIONS.agentProvisioningRequested, entityType: "AGENT_PROVISIONING_JOB", entityId: job.props.id.value, after: { link: link.props, job: job.props } });
    return job;
  }
}

export class RunAgentProvisioningService {
  constructor(private readonly repository: AgentProvisioningRepository, private readonly provider: AgentProvisioner, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute() {
    const pending = await this.repository.findReadyJob(this.clock.now());
    if (!pending) return null;
    const now = this.clock.now();
    const link = await this.repository.findLinkById(pending.props.agentLinkId.value);
    if (!link) throw new DomainConflictError("AGENT_LINK_NOT_FOUND", "Agent link does not exist.");
    if (pending.props.status === "IN_PROGRESS" && pending.props.attemptCount >= pending.props.maxAttempts) {
      const attempt = await this.repository.findProcessingAttempt(pending.props.id.value);
      if (!attempt) throw new DomainConflictError("AGENT_ATTEMPT_NOT_FOUND", "The processing agent attempt does not exist.");
      const failed = pending.fail("LEASE_EXPIRED", null, now);
      await this.repository.saveOutcome(link.failed(now), link.props.version, failed, pending.props.version, attempt.fail("LEASE_EXPIRED", false, now), false);
      await this.audit.record({ action: AUDIT_ACTIONS.agentProvisioningFailed, entityType: "AGENT_PROVISIONING_JOB", entityId: failed.props.id.value, before: pending.props, after: failed.props });
      return failed;
    }
    const started = pending.start(now, new Date(now.getTime() + 120_000));
    const attempt = new AgentProvisioningAttempt({ id: new EntityId(this.ids.next()), jobId: started.props.id, attemptNumber: started.props.attemptCount, provider: link.props.agentPlatform.value, status: "PROCESSING", providerReference: null, errorCategory: null, retryable: false, startedAt: now, completedAt: null, createdAt: now });
    await this.repository.startJob(started, pending.props.version, attempt);
    try {
      const outcome = await this.provider.execute({ operation: started.props.operation, platform: link.props.agentPlatform.value, customerId: link.props.customerId.value, externalAgentId: link.props.externalAgentId, idempotencyKey: started.props.idempotencyKey });
      const completedAt = this.clock.now(); const nextLink = link.succeeded(started.props.operation, outcome.externalAgentId, completedAt); const succeeded = started.succeed(completedAt); const succeededAttempt = attempt.succeed(outcome.providerReference, completedAt);
      await this.repository.saveOutcome(nextLink, link.props.version, succeeded, started.props.version, succeededAttempt, true);
      await this.audit.record({ action: AUDIT_ACTIONS.agentProvisioningSucceeded, entityType: "AGENT_PROVISIONING_JOB", entityId: succeeded.props.id.value, before: started.props, after: succeeded.props });
      return succeeded;
    } catch (error) {
      const failure = error instanceof AgentProviderError ? error : new AgentProviderError("PROVIDER_UNAVAILABLE", true);
      const failedAt = this.clock.now();
      const retryAt = failure.retryable && started.props.attemptCount < started.props.maxAttempts ? new Date(failedAt.getTime() + Math.min(3_600_000, 60_000 * 2 ** (started.props.attemptCount - 1))) : null;
      const failed = started.fail(failure.category, retryAt, failedAt); const terminal = failed.props.status === "FAILED";
      await this.repository.saveOutcome(terminal ? link.failed(failedAt) : link.request(failedAt), link.props.version, failed, started.props.version, attempt.fail(failure.category, failure.retryable, failedAt), false);
      await this.audit.record({ action: terminal ? AUDIT_ACTIONS.agentProvisioningFailed : AUDIT_ACTIONS.agentProvisioningRetryScheduled, entityType: "AGENT_PROVISIONING_JOB", entityId: failed.props.id.value, before: started.props, after: failed.props });
      throw error;
    }
  }
}

export class SynchronizeAgentLinkService {
  constructor(private readonly repository: AgentProvisioningRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { customerId: string; platform: string; externalAgentId: string | null; status: Extract<AgentLinkStatus, "ACTIVE" | "SUSPENDED" | "ERROR"> }) {
    const platform = new StableCode(input.platform); const current = await this.repository.findLink(input.customerId, platform.value); const now = this.clock.now();
    const base = current ?? new AgentLink({ id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId), agentPlatform: platform, externalAgentId: null, status: "NOT_PROVISIONED", lastSyncedAt: null, version: 1, createdAt: now, updatedAt: now });
    const next = base.synchronize(input.externalAgentId, input.status, now);
    await this.repository.saveLink(next, current?.props.version ?? null);
    await this.audit.record({ action: AUDIT_ACTIONS.agentLinkSynchronized, entityType: "AGENT_LINK", entityId: next.props.id.value, before: current?.props ?? null, after: next.props });
    return next;
  }
}

export class ReconcileAgentPlatformService {
  constructor(private readonly repository: AgentProvisioningRepository, private readonly entitlements: CustomerEntitlementReader, private readonly provider: AgentProvisioner, private readonly request: RequestAgentProvisioningService, private readonly synchronize: SynchronizeAgentLinkService) {}
  async execute(input: { customerId: string; platform: string; idempotencyKey: string }) {
    const link = await this.repository.findLink(input.customerId, new StableCode(input.platform).value);
    const entitlement = await this.entitlements.getEntitlements(input.customerId); const valid = entitlement?.valid ?? false;
    if (!link || !link.props.externalAgentId) return valid ? this.queued(input, "PROVISION") : { action: "NONE" as const, reason: "SUBSCRIPTION_INVALID" };
    const remote = await this.provider.inspect({ platform: link.props.agentPlatform.value, customerId: input.customerId, externalAgentId: link.props.externalAgentId });
    if (remote.status === "MISSING") return valid ? this.queued(input, "PROVISION") : this.synchronized(input, null, "ERROR");
    if (!valid && remote.status === "ACTIVE") return this.queued(input, "SUSPEND");
    if (valid && remote.status === "SUSPENDED") return this.queued(input, "RESUME");
    return this.synchronized(input, remote.externalAgentId, remote.status);
  }
  private async queued(input: { customerId: string; platform: string; idempotencyKey: string }, operation: AgentOperation) { const job = await this.request.execute({ ...input, operation }); return { action: "QUEUED" as const, operation, jobId: job.props.id.value }; }
  private async synchronized(input: { customerId: string; platform: string }, externalAgentId: string | null, status: Extract<AgentLinkStatus, "ACTIVE" | "SUSPENDED" | "ERROR">) { const link = await this.synchronize.execute({ ...input, externalAgentId, status }); return { action: "SYNCHRONIZED" as const, status: link.props.status }; }
}
