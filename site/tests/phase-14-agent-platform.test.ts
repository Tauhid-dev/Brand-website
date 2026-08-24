import assert from "node:assert/strict";
import test from "node:test";
import { ReconcileAgentPlatformService, RequestAgentProvisioningService, RunAgentProvisioningService, SynchronizeAgentLinkService } from "../modules/agent/application/agent-provisioning-services.ts";
import { AgentProvisioningAttempt } from "../modules/agent/domain/agent-provisioning.ts";
import { D1AgentProvisioningRepository } from "../modules/agent/infrastructure/d1-agent-provisioning-repository.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { NOOP_AUDIT, RecordingAudit } from "./support/audit.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const CUSTOMER_ID = "94000000-0000-4000-8000-000000000001";
const START = new Date("2026-08-25T00:00:00.000Z");

function setup() {
  const context = repositoryDatabase();
  context.client.database.exec(`insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('${CUSTOMER_ID}','phase-14-customer','Example Plumbing','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)`);
  let sequence = 0; let now = START;
  return { ...context, ids: { next: () => `94000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` }, clock: { now: () => now }, advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); } };
}

test("agent processing records immutable provider attempts and recovers an expired lease", async () => {
  const context = setup(); const repository = new D1AgentProvisioningRepository(context.database);
  await new RequestAgentProvisioningService(repository, context.ids, context.clock, NOOP_AUDIT).execute({ customerId: CUSTOMER_ID, platform: "zuno_agent", operation: "PROVISION", idempotencyKey: "phase-14-provision" });
  const pending = await repository.findReadyJob(context.clock.now()); assert.ok(pending);
  const started = pending.start(context.clock.now(), new Date(context.clock.now().getTime() + 120_000));
  const first = new AgentProvisioningAttempt({ id: new EntityId(context.ids.next()), jobId: started.props.id, attemptNumber: 1, provider: "zuno_agent", status: "PROCESSING", providerReference: null, errorCategory: null, retryable: false, startedAt: context.clock.now(), completedAt: null, createdAt: context.clock.now() });
  await repository.startJob(started, pending.props.version, first);
  context.advance(121_000);
  const completed = await new RunAgentProvisioningService(repository, { execute: async () => ({ externalAgentId: "agent-14", providerReference: "provider-14" }), inspect: async () => ({ status: "ACTIVE", externalAgentId: "agent-14", providerReference: null }) }, context.ids, context.clock, NOOP_AUDIT).execute();
  assert.equal(completed?.props.status, "SUCCEEDED");
  const attempts = context.client.database.prepare("select attempt_number,status,error_category,provider_reference from agent_provisioning_attempts order by attempt_number").all().map((row) => ({ ...row }));
  assert.deepEqual(attempts, [{ attempt_number: 1, status: "FAILED", error_category: "LEASE_EXPIRED", provider_reference: null }, { attempt_number: 2, status: "SUCCEEDED", error_category: null, provider_reference: "provider-14" }]);
  assert.throws(() => context.client.database.exec("delete from agent_provisioning_attempts"), /AGENT_ATTEMPT_IMMUTABLE/);
  context.client.close();
});

test("an expired final lease becomes a terminal observable failure instead of stranded work", async () => {
  const context = setup(); const repository = new D1AgentProvisioningRepository(context.database); const expired = START.getTime() - 1;
  context.client.database.exec(`insert into agent_links (id,customer_id,agent_platform,status,version,created_at,updated_at) values ('94000000-0000-4000-8000-000000000010','${CUSTOMER_ID}','zuno_agent','PENDING',1,1,1)`);
  context.client.database.exec(`insert into agent_provisioning_jobs (id,agent_link_id,customer_id,operation,status,idempotency_key,attempt_count,max_attempts,processing_started_at,lease_expires_at,requested_at,started_at,version,created_at,updated_at) values ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000010','${CUSTOMER_ID}','PROVISION','IN_PROGRESS','phase-14-final-lease',5,5,${expired - 120_000},${expired},1,1,1,1,1)`);
  context.client.database.exec(`insert into agent_provisioning_attempts (id,job_id,attempt_number,provider,status,retryable,started_at,created_at) values ('94000000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000011',5,'zuno_agent','PROCESSING',0,1,1)`);
  let providerCalled = false; const result = await new RunAgentProvisioningService(repository, { execute: async () => { providerCalled = true; return { externalAgentId: "unexpected", providerReference: null }; }, inspect: async () => ({ status: "MISSING", externalAgentId: null, providerReference: null }) }, context.ids, context.clock, NOOP_AUDIT).execute();
  assert.equal(providerCalled, false); assert.equal(result?.props.status, "FAILED");
  assert.equal(context.client.database.prepare("select status,error_category from agent_provisioning_attempts").get()?.error_category, "LEASE_EXPIRED");
  assert.equal(context.client.database.prepare("select status from agent_links").get()?.status, "ERROR");
  context.client.close();
});

test("service-authenticated link synchronization is auditable and does not require browser identity", async () => {
  const context = setup(); const audit = new RecordingAudit(); const service = new SynchronizeAgentLinkService(new D1AgentProvisioningRepository(context.database), context.ids, context.clock, audit);
  const active = await service.execute({ customerId: CUSTOMER_ID, platform: "zuno_agent", externalAgentId: "agent-14", status: "ACTIVE" });
  assert.equal(active.props.status, "ACTIVE"); assert.equal(audit.records.at(-1)?.action, "AGENT_LINK_SYNCHRONIZED");
  const suspended = await service.execute({ customerId: CUSTOMER_ID, platform: "zuno_agent", externalAgentId: "agent-14", status: "SUSPENDED" });
  assert.equal(suspended.props.version, active.props.version + 1);
  context.client.close();
});

test("reconciliation queues resumption when commercial access is valid but the provider is suspended", async () => {
  const context = setup(); const repository = new D1AgentProvisioningRepository(context.database); const synchronize = new SynchronizeAgentLinkService(repository, context.ids, context.clock, NOOP_AUDIT);
  await synchronize.execute({ customerId: CUSTOMER_ID, platform: "zuno_agent", externalAgentId: "agent-14", status: "SUSPENDED" });
  const request = new RequestAgentProvisioningService(repository, context.ids, context.clock, NOOP_AUDIT);
  const provider = { execute: async () => ({ externalAgentId: "agent-14", providerReference: null }), inspect: async () => ({ status: "SUSPENDED" as const, externalAgentId: "agent-14", providerReference: "inspect-14" }) };
  const entitlements = { getEntitlements: async () => ({ customerId: CUSTOMER_ID, subscriptionId: "subscription-14", subscriptionStatus: "ACTIVE", planId: "plan-14", validUntil: null, valid: true, entitlements: {} }) };
  const result = await new ReconcileAgentPlatformService(repository, entitlements, provider, request, synchronize).execute({ customerId: CUSTOMER_ID, platform: "zuno_agent", idempotencyKey: "phase-14-reconcile" });
  assert.deepEqual(result, { action: "QUEUED", operation: "RESUME", jobId: String(context.client.database.prepare("select id from agent_provisioning_jobs").get()?.id) });
  assert.equal(context.client.database.prepare("select operation from agent_provisioning_jobs").get()?.operation, "RESUME");
  context.client.close();
});
