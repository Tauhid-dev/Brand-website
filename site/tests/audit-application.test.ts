import assert from "node:assert/strict";
import test from "node:test";
import { AuditService, RedactingAuditSnapshotSanitizer } from "../modules/audit/application/audit-service.ts";
import type { AuditEventRepository } from "../modules/audit/application/ports.ts";
import type { AuditEvent } from "../modules/audit/domain/audit-event.ts";
import { RequestContextFactory } from "../modules/shared/application/request-context.ts";
import { D1AuditEventRepository } from "../modules/audit/infrastructure/d1-audit-event-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-24T00:00:00.000Z");

class MemoryAuditEvents implements AuditEventRepository {
  readonly values: AuditEvent[] = [];
  async append(event: AuditEvent) { this.values.push(event); }
}

test("audit service binds actor/request metadata and redacts secrets recursively", async () => {
  const repository = new MemoryAuditEvents();
  const context = new RequestContextFactory(
    { next: () => "request-1" },
    { now: () => NOW },
  ).create({
    actor: { type: "ADMIN", id: "admin-1" },
    ipAddress: "203.0.113.8",
    userAgent: "Example Browser",
  });
  const audit = new AuditService(
    repository,
    { next: () => "10000000-0000-4000-8000-000000000001" },
    { now: () => NOW },
    context,
  );
  await audit.record({
    action: "CUSTOMER_UPDATED",
    entityType: "CUSTOMER",
    entityId: "customer-1",
    before: { status: "PROSPECT", passwordHash: "must-not-appear" },
    after: { status: "ACTIVE", nested: { rawToken: "must-not-appear", safe: "retained" } },
  });
  const event = repository.values[0];
  assert.equal(event?.props.actor.type, "ADMIN");
  assert.equal(event?.props.requestId, "request-1");
  assert.equal(event?.props.ipAddress, "203.0.113.8");
  assert.deepEqual(event?.props.before, { status: "PROSPECT", passwordHash: "[REDACTED]" });
  assert.deepEqual(event?.props.after, { status: "ACTIVE", nested: { rawToken: "[REDACTED]", safe: "retained" } });
});

test("audit sanitizer safely handles dates, circular values, long strings, and unsupported values", () => {
  const value: Record<string, unknown> = { at: NOW, fn: () => undefined, long: "x".repeat(5_000) };
  value.self = value;
  const result = new RedactingAuditSnapshotSanitizer().sanitize(value) as Record<string, unknown>;
  assert.equal(result.at, NOW.toISOString());
  assert.equal(result.self, "[CIRCULAR]");
  assert.equal(result.fn, null);
  assert.equal(String(result.long).length, 4_000);
});

test("D1 audit adapter persists the sanitized append-only record", async () => {
  const context = repositoryDatabase();
  const request = new RequestContextFactory(
    { next: () => "request-2" },
    { now: () => NOW },
  ).create({ actor: { type: "SYSTEM", id: "system" } });
  await new AuditService(
    new D1AuditEventRepository(context.database),
    { next: () => "10000000-0000-4000-8000-000000000002" },
    { now: () => NOW },
    request,
  ).record({ action: "SYSTEM_CHECK", entityType: "AUDIT_EVENT", after: { apiKey: "secret", result: "ok" } });
  const row = context.client.database.prepare("select actor_type, after_json from audit_events where id = ?")
    .get("10000000-0000-4000-8000-000000000002");
  assert.equal(row?.actor_type, "SYSTEM");
  assert.deepEqual(JSON.parse(String(row?.after_json)), { apiKey: "[REDACTED]", result: "ok" });
  context.client.close();
});
