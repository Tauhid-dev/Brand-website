import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";
import { createPostgresD1Binding } from "./postgres-d1-adapter.ts";
import { requirePostgresUrl, resolveDatabaseRuntime } from "./runtime-config.ts";
import { runtimeEnv } from "./runtime-env.ts";

export async function getDb() {
  const runtime = resolveDatabaseRuntime(process.env.DATABASE_RUNTIME);
  if (runtime === "postgres") {
    return createDb(await createPostgresD1Binding(requirePostgresUrl(process.env.DATABASE_URL)));
  }
  const env = await runtimeEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return createDb(env.DB);
}

function createDb(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
