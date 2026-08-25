import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NAMES = ["0000_uneven_violations.sql", "0001_last_rafael_vega.sql", "0002_windy_sprite.sql", "0003_strange_absorbing_man.sql", "0004_bored_red_ghost.sql", "0005_spotty_iron_fist.sql", "0006_broken_centennial.sql", "0007_regular_shadowcat.sql", "0008_bouncy_polaris.sql", "0009_numerous_meltdown.sql", "0010_stale_kang.sql", "0011_yummy_vin_gonzales.sql", "0012_old_morph.sql"];
function apply(database: DatabaseSync, name: string) { for (const statement of readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement); }

test("Phase 14 migration upgrades Phase 13 while preserving in-flight provisioning work", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); for (const name of NAMES.slice(0, -1)) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('95000000-0000-4000-8000-000000000001','phase-14','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into agent_links (id,customer_id,agent_platform,status,version,created_at,updated_at) values ('95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','zuno_agent','PENDING',1,1,1)");
  db.exec("insert into agent_provisioning_jobs (id,agent_link_id,customer_id,operation,status,idempotency_key,attempt_count,max_attempts,next_attempt_at,requested_at,started_at,version,created_at,updated_at) values ('95000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','PROVISION','IN_PROGRESS','phase-14-existing',1,5,null,1,2,2,1,2)");
  apply(db, NAMES.at(-1)!);
  const job = db.prepare("select status,processing_started_at,lease_expires_at from agent_provisioning_jobs").get(); assert.equal(job?.status, "IN_PROGRESS"); assert.equal(job?.processing_started_at, 2); assert.equal(job?.lease_expires_at, 120002);
  assert.ok(db.prepare("select name from sqlite_schema where type='table' and name='agent_provisioning_attempts'").get());
  assert.ok(db.prepare("select name from sqlite_schema where type='index' and name='agent_provisioning_jobs_lease_idx'").get());
  assert.ok(db.prepare("select name from sqlite_schema where type='trigger' and name='agent_jobs_validate_update'").get());
  assert.equal(db.prepare("pragma foreign_key_check").all().length, 0); db.close();
});

test("Phase 14 migration creates constrained immutable attempt history", () => {
  const db = new DatabaseSync(":memory:"); for (const name of NAMES) apply(db, name);
  db.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('95000000-0000-4000-8000-000000000001','phase-14','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  db.exec("insert into agent_links (id,customer_id,agent_platform,status,version,created_at,updated_at) values ('95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','zuno_agent','PENDING',1,1,1)");
  db.exec("insert into agent_provisioning_jobs (id,agent_link_id,customer_id,operation,status,idempotency_key,attempt_count,max_attempts,next_attempt_at,version,requested_at,created_at,updated_at) values ('95000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001','PROVISION','PENDING','phase-14-new',0,5,1,1,1,1,1)");
  db.exec("insert into agent_provisioning_attempts (id,job_id,attempt_number,provider,status,retryable,started_at,created_at) values ('95000000-0000-4000-8000-000000000004','95000000-0000-4000-8000-000000000003',1,'zuno_agent','PROCESSING',0,1,1)");
  assert.throws(() => db.exec("update agent_provisioning_attempts set provider='changed'"), /AGENT_ATTEMPT_IMMUTABLE/);
  assert.throws(() => db.exec("delete from agent_provisioning_attempts"), /AGENT_ATTEMPT_IMMUTABLE/);
  db.close();
});
