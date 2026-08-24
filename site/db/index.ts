import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export async function getDb() {
  const { env } = await import("cloudflare:workers");
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
