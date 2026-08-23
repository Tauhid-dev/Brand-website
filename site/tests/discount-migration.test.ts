import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const MIGRATIONS = [
  new URL("../drizzle/0000_uneven_violations.sql", import.meta.url),
  new URL("../drizzle/0001_last_rafael_vega.sql", import.meta.url),
  new URL("../drizzle/0002_windy_sprite.sql", import.meta.url),
];

function apply(database: DatabaseSync, migration: URL): void {
  for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

function upgradedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  apply(database, MIGRATIONS[0]);
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  apply(database, MIGRATIONS[1]);
  database.exec("insert into plan_prices (id,plan_id,currency,billing_interval,amount_minor,setup_fee_minor,tax_behaviour,effective_from,active,created_by,created_at) values ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',64900,299000,'EXCLUSIVE',100,1,'admin-1',1)");
  apply(database, MIGRATIONS[2]);
  return database;
}

function seedDiscount(database: DatabaseSync): void {
  database.exec("insert into discounts (id,code,name,discount_type,percent_off_basis_points,duration_type,starts_at,max_redemptions,active,stackable,created_by,created_at,updated_at) values ('70000000-0000-4000-8000-000000000001','launch_20','Launch 20','PERCENTAGE',2000,'FOREVER',100,1,1,0,'admin-1',1,1)");
  database.exec("insert into promotion_codes (id,discount_id,code,active,starts_at,max_redemptions,redemption_count,first_purchase_only,created_at,updated_at) values ('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','LAUNCH20',1,100,1,0,0,1,1)");
  database.exec("insert into customer_discounts (id,customer_id,discount_id,promotion_code_id,source,effective_from,status,applied_by,reason,created_at,updated_at) values ('70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','PROMOTION_CODE',100,'ACTIVE','customer-1','Promotion code LAUNCH20',100,100)");
}

test("Phase 4 migration upgrades Phase 3 data and adds four discount tables", () => {
  const database = upgradedDatabase();
  const tables = database.prepare("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' order by name").all()
    .map((row) => String(row.name));
  assert.equal(tables.length, 15);
  for (const table of ["discounts", "promotion_codes", "customer_discounts", "discount_redemptions"]) {
    assert.equal(tables.includes(table), true);
  }
  assert.equal(database.prepare("select amount_minor from plan_prices").get()?.amount_minor, 64_900);
  assert.equal(database.prepare("select business_name from customers").get()?.business_name, "Example Plumbing Pty Ltd");
  database.close();
});

test("database atomically enforces promotion limits and immutable redemption history", () => {
  const database = upgradedDatabase();
  seedDiscount(database);
  database.exec("insert into discount_redemptions (id,discount_id,promotion_code_id,customer_discount_id,customer_id,plan_id,redemption_type,idempotency_key,amount_discounted_minor,currency,redeemed_at) values ('70000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','PROMOTION_CLAIM','claim-1',0,'AUD',100)");
  assert.equal(database.prepare("select redemption_count from promotion_codes").get()?.redemption_count, 1);
  assert.throws(() => database.exec("insert into discount_redemptions (id,discount_id,promotion_code_id,customer_discount_id,customer_id,plan_id,redemption_type,idempotency_key,amount_discounted_minor,currency,redeemed_at) values ('70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','PROMOTION_CLAIM','claim-2',0,'AUD',100)"), /PROMOTION_CODE_INELIGIBLE/);
  assert.throws(() => database.exec("update discount_redemptions set amount_discounted_minor = 1 where id = '70000000-0000-4000-8000-000000000004'"), /DISCOUNT_REDEMPTION_IMMUTABLE/);
  assert.throws(() => database.exec("delete from discount_redemptions where id = '70000000-0000-4000-8000-000000000004'"), /DISCOUNT_REDEMPTION_IMMUTABLE/);
  database.close();
});

test("database normalises promotion storage and rejects overlapping customer assignments", () => {
  const database = upgradedDatabase();
  seedDiscount(database);
  assert.throws(() => database.exec("insert into promotion_codes (id,discount_id,code,active,starts_at,redemption_count,first_purchase_only,created_at,updated_at) values ('70000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000001','lowercase',1,100,0,0,1,1)"), /promotion_codes_normalised_check/);
  assert.throws(() => database.exec("insert into customer_discounts (id,customer_id,discount_id,source,effective_from,status,applied_by,reason,created_at,updated_at) values ('70000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','ADMIN',100,'ACTIVE','admin-1','Duplicate range',100,100)"), /CUSTOMER_DISCOUNT_CONFLICT/);
  const detail = database.prepare("explain query plan select * from customer_discounts where customer_id = ? and status in ('SCHEDULED','ACTIVE') and effective_from <= ? and (effective_to is null or effective_to > ?)")
    .all("00000000-0000-4000-8000-000000000001", 100, 100).map((row) => String(row.detail)).join(" ");
  assert.match(detail, /customer_discounts_effective_lookup_idx/);
  database.close();
});

test("database rejects charge applications that do not match their assignment", () => {
  const database = upgradedDatabase();
  seedDiscount(database);
  assert.throws(() => database.exec("insert into discount_redemptions (id,discount_id,promotion_code_id,customer_discount_id,customer_id,plan_id,redemption_type,idempotency_key,amount_discounted_minor,currency,redeemed_at) values ('70000000-0000-4000-8000-000000000012','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','CHARGE_APPLICATION','zero-application',0,'AUD',100)"), /discount_redemptions_claim_check/);
  assert.throws(() => database.exec("insert into discount_redemptions (id,discount_id,promotion_code_id,customer_discount_id,customer_id,plan_id,redemption_type,idempotency_key,amount_discounted_minor,currency,redeemed_at) values ('70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','CHARGE_APPLICATION','mismatch-1',2000,'AUD',100)"), /DISCOUNT_APPLICATION_MISMATCH/);
  database.close();
});
