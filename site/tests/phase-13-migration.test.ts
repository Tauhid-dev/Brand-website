import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = [
  "0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql",
  "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql",
  "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql",
  "0009_numerous_meltdown.sql", "0010_stale_kang.sql", "0011_yummy_vin_gonzales.sql",
];

function apply(database: DatabaseSync, name: string) { for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement); }

test("Phase 13 migration upgrades Phase 12 without changing commercial records", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const name of NAMES.slice(0, -1)) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('93000000-0000-4000-8000-000000000001','customer-1','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  apply(db, NAMES.at(-1)!);
  assert.equal(db.prepare("select count(*) count from customers").get()?.count, 1);
  const indexes = new Set(db.prepare("select name from sqlite_schema where type='index'").all().map((row) => String(row.name)));
  for (const name of ["customers_created_id_idx", "subscriptions_created_id_idx", "invoices_created_id_idx", "notification_deliveries_created_id_idx", "audit_events_created_id_idx"]) assert.equal(indexes.has(name), true);
  assert.equal(db.prepare("pragma foreign_key_check").all().length, 0);
  db.close();
});

test("Phase 13 cursor list queries use production indexes", () => {
  const db = new DatabaseSync(":memory:"); for (const name of NAMES) apply(db, name);
  const plans = [
    ["customers", "select * from customers where status='ACTIVE' and (created_at < 100 or (created_at = 100 and id < 'z')) order by created_at desc,id desc", "customers_status_created_id_idx"],
    ["invoices", "select * from invoices where status='OPEN' and (created_at < 100 or (created_at = 100 and id < 'z')) order by created_at desc,id desc", "invoices_status_created_id_idx"],
    ["notifications", "select * from notification_deliveries where status='FAILED' and (created_at < 100 or (created_at = 100 and id < 'z')) order by created_at desc,id desc", "notification_deliveries_status_created_id_idx"],
  ] as const;
  for (const [label, sql, index] of plans) assert.match(db.prepare(`explain query plan ${sql}`).all().map((row) => String(row.detail)).join(" "), new RegExp(index), label);
  db.close();
});
