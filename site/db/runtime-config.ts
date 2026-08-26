export const DATABASE_RUNTIMES = ["d1", "postgres"] as const;
export type DatabaseRuntime = (typeof DATABASE_RUNTIMES)[number];

export function resolveDatabaseRuntime(value: string | undefined): DatabaseRuntime {
  const runtime = value?.trim().toLowerCase() || "d1";
  if (!DATABASE_RUNTIMES.includes(runtime as DatabaseRuntime)) {
    throw new Error(`Unsupported DATABASE_RUNTIME ${JSON.stringify(value)}. Expected d1 or postgres.`);
  }
  return runtime as DatabaseRuntime;
}

export function requirePostgresUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("DATABASE_URL is required when DATABASE_RUNTIME=postgres.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }
  if (!url.hostname || !url.pathname.slice(1)) throw new Error("DATABASE_URL must include a host and database name.");
  return value;
}
