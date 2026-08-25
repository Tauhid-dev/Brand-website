declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      STRIPE_WEBHOOK_SECRET?: string;
      STRIPE_SECRET_KEY?: string;
      STRIPE_LIVE_ENABLED?: string;
      AGENT_PLATFORM_BASE_URL?: string;
      AGENT_PLATFORM_ACCESS_TOKEN?: string;
    }
  }

  interface Env {
    DB: D1Database;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_LIVE_ENABLED?: string;
    AGENT_PLATFORM_BASE_URL?: string;
    AGENT_PLATFORM_ACCESS_TOKEN?: string;
  }
}

export {};
