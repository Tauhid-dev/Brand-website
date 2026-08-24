import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";

export type AgentLinkStatus = "NOT_PROVISIONED" | "PENDING" | "ACTIVE" | "SUSPENDED" | "ERROR";
export type AgentOperation = "PROVISION" | "UPDATE" | "SUSPEND" | "RESUME";
export type AgentJobStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type AgentAttemptStatus = "PROCESSING" | "SUCCEEDED" | "FAILED";

export type AgentLinkProps = {
  id: EntityId; customerId: EntityId; agentPlatform: StableCode; externalAgentId: string | null;
  status: AgentLinkStatus; lastSyncedAt: Date | null; version: number; createdAt: Date; updatedAt: Date;
};

export class AgentLink {
  readonly props: Readonly<AgentLinkProps>;
  constructor(input: AgentLinkProps) {
    if (!["NOT_PROVISIONED", "PENDING", "ACTIVE", "SUSPENDED", "ERROR"].includes(input.status)) throw new DomainValidationError("INVALID_AGENT_LINK_STATUS", "Agent link status is invalid.");
    if (["ACTIVE", "SUSPENDED"].includes(input.status) && !input.externalAgentId) throw new DomainValidationError("AGENT_REFERENCE_REQUIRED", "Active and suspended links require an external agent ID.");
    this.props = Object.freeze({ ...input, externalAgentId: optionalText(input.externalAgentId, "externalAgentId", 255) });
  }
  request(at: Date) { return new AgentLink({ ...this.props, status: "PENDING", version: this.props.version + 1, updatedAt: at }); }
  succeeded(operation: AgentOperation, externalAgentId: string, at: Date) { return new AgentLink({ ...this.props, externalAgentId, status: operation === "SUSPEND" ? "SUSPENDED" : "ACTIVE", lastSyncedAt: at, version: this.props.version + 1, updatedAt: at }); }
  failed(at: Date) { return new AgentLink({ ...this.props, status: "ERROR", version: this.props.version + 1, updatedAt: at }); }
  synchronize(externalAgentId: string | null, status: Extract<AgentLinkStatus, "ACTIVE" | "SUSPENDED" | "ERROR">, at: Date) { return new AgentLink({ ...this.props, externalAgentId, status, lastSyncedAt: at, version: this.props.version + 1, updatedAt: at }); }
}

export type AgentProvisioningJobProps = {
  id: EntityId; agentLinkId: EntityId; customerId: EntityId; operation: AgentOperation;
  status: AgentJobStatus; idempotencyKey: string; attemptCount: number; maxAttempts: number;
  nextAttemptAt: Date | null; processingStartedAt: Date | null; leaseExpiresAt: Date | null;
  errorCategory: string | null; requestedAt: Date; startedAt: Date | null; completedAt: Date | null;
  version: number; createdAt: Date; updatedAt: Date;
};

export class AgentProvisioningJob {
  readonly props: Readonly<AgentProvisioningJobProps>;
  constructor(input: AgentProvisioningJobProps) {
    if (!["PROVISION", "UPDATE", "SUSPEND", "RESUME"].includes(input.operation) || !["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "CANCELLED"].includes(input.status)) throw new DomainValidationError("INVALID_AGENT_JOB", "Agent provisioning job is invalid.");
    if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 0 || !Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.attemptCount > input.maxAttempts) throw new DomainValidationError("INVALID_AGENT_ATTEMPTS", "Agent provisioning attempts are invalid.");
    const leased = input.processingStartedAt !== null && input.leaseExpiresAt !== null;
    if ((input.status === "IN_PROGRESS") !== leased) throw new DomainValidationError("INVALID_AGENT_JOB_LEASE", "In-progress agent jobs require an active lease.");
    this.props = Object.freeze({ ...input, idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey", 255), errorCategory: optionalText(input.errorCategory, "errorCategory", 120) });
  }
  start(at: Date, leaseExpiresAt: Date) {
    const reclaimable = this.props.status === "IN_PROGRESS" && this.props.leaseExpiresAt !== null && this.props.leaseExpiresAt <= at;
    if (this.props.status !== "PENDING" && !reclaimable) throw new DomainConflictError("AGENT_JOB_NOT_READY", "Agent provisioning job is not ready.");
    if (this.props.attemptCount >= this.props.maxAttempts) throw new DomainConflictError("AGENT_ATTEMPTS_EXHAUSTED", "Agent provisioning attempts are exhausted.");
    if (leaseExpiresAt <= at) throw new DomainValidationError("INVALID_AGENT_JOB_LEASE", "Agent provisioning lease must expire in the future.");
    return new AgentProvisioningJob({ ...this.props, status: "IN_PROGRESS", startedAt: at, processingStartedAt: at, leaseExpiresAt, nextAttemptAt: null, attemptCount: this.props.attemptCount + 1, version: this.props.version + 1, updatedAt: at });
  }
  succeed(at: Date) { return new AgentProvisioningJob({ ...this.props, status: "SUCCEEDED", completedAt: at, errorCategory: null, processingStartedAt: null, leaseExpiresAt: null, version: this.props.version + 1, updatedAt: at }); }
  fail(errorCategory: string, retryAt: Date | null, at: Date) {
    const terminal = !retryAt || this.props.attemptCount >= this.props.maxAttempts;
    return new AgentProvisioningJob({ ...this.props, status: terminal ? "FAILED" : "PENDING", completedAt: terminal ? at : null, errorCategory: terminal ? errorCategory : null, nextAttemptAt: terminal ? null : retryAt, processingStartedAt: null, leaseExpiresAt: null, version: this.props.version + 1, updatedAt: at });
  }
}

export type AgentProvisioningAttemptProps = {
  id: EntityId; jobId: EntityId; attemptNumber: number; provider: string; status: AgentAttemptStatus;
  providerReference: string | null; errorCategory: string | null; retryable: boolean;
  startedAt: Date; completedAt: Date | null; createdAt: Date;
};

export class AgentProvisioningAttempt {
  readonly props: Readonly<AgentProvisioningAttemptProps>;
  constructor(input: AgentProvisioningAttemptProps) {
    if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) throw new DomainValidationError("INVALID_AGENT_ATTEMPT_NUMBER", "Agent attempt number must be positive.");
    if (!["PROCESSING", "SUCCEEDED", "FAILED"].includes(input.status)) throw new DomainValidationError("INVALID_AGENT_ATTEMPT_STATUS", "Agent attempt status is invalid.");
    this.props = Object.freeze({ ...input, provider: requireText(input.provider, "provider", 80).toLowerCase(), providerReference: optionalText(input.providerReference, "providerReference", 255), errorCategory: optionalText(input.errorCategory, "errorCategory", 120) });
  }
  succeed(providerReference: string | null, at: Date) { return new AgentProvisioningAttempt({ ...this.props, status: "SUCCEEDED", providerReference, errorCategory: null, retryable: false, completedAt: at }); }
  fail(errorCategory: string, retryable: boolean, at: Date) { return new AgentProvisioningAttempt({ ...this.props, status: "FAILED", providerReference: null, errorCategory, retryable, completedAt: at }); }
}
