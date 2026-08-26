export const IDENTITY_RUNTIMES = ["siwc", "oidc"] as const;
export type IdentityRuntime = (typeof IDENTITY_RUNTIMES)[number];

export function resolveIdentityRuntime(value = process.env.IDENTITY_RUNTIME): IdentityRuntime {
  const runtime = value?.trim().toLowerCase() || "siwc";
  if (!IDENTITY_RUNTIMES.includes(runtime as IdentityRuntime)) throw new Error(`Unsupported IDENTITY_RUNTIME ${JSON.stringify(value)}. Expected siwc or oidc.`);
  return runtime as IdentityRuntime;
}

export function standaloneIdentityConfig(env: NodeJS.ProcessEnv = process.env) {
  const issuer = requiredUrl(env.OIDC_ISSUER, "OIDC_ISSUER");
  const appBaseUrl = requiredUrl(env.APP_BASE_URL, "APP_BASE_URL");
  const production = env.NODE_ENV === "production";
  if (production && (issuer.protocol !== "https:" || appBaseUrl.protocol !== "https:")) throw new Error("OIDC_ISSUER and APP_BASE_URL must use HTTPS in production.");
  const clientId = required(env.OIDC_CLIENT_ID, "OIDC_CLIENT_ID");
  const clientSecret = required(env.OIDC_CLIENT_SECRET, "OIDC_CLIENT_SECRET");
  const provider = required(env.OIDC_PROVIDER_ID, "OIDC_PROVIDER_ID").toLowerCase();
  const sessionSecret = required(env.OIDC_SESSION_SECRET, "OIDC_SESSION_SECRET");
  const sessionTtlSeconds = boundedInteger(env.OIDC_SESSION_TTL_SECONDS, 28_800, 300, 86_400);
  return { issuer, appBaseUrl, clientId, clientSecret, provider, sessionSecret, sessionTtlSeconds, redirectUri: new URL("/auth/callback", appBaseUrl).href };
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  const url = new URL(value, "https://app.local");
  if (url.origin !== "https://app.local" || url.pathname.startsWith("/auth/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} is required when IDENTITY_RUNTIME=oidc.`);
  return value.trim();
}
function requiredUrl(value: string | undefined, name: string) {
  let url: URL;
  try { url = new URL(required(value, name)); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) throw new Error(`${name} must be an HTTP(S) URL without credentials.`);
  return url;
}
function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`OIDC_SESSION_TTL_SECONDS must be between ${minimum} and ${maximum}.`);
  return parsed;
}
