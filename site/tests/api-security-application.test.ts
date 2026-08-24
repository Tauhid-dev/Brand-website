import assert from "node:assert/strict";
import test from "node:test";
import { AdminAuthorizationGuard } from "../modules/identity/application/access-control-services.ts";
import type { AdminPrincipal } from "../modules/identity/domain/access-control.ts";
import { IdempotencyService, ManageServiceCredentialService, ServiceAuthenticationService } from "../modules/api/application/api-security-services.ts";
import { D1ApiSecurityRepository } from "../modules/api/infrastructure/d1-api-security-repository.ts";
import { AuthorizationDeniedError, DomainConflictError, RateLimitExceededError } from "../modules/shared/domain/errors.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { RecordingAudit } from "./support/audit.ts";
import { idempotentResponse } from "../app/api/v1/api-http.ts";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const ADMIN_ID = "91000000-0000-4000-8000-000000000001";
const principal: AdminPrincipal = { type: "ADMIN", adminUserId: ADMIN_ID, email: "admin@example.invalid", displayName: "Admin", roles: new Set(["SUPER_ADMIN"]), permissions: new Set(["ADMIN_USER_MANAGE"]) };

function setup() { const context = repositoryDatabase(); context.client.database.exec(`insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('${ADMIN_ID}','chatgpt-siwc','admin-api','admin@example.invalid','Admin','ACTIVE',1,${NOW.getTime()},${NOW.getTime()})`); let sequence = 0; return { ...context, ids: { next: () => `91000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` }, clock: { now: () => NOW } }; }

test("service credentials are hashed, scoped, expiring, rotatable and revocable", async () => { const context = setup(); const repository = new D1ApiSecurityRepository(context.database); const audit = new RecordingAudit(); const manage = new ManageServiceCredentialService(repository, new AdminAuthorizationGuard(), context.ids, context.clock, audit); const issued = await manage.issue(principal, { name: "Agent runtime", scopes: ["customer:read", "entitlement:read"], expiresAt: new Date(NOW.getTime() + 86_400_000) }); const stored = context.client.database.prepare("select secret_hash,scopes_json,status from service_credentials").get(); assert.equal(String(stored?.secret_hash).length, 64); assert.equal(issued.rawToken.includes(String(stored?.secret_hash)), false); assert.equal(JSON.stringify(stored).includes(issued.rawToken), false); const authenticated = await new ServiceAuthenticationService(repository, context.clock, audit).authenticate(`Bearer ${issued.rawToken}`, "customer:read"); assert.equal(authenticated.credentialId, issued.credential.props.id.value); await assert.rejects(() => new ServiceAuthenticationService(repository, context.clock, audit).authenticate(`Bearer ${issued.rawToken}`, "agent-link:write"), AuthorizationDeniedError); const rotated = await manage.rotate(principal, issued.credential.props.id.value, new Date(NOW.getTime() + 172_800_000)); await assert.rejects(() => new ServiceAuthenticationService(repository, context.clock, audit).authenticate(`Bearer ${issued.rawToken}`, "customer:read"), /Valid service credentials/); assert.equal((await new ServiceAuthenticationService(repository, context.clock, audit).authenticate(`Bearer ${rotated.rawToken}`, "customer:read")).credentialId, rotated.credential.props.id.value); await manage.revoke(principal, rotated.credential.props.id.value); await manage.revoke(principal, rotated.credential.props.id.value); await assert.rejects(() => new ServiceAuthenticationService(repository, context.clock, audit).authenticate(`Bearer ${rotated.rawToken}`, "customer:read"), /Valid service credentials/); assert.equal(audit.records.some((record) => record.action === "SERVICE_CREDENTIAL_ROTATED"), true); context.client.close(); });

test("service authentication applies a durable fixed-window rate limit", async () => { const context = setup(); const repository = new D1ApiSecurityRepository(context.database); const issued = await new ManageServiceCredentialService(repository, new AdminAuthorizationGuard(), context.ids, context.clock, new RecordingAudit()).issue(principal, { name: "Limited", scopes: ["customer:read"], expiresAt: new Date(NOW.getTime() + 86_400_000) }); const auth = new ServiceAuthenticationService(repository, context.clock, new RecordingAudit(), 1); await auth.authenticate(`Bearer ${issued.rawToken}`, "customer:read"); await assert.rejects(() => auth.authenticate(`Bearer ${issued.rawToken}`, "customer:read"), RateLimitExceededError); assert.equal(context.client.database.prepare("select request_count from service_rate_limits").get()?.request_count, 2); context.client.close(); });

test("idempotency replays completed outcomes and rejects concurrent or changed payloads", async () => { const context = setup(); const service = new IdempotencyService(new D1ApiSecurityRepository(context.database), context.ids, context.clock); const first = await service.begin({ scope: "admin:customers", key: "request-123", requestHash: "hash-a" }); assert.equal(first.kind, "EXECUTE"); if (first.kind === "EXECUTE") await service.complete(first.id, 201, { data: { id: "customer-1" } }); assert.deepEqual(await service.begin({ scope: "admin:customers", key: "request-123", requestHash: "hash-a" }), { kind: "REPLAY", status: 201, body: { data: { id: "customer-1" } } }); await assert.rejects(() => service.begin({ scope: "admin:customers", key: "request-123", requestHash: "hash-b" }), DomainConflictError); const processing = await service.begin({ scope: "admin:subscriptions", key: "request-456", requestHash: "hash-c" }); assert.equal(processing.kind, "EXECUTE"); await assert.rejects(() => service.begin({ scope: "admin:subscriptions", key: "request-456", requestHash: "hash-c" }), /already processing/); context.client.close(); });

test("HTTP idempotency returns the original response without executing a commercial write twice", async () => { const context = setup(); const repository = new D1ApiSecurityRepository(context.database); const request = new Request("https://example.invalid/api/v1/admin/customers", { method: "POST", headers: { "idempotency-key": "request-http-123" } }); let executions = 0; const invoke = () => idempotentResponse({ request, requestId: "request-id", scope: "admin:customers:post", body: { businessName: "Example" }, repository, ids: context.ids, clock: context.clock, execute: async () => { executions += 1; return Response.json({ data: { id: "customer-1" } }, { status: 201 }); } }); const first = await invoke(); const replay = await invoke(); assert.equal(first.status, 201); assert.equal(replay.status, 201); assert.equal(replay.headers.get("x-idempotent-replay"), "true"); assert.equal(executions, 1); context.client.close(); });

test("a failed replay-record write keeps a completed commercial operation blocked", async () => {
  const context = setup();
  const durable = new D1ApiSecurityRepository(context.database);
  const repository = {
    ...durable,
    createCredential: durable.createCredential.bind(durable),
    rotateCredential: durable.rotateCredential.bind(durable),
    revokeCredential: durable.revokeCredential.bind(durable),
    findCredential: durable.findCredential.bind(durable),
    markCredentialUsed: durable.markCredentialUsed.bind(durable),
    consumeRateLimit: durable.consumeRateLimit.bind(durable),
    claimIdempotency: durable.claimIdempotency.bind(durable),
    completeIdempotency: async () => { throw new Error("completion store unavailable"); },
    releaseIdempotency: durable.releaseIdempotency.bind(durable),
  };
  const request = new Request("https://example.invalid/api/v1/admin/customers", { method: "POST", headers: { "idempotency-key": "request-http-456" } });
  let executions = 0;
  const invoke = () => idempotentResponse({ request, requestId: "request-id", scope: "admin:customers:post", body: { businessName: "Example" }, repository, ids: context.ids, clock: context.clock, execute: async () => { executions += 1; return Response.json({ data: { id: "customer-1" } }, { status: 201 }); } });
  await assert.rejects(invoke, /completion store unavailable/);
  await assert.rejects(invoke, /already processing/);
  assert.equal(executions, 1);
  assert.equal(context.client.database.prepare("select state from idempotency_keys").get()?.state, "PROCESSING");
  context.client.close();
});
