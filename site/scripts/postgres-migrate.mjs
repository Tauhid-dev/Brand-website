import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

if (process.env.DATABASE_RUNTIME !== "postgres") throw new Error("postgres:migrate requires DATABASE_RUNTIME=postgres.");
if (!process.env.DATABASE_URL) throw new Error("postgres:migrate requires DATABASE_URL.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
const client = await pool.connect();
try {
  await client.query("select pg_advisory_lock(98672618001)");
  await client.query(`create table if not exists _zuno_postgres_migrations (
    name text primary key,
    sha256 text not null check (length(sha256) = 64),
    applied_at timestamptz not null default now()
  )`);
  const directory = resolve("postgres/migrations");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const sql = await readFile(resolve(directory, name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("select sha256 from _zuno_postgres_migrations where name = $1", [name]);
    if (existing.rows[0]) {
      if (existing.rows[0].sha256 !== sha256) throw new Error(`Applied PostgreSQL migration ${name} has changed.`);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _zuno_postgres_migrations (name, sha256) values ($1, $2)", [name, sha256]);
      await client.query("commit");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(98672618001)").catch(() => undefined);
  client.release();
  await pool.end();
}
