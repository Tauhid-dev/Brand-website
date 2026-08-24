import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const MIGRATION_NAMES = [
  "0000_uneven_violations.sql",
  "0001_last_rafael_vega.sql",
  "0002_windy_sprite.sql",
  "0003_strange_absorbing_man.sql",
  "0004_bored_red_ghost.sql",
];

function apply(database: DatabaseSync, name: string): void {
  const migration = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

function upgradedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of MIGRATION_NAMES.slice(0, 4)) apply(database, name);
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('customer-1','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  apply(database, MIGRATION_NAMES[4]!);
  return database;
}

test("Phase 6 migration upgrades Phase 5 and seeds the controlled RBAC vocabulary", () => {
  const database = upgradedDatabase();
  const tables = database.prepare("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%'").all().map((row) => String(row.name));
  for (const name of ["admin_users", "roles", "permissions", "admin_user_roles", "role_permissions", "audit_events"]) {
    assert.equal(tables.includes(name), true);
  }
  assert.equal(database.prepare("select count(*) as count from roles").get()?.count, 5);
  assert.equal(database.prepare("select count(*) as count from permissions").get()?.count, 16);
  assert.equal(database.prepare("select count(*) as count from role_permissions where role_id = 'role_super_admin'").get()?.count, 16);
  assert.equal(database.prepare("select count(*) as count from pragma_table_info('customer_identities') where name = 'accepted_invitation_id'").get()?.count, 1);
  assert.equal(database.prepare("select business_name from customers where id = 'customer-1'").get()?.business_name, "Example Plumbing Pty Ltd");
  database.close();
});

test("RBAC constraints prevent duplicate external identities and concurrent bootstrap administrators", () => {
  const database = upgradedDatabase();
  database.exec("insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('admin-1','chatgpt-siwc','subject-1','owner@example.invalid','Owner','ACTIVE',1,1,1)");
  assert.throws(() => database.exec("insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('admin-2','chatgpt-siwc','subject-2','second@example.invalid','Second','ACTIVE',1,1,1)"), /admin_users.bootstrap/);
  assert.throws(() => database.exec("insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('admin-3','chatgpt-siwc','subject-1','third@example.invalid','Third','ACTIVE',0,1,1)"), /admin_users.identity_provider/);
  assert.throws(() => database.exec("insert into admin_user_roles (admin_user_id,role_id,created_at) values ('admin-1','role_missing',1)"), /FOREIGN KEY/);
  database.close();
});

test("audit events are append-only and indexed for entity history", () => {
  const database = upgradedDatabase();
  database.exec("insert into audit_events (id,actor_type,actor_id,action,entity_type,entity_id,before_json,after_json,request_id,created_at) values ('audit-1','ADMIN','admin-1','CUSTOMER_UPDATED','CUSTOMER','customer-1','{\"status\":\"PROSPECT\"}','{\"status\":\"ACTIVE\"}','request-1',1)");
  assert.throws(() => database.exec("update audit_events set action = 'TAMPERED' where id = 'audit-1'"), /AUDIT_EVENTS_IMMUTABLE/);
  assert.throws(() => database.exec("delete from audit_events where id = 'audit-1'"), /AUDIT_EVENTS_IMMUTABLE/);
  assert.throws(() => database.exec("insert into audit_events (id,actor_type,actor_id,action,entity_type,request_id,created_at) values ('audit-2','ANONYMOUS','unexpected','ADMIN_LOGIN_FAILED','ADMIN_USER','request-2',2)"));
  const detail = database.prepare("explain query plan select * from audit_events where entity_type = ? and entity_id = ? order by created_at desc").all("CUSTOMER", "customer-1").map((row) => String(row.detail)).join(" ");
  assert.match(detail, /audit_events_entity_created_idx/);
  database.close();
});

test("an invitation can bind only one external customer identity", () => {
  const database = upgradedDatabase();
  database.exec("insert into customer_invitations (id,customer_id,email,token_hash,status,invited_by,expires_at,accepted_at,created_at) values ('invite-1','customer-1','casey@example.invalid','hash-1','ACCEPTED','admin-1',200,100,1)");
  database.exec("insert into customer_identities (id,customer_id,provider,external_subject,email,accepted_invitation_id,created_at) values ('identity-1','customer-1','chatgpt-siwc','subject-1','casey@example.invalid','invite-1',100)");
  assert.throws(() => database.exec("insert into customer_identities (id,customer_id,provider,external_subject,email,accepted_invitation_id,created_at) values ('identity-2','customer-1','chatgpt-siwc','subject-2','casey@example.invalid','invite-1',100)"), /customer_identities.accepted_invitation_id/);
  database.close();
});
