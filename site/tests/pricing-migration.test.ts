import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const MIGRATIONS = [
  new URL("../drizzle/0000_uneven_violations.sql", import.meta.url),
  new URL("../drizzle/0001_last_rafael_vega.sql", import.meta.url),
];

function apply(database: DatabaseSync, migration: URL): void {
  for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

function phaseTwoDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  apply(database, MIGRATIONS[0]);
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  return database;
}

function upgradedDatabase(): DatabaseSync {
  const database = phaseTwoDatabase();
  apply(database, MIGRATIONS[1]);
  return database;
}

test("Phase 3 migration upgrades Phase 2 data and creates three pricing tables", () => {
  const database = upgradedDatabase();
  const tables = database.prepare("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' order by name").all()
    .map((row) => String(row.name));
  assert.equal(tables.length, 11);
  assert.equal(tables.includes("plan_prices"), true);
  assert.equal(tables.includes("customer_price_overrides"), true);
  assert.equal(tables.includes("price_quotes"), true);
  assert.equal(database.prepare("select business_name from customers").get()?.business_name,
    "Example Plumbing Pty Ltd");
  database.close();
});

test("database prevents overlapping or mutated plan price history", () => {
  const database = upgradedDatabase();
  database.exec("insert into plan_prices (id,plan_id,currency,billing_interval,amount_minor,setup_fee_minor,tax_behaviour,effective_from,active,created_by,created_at) values ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',64900,299000,'EXCLUSIVE',100,1,'admin-1',1)");
  assert.throws(() => database.exec(
    "insert into plan_prices (id,plan_id,currency,billing_interval,amount_minor,setup_fee_minor,tax_behaviour,effective_from,active,created_by,created_at) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',69900,299000,'EXCLUSIVE',200,1,'admin-1',2)",
  ), /PRICE_VERSION_CONFLICT/);
  database.exec("update plan_prices set effective_to = 200 where id = '00000000-0000-4000-8000-000000000020'");
  database.exec("insert into plan_prices (id,plan_id,currency,billing_interval,amount_minor,setup_fee_minor,tax_behaviour,effective_from,active,created_by,created_at) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',69900,299000,'EXCLUSIVE',200,1,'admin-1',2)");
  assert.throws(() => database.exec(
    "update plan_prices set amount_minor = 1 where id = '00000000-0000-4000-8000-000000000020'",
  ), /PLAN_PRICE_TERMS_IMMUTABLE/);
  assert.throws(() => database.exec(
    "delete from plan_prices where id = '00000000-0000-4000-8000-000000000020'",
  ), /PLAN_PRICE_HISTORY_IMMUTABLE/);
  database.close();
});

test("database rejects concurrent override ranges", () => {
  const database = upgradedDatabase();
  database.exec("insert into customer_price_overrides (id,customer_id,plan_id,currency,billing_interval,override_amount_minor,override_setup_fee_minor,effective_from,effective_to,reason,status,created_by,created_at,updated_at) values ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',54900,0,100,300,'Negotiated agreement','ACTIVE','admin-1',1,1)");
  assert.throws(() => database.exec(
    "insert into customer_price_overrides (id,customer_id,plan_id,currency,billing_interval,override_amount_minor,override_setup_fee_minor,effective_from,effective_to,reason,status,created_by,created_at,updated_at) values ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','AUD','MONTHLY',49900,0,200,400,'Conflicting agreement','SCHEDULED','admin-1',2,2)",
  ), /PRICE_OVERRIDE_CONFLICT/);
  database.close();
});

test("quote rows are immutable snapshots", () => {
  const database = upgradedDatabase();
  database.exec("insert into price_quotes (id,customer_id,plan_id,billing_interval,base_price_minor,override_price_minor,discount_total_minor,subtotal_minor,tax_minor,total_minor,currency,pricing_snapshot_json,valid_until,created_by,created_at) values ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','MONTHLY',64900,54900,0,54900,5490,60390,'AUD','{}',100,'admin-1',1)");
  assert.throws(() => database.exec(
    "update price_quotes set total_minor = 1 where id = '00000000-0000-4000-8000-000000000040'",
  ), /PRICE_QUOTE_IMMUTABLE/);
  assert.throws(() => database.exec(
    "delete from price_quotes where id = '00000000-0000-4000-8000-000000000040'",
  ), /PRICE_QUOTE_IMMUTABLE/);
  database.close();
});

test("effective plan-price lookup uses its composite index", () => {
  const database = upgradedDatabase();
  const detail = database.prepare(
    "explain query plan select * from plan_prices where plan_id = ? and billing_interval = ? and active = 1 and effective_from <= ? and (effective_to is null or effective_to > ?)",
  ).all("00000000-0000-4000-8000-000000000010", "MONTHLY", 100, 100)
    .map((row) => String(row.detail)).join(" ");
  assert.match(detail, /plan_prices_effective_lookup_idx/);
  database.close();
});
