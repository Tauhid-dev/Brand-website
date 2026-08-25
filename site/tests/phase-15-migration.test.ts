import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = ["0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql", "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql", "0009_numerous_meltdown.sql", "0010_stale_kang.sql", "0011_yummy_vin_gonzales.sql", "0012_old_morph.sql", "0013_wooden_siren.sql"];
function apply(database: DatabaseSync, name: string) { for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement); }

test("Phase 15 forward-only migration upgrades Phase 14 without changing commercial records", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const name of NAMES.slice(0, -1)) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('96000000-0000-4000-8000-000000000001','phase-15','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  apply(db, NAMES.at(-1)!);
  assert.equal(db.prepare("select external_reference from customers").get()?.external_reference, "phase-15");
  for (const table of ["billing_checkout_sessions", "billing_provider_price_references"]) assert.ok(db.prepare("select name from sqlite_schema where type='table' and name=?").get(table));
  assert.equal(db.prepare("pragma foreign_key_check").all().length, 0); db.close();
});

test("Phase 15 migration constrains idempotent checkout and provider price references", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('96000000-0000-4000-8000-000000000001','phase-15','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('96000000-0000-4000-8000-000000000002','phase-15','Plan',1,0,0,1,1,1)");
  db.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('96000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','PENDING','MONTHLY','AUD',1,1,1)");
  db.exec("insert into billing_checkout_sessions (id,customer_id,subscription_id,provider,provider_session_id,idempotency_key,status,expires_at,created_at,updated_at) values ('96000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','stripe','cs_test','checkout-key','OPEN',100,1,1)");
  assert.throws(() => db.exec("insert into billing_checkout_sessions (id,customer_id,subscription_id,provider,provider_session_id,idempotency_key,status,expires_at,created_at,updated_at) values ('96000000-0000-4000-8000-000000000005','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','stripe','cs_other','checkout-key','OPEN',100,1,1)"), /UNIQUE/);
  assert.throws(() => db.exec("update billing_checkout_sessions set status='COMPLETED' where provider_session_id='cs_test'"), /CHECK constraint/);
  db.exec("update subscriptions set external_billing_provider='stripe',external_customer_id='cus_test',external_subscription_id='sub_test',version=2,updated_at=2 where id='96000000-0000-4000-8000-000000000003'");
  assert.throws(() => db.exec("update subscriptions set external_subscription_id='sub_changed',version=3,updated_at=3 where id='96000000-0000-4000-8000-000000000003'"), /SUBSCRIPTION_TERMS_IMMUTABLE/);
  db.close();
});
