import assert from "node:assert/strict";
import test from "node:test";
import { RunSystemMaintenanceService } from "../modules/hardening/application/system-hardening-services.ts";
import { D1SystemHardeningRepository } from "../modules/hardening/infrastructure/d1-system-hardening-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { RecordingAudit } from "./support/audit.ts";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const ADMIN_ID = "f0000000-0000-4000-8000-000000000001";

function setup() {
  const context = repositoryDatabase();
  context.client.database.exec(`insert into admin_users (id,identity_provider,external_subject,email,display_name,status,created_at,updated_at) values ('${ADMIN_ID}','chatgpt','phase-16-admin','admin@example.invalid','Operations','ACTIVE',1,1)`);
  let sequence = 10;
  return { ...context, ids: { next: () => `f0000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` }, clock: { now: () => NOW }, audit: new RecordingAudit() };
}

test("maintenance applies bounded retention, preserves audit evidence and records a durable immutable result", async () => {
  const context = setup();
  const old = new Date("2026-01-01T00:00:00.000Z").getTime();
  context.client.database.exec(`insert into audit_events (id,actor_type,actor_id,action,entity_type,entity_id,request_id,ip_address,user_agent,created_at) values ('f0000000-0000-4000-8000-000000000020','ADMIN','${ADMIN_ID}','CUSTOMER_CREATED','CUSTOMER','customer-1','request-1','203.0.113.1','private-agent',${old})`);
  context.client.database.exec(`insert into idempotency_keys (id,scope,key,request_hash,state,expires_at,created_at,updated_at) values ('f0000000-0000-4000-8000-000000000021','admin:test','old-key','${"a".repeat(64)}','PROCESSING',${old + 1000},${old},${old})`);
  context.client.database.exec(`insert into api_rate_limits (scope,subject_hash,window_started_at,request_count,updated_at) values ('admin:api','${"b".repeat(64)}',${old},1,${old})`);
  const results: Array<"PROCESSED" | "IGNORED" | "FAILED" | "EMPTY"> = ["PROCESSED", "IGNORED", "FAILED", "EMPTY"];
  const service = new RunSystemMaintenanceService(new D1SystemHardeningRepository(context.database), { execute: async () => results.shift() ?? "EMPTY" }, context.ids, context.clock, context.audit, { auditNetworkMetadataDays: 30, rateLimitDays: 2, maxWebhookRecoveries: 10 });
  const result = await service.execute(ADMIN_ID);
  assert.deepEqual([result.summary.idempotencyKeysDeleted, result.summary.apiRateLimitsDeleted, result.summary.auditNetworkMetadataRedacted], [1, 1, 1]);
  assert.deepEqual([result.summary.webhooksProcessed, result.summary.webhooksIgnored, result.summary.webhooksFailed], [1, 1, 1]);
  const audit = context.client.database.prepare("select action,ip_address,user_agent from audit_events where id='f0000000-0000-4000-8000-000000000020'").get();
  assert.equal(audit?.action, "CUSTOMER_CREATED");
  assert.equal(audit?.ip_address, null);
  assert.equal(audit?.user_agent, null);
  assert.throws(() => context.client.database.exec("update audit_events set action='CHANGED' where id='f0000000-0000-4000-8000-000000000020'"), /AUDIT_EVENTS_IMMUTABLE/);
  assert.equal(context.client.database.prepare("select status from system_maintenance_runs").get()?.status, "SUCCEEDED");
  assert.throws(() => context.client.database.exec("delete from system_maintenance_runs"), /SYSTEM_MAINTENANCE_RUN_IMMUTABLE/);
  assert.equal(context.audit.records.some((record) => record.action === "SYSTEM_MAINTENANCE_COMPLETED"), true);
  context.client.close();
});

test("a partial maintenance failure records a stable failed outcome", async () => {
  let failure: string | null = null;
  const audit = new RecordingAudit();
  const repository = {
    readiness: async () => { throw new Error("unused"); },
    start: async () => undefined,
    applyRetention: async () => { throw new Error("provider connection detail"); },
    succeed: async () => undefined,
    fail: async (_runId: string, failureCode: string) => { failure = failureCode; },
  };
  const service = new RunSystemMaintenanceService(repository, { execute: async () => "EMPTY" }, { next: () => "f0000000-0000-4000-8000-000000000099" }, { now: () => NOW }, audit);
  await assert.rejects(() => service.execute(ADMIN_ID), /provider connection detail/);
  assert.equal(failure, "SYSTEM_MAINTENANCE_FAILED");
  assert.equal(audit.records.at(-1)?.action, "SYSTEM_MAINTENANCE_FAILED");
  assert.doesNotMatch(JSON.stringify(audit.records), /provider connection detail/);
});

test("readiness is PII-free and degrades on terminal recovery work", async () => {
  const context = setup();
  context.client.database.exec(`insert into billing_webhook_events (id,provider,provider_event_id,event_type,payload_hash,normalized_payload_json,status,attempt_count,max_attempts,occurred_at,received_at,processing_started_at,failure_code,request_id,created_at,updated_at) values ('f0000000-0000-4000-8000-000000000030','stripe','evt_terminal','invoice.paid','${"c".repeat(64)}','{"kind":"INVOICE_PAID"}','FAILED',5,5,1,1,1,'PROVIDER_OUTAGE','request-terminal',1,1)`);
  const readiness = await new D1SystemHardeningRepository(context.database).readiness(NOW);
  assert.equal(readiness.status, "DEGRADED");
  assert.equal(readiness.backlog.billingWebhooksTerminal, 1);
  assert.deepEqual(Object.keys(readiness), ["status", "checkedAt", "backlog", "lastSuccessfulMaintenanceAt"]);
  assert.doesNotMatch(JSON.stringify(readiness), /example\.invalid|external_subject|normalizedPayload/i);
  context.client.close();
});
