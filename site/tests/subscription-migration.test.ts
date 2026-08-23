import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const MIGRATIONS = [0, 1, 2, 3].map((index) => new URL(`../drizzle/${[
  "0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql",
][index]}`, import.meta.url));
function apply(database: DatabaseSync, migration: URL): void {
  for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement);
}
function upgradedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of MIGRATIONS.slice(0, 3)) apply(database, migration);
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  apply(database, MIGRATIONS[3]);
  return database;
}

test("Phase 5 migration upgrades Phase 4 and adds seven subscription and billing tables", () => {
  const database = upgradedDatabase();
  const tables = database.prepare("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%'").all().map((row) => String(row.name));
  assert.equal(tables.length, 22);
  for (const name of ["subscriptions", "subscription_prices", "subscription_entitlements", "billing_accounts", "invoices", "invoice_lines", "payment_reminders"]) assert.equal(tables.includes(name), true);
  assert.equal(database.prepare("select business_name from customers").get()?.business_name, "Example Plumbing Pty Ltd");
  assert.equal(database.prepare("select count(*) as count from pragma_table_info('customer_discounts') where name = 'subscription_id'").get()?.count, 1);
  database.close();
});

test("database prevents duplicate current subscriptions, invalid transitions, and stale writes", () => {
  const database = upgradedDatabase();
  const insert = (id: string) => database.exec(`insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('${id}','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','ACTIVE','MONTHLY','AUD',1,100,100)`);
  insert("b0000000-0000-4000-8000-000000000001");
  assert.throws(() => insert("b0000000-0000-4000-8000-000000000002"), /subscriptions.customer_id/);
  assert.throws(() => database.exec("update subscriptions set status = 'PENDING', version = 2, updated_at = 101 where id = 'b0000000-0000-4000-8000-000000000001'"), /INVALID_SUBSCRIPTION_TRANSITION/);
  database.exec("update subscriptions set status = 'SUSPENDED', version = 2, updated_at = 101 where id = 'b0000000-0000-4000-8000-000000000001'");
  assert.throws(() => database.exec("update subscriptions set status = 'ACTIVE', version = 2, updated_at = 102 where id = 'b0000000-0000-4000-8000-000000000001'"), /SUBSCRIPTION_VERSION_CONFLICT/);
  database.close();
});

test("contract prices, entitlements, invoices, and reminders preserve commercial history", () => {
  const database = upgradedDatabase();
  database.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','ACTIVE','MONTHLY','AUD',1,100,100)");
  database.exec("insert into subscription_prices (id,subscription_id,base_amount_minor,effective_amount_minor,setup_fee_minor,discount_total_minor,currency,tax_behaviour,effective_from,pricing_source,pricing_snapshot_json,created_at) values ('b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',64900,54900,0,10000,'AUD','EXCLUSIVE',100,'RESOLVED','{}',100)");
  assert.throws(() => database.exec("update subscription_prices set effective_amount_minor = 1 where id = 'b0000000-0000-4000-8000-000000000002'"), /SUBSCRIPTION_PRICE_TERMS_IMMUTABLE/);
  database.exec("insert into invoices (id,customer_id,subscription_id,invoice_number,status,currency,subtotal_minor,tax_minor,total_minor,amount_due_minor,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','ZP-1','DRAFT','AUD',64900,6490,71390,71390,100,100)");
  database.exec("insert into invoice_lines (id,invoice_id,description,quantity,unit_amount_minor,subtotal_minor,tax_minor,total_minor,created_at) values ('b0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000003','Growth Engine',1,64900,64900,6490,71390,100)");
  database.exec("update invoices set status = 'OPEN', issued_at = 101, due_at = 200, updated_at = 101 where id = 'b0000000-0000-4000-8000-000000000003'");
  assert.throws(() => database.exec("delete from invoices where id = 'b0000000-0000-4000-8000-000000000003'"), /INVOICE_HISTORY_IMMUTABLE/);
  const detail = database.prepare("explain query plan select * from subscriptions where customer_id = ? and status = 'ACTIVE'").all("00000000-0000-4000-8000-000000000001").map((row) => String(row.detail)).join(" ");
  assert.match(detail, /subscriptions_customer_status_idx/);
  database.close();
});

test("subscription-scoped discounts must belong to the same customer", () => {
  const database = upgradedDatabase();
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000002','customer-2','Example Electrical Pty Ltd','Alex Example','alex@example.invalid','ACTIVE','ADMIN',1,1)");
  database.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','ACTIVE','MONTHLY','AUD',1,100,100)");
  database.exec("insert into discounts (id,code,name,discount_type,percent_off_basis_points,duration_type,starts_at,active,stackable,created_by,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000010','contract_10','Contract 10','PERCENTAGE',1000,'FOREVER',100,1,1,'admin-1',100,100)");
  assert.throws(() => database.exec("insert into customer_discounts (id,customer_id,discount_id,subscription_id,source,effective_from,status,applied_by,reason,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000010','b0000000-0000-4000-8000-000000000001','ADMIN',100,'ACTIVE','admin-1','Invalid scope',100,100)"), /SUBSCRIPTION_DISCOUNT_CUSTOMER_MISMATCH/);
  assert.throws(() => database.exec("insert into invoices (id,customer_id,subscription_id,invoice_number,status,currency,subtotal_minor,tax_minor,total_minor,amount_due_minor,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','ZP-MISMATCH','DRAFT','AUD',100,10,110,110,100,100)"), /INVOICE_CUSTOMER_MISMATCH/);
  database.close();
});
