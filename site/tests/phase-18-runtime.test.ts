import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { resolveDatabaseRuntime, requirePostgresUrl } from "../db/runtime-config.ts";
import { postgresPlaceholders } from "../db/postgres-d1-adapter.ts";
import { runtimeEnv } from "../db/runtime-env.ts";
import { resolveIdentityRuntime, safeReturnTo, standaloneIdentityConfig } from "../modules/identity/infrastructure/identity-runtime-config.ts";
import { openStandaloneSession, sealStandaloneSession, sessionKey } from "../modules/identity/infrastructure/oidc-session.ts";

const SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";

test("database runtime selection is explicit and rejects unsupported backends", () => {
  assert.equal(resolveDatabaseRuntime("d1"), "d1");
  assert.equal(resolveDatabaseRuntime("postgres"), "postgres");
  assert.equal(resolveDatabaseRuntime(undefined), "d1");
  assert.throws(() => resolveDatabaseRuntime("sqlite"), /Unsupported DATABASE_RUNTIME/);
  assert.equal(requirePostgresUrl("postgresql://user:pass@postgres:5432/zuno").includes("postgres"), true);
  assert.throws(() => requirePostgresUrl("https://database.example"), /postgres/);
});

test("standalone provider configuration reads process environment without Cloudflare bindings", async () => {
  const previous = { runtime: process.env.DATABASE_RUNTIME, stripe: process.env.STRIPE_SECRET_KEY };
  process.env.DATABASE_RUNTIME = "postgres";
  process.env.STRIPE_SECRET_KEY = "sk_test_portable";
  try { assert.equal((await runtimeEnv()).STRIPE_SECRET_KEY, "sk_test_portable"); }
  finally {
    if (previous.runtime === undefined) delete process.env.DATABASE_RUNTIME; else process.env.DATABASE_RUNTIME = previous.runtime;
    if (previous.stripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previous.stripe;
  }
});

test("PostgreSQL adapter converts only real SQLite placeholders", () => {
  assert.equal(postgresPlaceholders(`select '?' as literal, \"question?\" from \`items\` where a = ? and b = ?`), `select '?' as literal, \"question?\" from \"items\" where a = $1 and b = $2`);
});

test("standalone sessions are encrypted, expiring and reject tampering", async () => {
  assert.equal(sessionKey(SECRET).byteLength, 32);
  const token = await sealStandaloneSession({ provider: "company-oidc", externalSubject: "subject-1", email: "admin@example.com", displayName: "Admin", csrfToken: "csrf" }, SECRET, 300);
  assert.equal(token.includes("admin@example.com"), false);
  assert.equal((await openStandaloneSession(token, SECRET))?.externalSubject, "subject-1");
  assert.equal(await openStandaloneSession(`${token}tampered`, SECRET), null);
  const expired = await sealStandaloneSession({ provider: "company-oidc", externalSubject: "expired", email: "expired@example.com", displayName: "Expired", csrfToken: "csrf" }, SECRET, -10);
  assert.equal(await openStandaloneSession(expired, SECRET), null);
  assert.throws(() => sessionKey("short"), /base64url|32 bytes/);
});

test("OIDC configuration requires production HTTPS and bounded sessions", () => {
  const base = { NODE_ENV: "production", OIDC_ISSUER: "https://id.example.com", APP_BASE_URL: "https://staging.example.com", OIDC_CLIENT_ID: "client", OIDC_CLIENT_SECRET: "secret", OIDC_PROVIDER_ID: "company", OIDC_SESSION_SECRET: SECRET } as NodeJS.ProcessEnv;
  assert.equal(standaloneIdentityConfig(base).redirectUri, "https://staging.example.com/auth/callback");
  assert.throws(() => standaloneIdentityConfig({ ...base, APP_BASE_URL: "http://staging.example.com" }), /HTTPS/);
  assert.throws(() => standaloneIdentityConfig({ ...base, OIDC_CLIENT_SECRET: "" }), /OIDC_CLIENT_SECRET/);
  assert.throws(() => resolveIdentityRuntime("headers"), /Unsupported IDENTITY_RUNTIME/);
  assert.equal(safeReturnTo("//evil.example/admin"), "/");
  assert.equal(safeReturnTo("/admin?view=1"), "/admin?view=1");
});

test("PostgreSQL baseline remains generated from the final D1 schema", async () => {
  const migration = await readFile(new URL("../postgres/migrations/0000_phase_18_baseline.sql", import.meta.url), "utf8");
  const snapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0014_snapshot.json", import.meta.url), "utf8"));
  assert.equal((migration.match(/^create table /gm) ?? []).length, Object.keys(snapshot.tables).length);
  assert.equal((migration.match(/^create (?:unique )?index /gm) ?? []).length, 139);
  assert.match(migration, /audit_events_immutable_update/);
  assert.match(migration, /plan_prices_no_overlap/);
  assert.match(migration, /role_super_admin/);
});

test("PostgreSQL baseline installs cleanly with constraints and immutable audit history", async () => {
  const migration = await readFile(new URL("../postgres/migrations/0000_phase_18_baseline.sql", import.meta.url), "utf8");
  const postgres = new PGlite();
  try {
    await postgres.exec(migration);
    const tables = await postgres.query<{ count: number }>("select count(*)::int as count from information_schema.tables where table_schema='public'");
    assert.equal(tables.rows[0].count, 50);
    await postgres.exec("insert into audit_events (id,actor_type,action,entity_type,request_id,created_at) values ('audit-1','ANONYMOUS','TESTED','SYSTEM','request-1',1)");
    await assert.rejects(() => postgres.exec("delete from audit_events where id='audit-1'"), /AUDIT_EVENTS_IMMUTABLE/);
  } finally {
    await postgres.close();
  }
});

test("standalone logout is POST-only and CSRF checked", async () => {
  const source = await readFile(new URL("../app/auth/logout/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function GET/);
  assert.match(source, /headers\.get\("origin"\)/);
  assert.match(source, /csrfToken/);
});
