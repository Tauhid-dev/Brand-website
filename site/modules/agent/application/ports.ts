import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import type { AgentLink, AgentOperation, AgentProvisioningJob } from "../domain/agent-provisioning.ts";
export interface AgentProvisioningRepository { findLink(customerId: string, platform: string): Promise<AgentLink | null>; findLinkById(id: string): Promise<AgentLink | null>; findJobByIdempotencyKey(key: string): Promise<AgentProvisioningJob | null>; findReadyJob(at: Date): Promise<AgentProvisioningJob | null>; createRequest(link: AgentLink, expectedLinkVersion: number | null, job: AgentProvisioningJob, queue: OperationalQueueItem): Promise<void>; startJob(job: AgentProvisioningJob, expectedVersion: number): Promise<void>; saveOutcome(link: AgentLink, expectedLinkVersion: number, job: AgentProvisioningJob, expectedJobVersion: number, resolveQueue: boolean): Promise<void>; }
export interface AgentProvisioner { execute(input: { operation: AgentOperation; platform: string; customerId: string; externalAgentId: string | null; idempotencyKey: string }): Promise<{ externalAgentId: string }>; }

export interface AgentIntegrationRepository {
  findCustomerProfile(customerId: string): Promise<{ id: string; businessName: string; websiteUrl: string | null; industry: string | null; timezone: string; state: string | null } | null>;
  findAgentLink(customerId: string): Promise<{ platform: string; externalAgentId: string | null; status: string } | null>;
  findPlanCode(planId: string): Promise<string | null>;
}

export interface CustomerEntitlementReader {
  getEntitlements(customerId: string): Promise<{ customerId: string; subscriptionId: string; subscriptionStatus: string; planId: string; validUntil: string | null; valid: boolean; entitlements: Readonly<Record<string, { enabled: boolean; limitValue: number | null; limitUnit: string | null }>> } | null>;
}
