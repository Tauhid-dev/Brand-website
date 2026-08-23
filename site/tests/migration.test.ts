import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationUrl = new URL("../drizzle/0000_uneven_violations.sql", import.meta.url);

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migration = readFileSync(migrationUrl, "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  return database;
}

test("initial migration applies cleanly and creates the Phase 2 tables", () => {
  const database = migratedDatabase();
  const rows = database.prepare(
    "select name from sqlite_master where type = 'table' order by name",
  ).all() as Array<{ name: string }>;
  assert.deepEqual(rows.map((row) => row.name), [
    "customer_business_profiles",
    "customer_identities",
    "customer_invitations",
    "customer_notes",
    "customers",
    "offerings",
    "plan_features",
    "plans",
  ]);
  database.close();
});

test("migration enforces customer checks, uniqueness, and foreign keys", () => {
  const database = migratedDatabase();
  const customerValues = "'00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid'";
  assert.throws(() => database.exec(
    `insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values (${customerValues},'UNKNOWN','ADMIN',1,1)`,
  ));
  database.exec(
    `insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values (${customerValues},'PROSPECT','ADMIN',1,1)`,
  );
  assert.throws(() => database.exec(
    "insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000002','customer-1','Duplicate','Person','other@example.invalid','PROSPECT','ADMIN',1,1)",
  ));
  assert.throws(() => database.exec(
    "insert into customer_business_profiles (id,customer_id,business_name,primary_email,timezone,country,created_at,updated_at) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-999999999999','Orphan','orphan@example.invalid','Australia/Sydney','AU',1,1)",
  ));
  database.close();
});

test("catalogue codes and plan-feature relationships are protected", () => {
  const database = migratedDatabase();
  database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  assert.throws(() => database.exec(
    "insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000011','growth_engine','Duplicate',1,0,0,2,1,1)",
  ));
  assert.throws(() => database.exec(
    "insert into plan_features (id,plan_id,offering_id,included,created_at,updated_at) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-999999999999',1,1,1)",
  ));
  database.close();
});
