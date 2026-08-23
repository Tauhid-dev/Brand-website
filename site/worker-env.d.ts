declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
    }
  }

  interface Env {
    DB: D1Database;
  }
}

export {};
