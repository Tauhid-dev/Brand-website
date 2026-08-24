import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = [
  "0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql",
  "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql",
  "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql",
  "0009_numerous_meltdown.sql",
  "0010_stale_kang.sql",
];
function apply(database: DatabaseSync, name: string) {
  for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement);
}
function upgraded() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of NAMES.slice(0, -2)) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into notification_templates (id,code,channel,version,subject_template,body_template,active,created_at,updated_at) values ('30000000-0000-4000-8000-000000000001','legacy_notice','EMAIL',1,'Legacy','Body',1,10,10)");
  db.exec("insert into notification_deliveries (id,template_id,customer_id,recipient_type,recipient_id,channel,status,template_variables_json,idempotency_key,scheduled_for,attempt_count,max_attempts,next_attempt_at,version,created_at,updated_at) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','CUSTOMER','casey@example.invalid','EMAIL','PROCESSING','{}','legacy-processing',10,1,5,null,2,10,20)");
  apply(db, NAMES.at(-2)!);
  apply(db, NAMES.at(-1)!);
  return db;
}

test("Phase 12 migration upgrades Phase 11, preserves deliveries, and seeds commercial templates", () => {
  const db = upgraded();
  const tables = db.prepare("select name from sqlite_schema where type='table' and name not like 'sqlite_%'").all().map((row) => String(row.name));
  assert.equal(tables.length, 46);
  assert.equal(tables.includes("notification_delivery_attempts"), true);
  const columns = db.prepare("pragma table_info(notification_deliveries)").all().map((row) => String(row.name));
  for (const name of ["processing_started_at", "lease_expires_at", "cancelled_at", "read_at"]) assert.equal(columns.includes(name), true);
  assert.deepEqual({ ...db.prepare("select status,next_attempt_at,version from notification_deliveries where id='40000000-0000-4000-8000-000000000001'").get() }, { status: "PENDING", next_attempt_at: 20, version: 3 });
  assert.equal(db.prepare("select count(*) count from notification_templates where code in ('welcome','payment_overdue','subscription_suspended','agent_ready','integration_action_required')").get()?.count, 6);
  assert.equal(db.prepare("select count(*) count from permissions").get()?.count, 18);
  assert.equal(db.prepare("select count(*) count from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.code='SUPPORT' and p.code='OPERATIONS_WRITE'").get()?.count, 1);
  assert.doesNotThrow(() => db.exec("insert into notification_templates (id,code,channel,version,body_template,active,created_at,updated_at) values ('30000000-0000-4000-8000-000000000002','future_channel','WHATSAPP',1,'Body',1,30,30)"));
  assert.equal(db.prepare("pragma foreign_key_check").all().length, 0);
  db.close();
});

test("Phase 12 delivery attempts and leases are database protected", () => {
  const db = upgraded();
  db.exec("insert into notification_delivery_attempts (id,delivery_id,attempt_number,provider,status,started_at,created_at) values ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,'test','PROCESSING',30,30)");
  assert.throws(() => db.exec("update notification_delivery_attempts set provider='changed' where id='50000000-0000-4000-8000-000000000001'"), /NOTIFICATION_ATTEMPT_IMMUTABLE/);
  assert.throws(() => db.exec("delete from notification_delivery_attempts where id='50000000-0000-4000-8000-000000000001'"), /NOTIFICATION_ATTEMPT_IMMUTABLE/);
  assert.throws(() => db.exec("update notification_deliveries set status='PROCESSING',processing_started_at=30,lease_expires_at=40,version=3,updated_at=30 where id='40000000-0000-4000-8000-000000000001'"), /NOTIFICATION_VERSION_CONFLICT/);
  db.exec("update notification_deliveries set status='PROCESSING',processing_started_at=30,lease_expires_at=40,next_attempt_at=null,version=4,updated_at=30 where id='40000000-0000-4000-8000-000000000001'");
  assert.throws(() => db.exec("update notification_deliveries set status='PENDING',version=5,updated_at=31 where id='40000000-0000-4000-8000-000000000001'"), /notification_deliveries_lease_check/);
  db.close();
});

test("Phase 12 indexes support delivery recovery and operational attention queries", () => {
  const db = upgraded();
  const deliveryPlan = db.prepare("explain query plan select * from notification_deliveries where status='PROCESSING' and lease_expires_at <= 100").all().map((row) => String(row.detail)).join(" ");
  assert.match(deliveryPlan, /notification_deliveries_lease_idx/);
  const queuePlan = db.prepare("explain query plan select * from operational_queue_items where queue_type='BILLING_ATTENTION' and status='OPEN' order by priority,available_at").all().map((row) => String(row.detail)).join(" ");
  assert.match(queuePlan, /operational_queue_items_work_idx/);
  db.close();
});
