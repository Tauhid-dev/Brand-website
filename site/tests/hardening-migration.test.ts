import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = ["0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql", "0006_broken_centennial.sql", "0007_regular_shadowcat.sql"];
function apply(database: DatabaseSync, name: string) { const sql = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"); for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement); }
function upgraded() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES) apply(database, name); return database; }

test("Phase 10 migration upgrades Phase 9 and adds durable hardening state", () => {
  const db = upgraded();
  const tables = db.prepare("select name from sqlite_schema where type='table' and name not like 'sqlite_%'").all().map((row) => String(row.name));
  assert.equal(tables.length, 43);
  assert.equal(tables.includes("billing_webhook_events"), true);
  assert.equal(tables.includes("api_rate_limits"), true);
  db.close();
});

test("billing webhook identity, deduplication and terminal outcomes are database protected", () => {
  const db = upgraded();
  const insert = "insert into billing_webhook_events (id,provider,provider_event_id,event_type,payload_hash,normalized_payload_json,status,attempt_count,max_attempts,occurred_at,received_at,processing_started_at,request_id,created_at,updated_at) values ('a0000000-0000-4000-8000-000000000001','stripe','evt_1','invoice.paid','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}','PROCESSING',1,5,1,2,2,'request-1',2,2)";
  db.exec(insert);
  assert.throws(() => db.exec(insert.replace("000000000001", "000000000002")), /UNIQUE/);
  assert.throws(() => db.exec("update billing_webhook_events set payload_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',status='PROCESSED',processed_at=3,updated_at=3 where provider_event_id='evt_1'"), /BILLING_WEBHOOK_IDENTITY_IMMUTABLE/);
  db.exec("update billing_webhook_events set attempt_count=2,processing_started_at=3,updated_at=3 where provider_event_id='evt_1'");
  assert.throws(() => db.exec("update billing_webhook_events set processing_started_at=4,updated_at=4 where provider_event_id='evt_1'"), /INVALID_BILLING_WEBHOOK_TRANSITION/);
  db.exec("update billing_webhook_events set status='PROCESSED',processed_at=4,updated_at=4 where provider_event_id='evt_1'");
  assert.equal(db.prepare("select count(*) as count from sqlite_schema where type='trigger' and name='billing_webhook_events_terminal_immutable'").get()?.count, 1);
  assert.throws(() => db.exec("update billing_webhook_events set updated_at=4 where provider_event_id='evt_1'"), /BILLING_WEBHOOK_TERMINAL|INVALID_BILLING_WEBHOOK_TRANSITION/);
  db.close();
});

test("provider-linked subscriptions permit period reconciliation without weakening immutable terms", () => {
  const db = upgraded();
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('a0000000-0000-4000-8000-000000000010','customer-10','Example Pty Ltd','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('a0000000-0000-4000-8000-000000000011','growth','Growth',1,0,0,1,1,1)");
  db.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,started_at,current_period_start,current_period_end,external_billing_provider,external_customer_id,external_subscription_id,version,created_at,updated_at) values ('a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000011','ACTIVE','MONTHLY','AUD',1,1,2,'stripe','cus_1','sub_1',1,1,1)");
  db.exec("update subscriptions set current_period_start=2,current_period_end=3,version=2,updated_at=2 where external_subscription_id='sub_1'");
  assert.equal(db.prepare("select current_period_end from subscriptions where external_subscription_id='sub_1'").get()?.current_period_end, 3);
  assert.throws(() => db.exec("update subscriptions set plan_id='changed',current_period_end=4,version=3,updated_at=3 where external_subscription_id='sub_1'"), /SUBSCRIPTION_TERMS_IMMUTABLE/);
  db.close();
});

test("hardening cleanup and retry lookups use their indexes", () => {
  const db = upgraded();
  const rate = db.prepare("explain query plan select * from api_rate_limits where window_started_at < 100").all().map((row) => String(row.detail)).join(" ");
  const webhook = db.prepare("explain query plan select * from billing_webhook_events where status='FAILED' and next_attempt_at < 100").all().map((row) => String(row.detail)).join(" ");
  assert.match(rate, /api_rate_limits_window_idx/);
  assert.match(webhook, /billing_webhook_events_ready_idx/);
  db.close();
});
