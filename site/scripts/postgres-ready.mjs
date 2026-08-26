import pg from "pg";

if (process.env.DATABASE_RUNTIME !== "postgres" || !process.env.DATABASE_URL) process.exit(1);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3_000 });
try {
  const result = await pool.query("select sha256 from _zuno_postgres_migrations where name = $1", ["0000_phase_18_baseline.sql"]);
  process.exitCode = result.rowCount === 1 ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await pool.end();
}
