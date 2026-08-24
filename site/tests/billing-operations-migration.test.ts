import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = ["0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql", "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql"];
function apply(database: DatabaseSync, name: string) { for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement); }
function upgraded() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES) apply(database, name); return database; }

test("Phase 11 migration upgrades Phase 10 without losing subscriptions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of NAMES.slice(0, -1)) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000001','customer-1','Example Pty Ltd','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000002','growth','Growth',1,0,0,1,1,1)");
  db.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','ACTIVE','MONTHLY','AUD',1,1,1)");
  apply(db, NAMES.at(-1)!);
  assert.equal(db.prepare("select status from subscriptions where id='d0000000-0000-4000-8000-000000000003'").get()?.status, "ACTIVE");
  assert.equal(db.prepare("select count(*) as count from pragma_table_info('subscriptions') where name in ('grace_period_ends_at','service_extended_until')").get()?.count, 2);
  assert.equal(db.prepare("select count(*) as count from sqlite_schema where type='table' and name in ('customer_billing_profiles','billing_notes')").get()?.count, 2);
  db.close();
});

test("Phase 11 lifecycle and billing history invariants are database protected", () => {
  const db = upgraded();
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000001','customer-1','Example Pty Ltd','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000002','growth','Growth',1,0,0,1,1,1)");
  db.exec("insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000004','test','admin','admin@example.invalid','Admin','ACTIVE',0,1,1)");
  db.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,current_period_start,current_period_end,version,created_at,updated_at) values ('d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','ACTIVE','MONTHLY','AUD',1,100,1,1,1)");
  db.exec("update subscriptions set status='CANCEL_AT_PERIOD_END',cancel_at=100,version=2,updated_at=2 where id='d0000000-0000-4000-8000-000000000003'");
  assert.throws(() => db.exec("update subscriptions set status='ACTIVE',version=2,updated_at=3 where id='d0000000-0000-4000-8000-000000000003'"), /SUBSCRIPTION_VERSION_CONFLICT/);
  db.exec("insert into billing_notes (id,customer_id,subscription_id,body,author_admin_user_id,created_at) values ('d0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','Payment arrangement agreed.','d0000000-0000-4000-8000-000000000004',2)");
  assert.throws(() => db.exec("update billing_notes set body='Changed' where id='d0000000-0000-4000-8000-000000000005'"), /BILLING_NOTE_IMMUTABLE/);
  assert.throws(() => db.exec("delete from billing_notes where id='d0000000-0000-4000-8000-000000000005'"), /BILLING_NOTE_IMMUTABLE/);
  db.close();
});
