import { resolveDatabaseRuntime } from "./runtime-config.ts";

export type ApplicationRuntimeEnv = {
  DB?: D1Database;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_LIVE_ENABLED?: string;
  AGENT_PLATFORM_BASE_URL?: string;
  AGENT_PLATFORM_ACCESS_TOKEN?: string;
  LEAD_DELIVERY_URL?: string;
  LEAD_DELIVERY_TOKEN?: string;
};

export async function runtimeEnv(): Promise<ApplicationRuntimeEnv> {
  if (resolveDatabaseRuntime(process.env.DATABASE_RUNTIME) === "postgres") return {
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_LIVE_ENABLED: process.env.STRIPE_LIVE_ENABLED,
    AGENT_PLATFORM_BASE_URL: process.env.AGENT_PLATFORM_BASE_URL,
    AGENT_PLATFORM_ACCESS_TOKEN: process.env.AGENT_PLATFORM_ACCESS_TOKEN,
    LEAD_DELIVERY_URL: process.env.LEAD_DELIVERY_URL,
    LEAD_DELIVERY_TOKEN: process.env.LEAD_DELIVERY_TOKEN,
  };
  const { env } = await import("cloudflare:workers");
  return env;
}
