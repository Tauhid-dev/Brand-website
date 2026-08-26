import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = ["0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql", "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql", "0009_numerous_meltdown.sql", "0010_stale_kang.sql", "0011_yummy_vin_gonzales.sql", "0012_old_morph.sql", "0013_wooden_siren.sql", "0014_parallel_spacker_dave.sql"];
function apply(db: DatabaseSync, name: string) { for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement); }

test("Phase 16 clean install has valid foreign keys and immutable maintenance evidence", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES) apply(db, name);
  assert.ok(db.prepare("select name from sqlite_schema where type='table' and name='system_maintenance_runs'").get());
  assert.equal(db.prepare("pragma foreign_key_check").all().length, 0);
  for (const trigger of ["system_maintenance_runs_terminal_immutable", "system_maintenance_runs_no_delete"]) assert.ok(db.prepare("select name from sqlite_schema where type='trigger' and name=?").get(trigger));
  db.close();
});

test("Phase 16 representative Phase 10 and Phase 15 upgrades preserve commercial records", () => {
  for (const baselineLength of [8, 14]) {
    const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES.slice(0, baselineLength)) apply(db, name);
    db.exec(`insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('f0000000-0000-4000-8000-000000000100','upgrade-${baselineLength}','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)`);
    for (const name of NAMES.slice(baselineLength)) apply(db, name);
    assert.equal(db.prepare("select external_reference from customers").get()?.external_reference, `upgrade-${baselineLength}`);
    assert.equal(db.prepare("pragma foreign_key_check").all().length, 0);
    db.close();
  }
});

test("maintenance concurrency and outcome constraints are database enforced", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES) apply(db, name);
  db.exec("insert into admin_users (id,identity_provider,external_subject,email,display_name,status,created_at,updated_at) values ('f0000000-0000-4000-8000-000000000200','chatgpt','admin','admin@example.invalid','Admin','ACTIVE',1,1)");
  const insert = (id: string) => `insert into system_maintenance_runs (id,operation,status,requested_by_admin_user_id,policy_snapshot_json,started_at,created_at,updated_at) values ('${id}','RETENTION_AND_RECOVERY','IN_PROGRESS','f0000000-0000-4000-8000-000000000200','{}',1,1,1)`;
  db.exec(insert("f0000000-0000-4000-8000-000000000201"));
  assert.throws(() => db.exec(insert("f0000000-0000-4000-8000-000000000202")), /UNIQUE/);
  assert.throws(() => db.exec("update system_maintenance_runs set status='SUCCEEDED',completed_at=2,updated_at=2 where id='f0000000-0000-4000-8000-000000000201'"), /CHECK/);
  db.close();
});
