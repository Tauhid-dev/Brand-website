declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      STRIPE_WEBHOOK_SECRET?: string;
    }
  }

  interface Env {
    DB: D1Database;
    STRIPE_WEBHOOK_SECRET?: string;
  }
}

export {};
