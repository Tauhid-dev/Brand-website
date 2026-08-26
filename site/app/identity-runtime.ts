import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createExternalIdentity, type ExternalIdentity } from "@/modules/identity/domain/access-control";
import { openStandaloneSession } from "@/modules/identity/infrastructure/oidc-session";
import { resolveIdentityRuntime, safeReturnTo, standaloneIdentityConfig } from "@/modules/identity/infrastructure/identity-runtime-config";
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";

export const OIDC_SESSION_COOKIE = "__Host-zuno-session";
export const OIDC_FLOW_COOKIE = "__Host-zuno-oidc-flow";
export { resolveIdentityRuntime, safeReturnTo, standaloneIdentityConfig };

export async function getRuntimeIdentity(): Promise<ExternalIdentity | null> {
  if (resolveIdentityRuntime() === "siwc") {
    const user = await getChatGPTUser();
    return user ? createExternalIdentity({ provider: "chatgpt-siwc", externalSubject: user.externalSubject, email: user.email, displayName: user.displayName }) : null;
  }
  const config = standaloneIdentityConfig();
  const store = await cookies();
  const session = await openStandaloneSession(store.get(OIDC_SESSION_COOKIE)?.value, config.sessionSecret);
  return session ? createExternalIdentity(session) : null;
}

export async function requireRuntimeIdentity(returnTo: string): Promise<ExternalIdentity> {
  const identity = await getRuntimeIdentity();
  if (identity) return identity;
  redirect(runtimeSignInPath(returnTo));
}

export function runtimeSignInPath(returnTo: string) {
  return resolveIdentityRuntime() === "siwc" ? chatGPTSignInPath(returnTo) : `/auth/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function runtimeSignOutPath(returnTo = "/") {
  return resolveIdentityRuntime() === "siwc" ? chatGPTSignOutPath(returnTo) : "/auth/logout";
}

export async function standaloneLogoutToken() {
  if (resolveIdentityRuntime() !== "oidc") return null;
  const config = standaloneIdentityConfig();
  const store = await cookies();
  return (await openStandaloneSession(store.get(OIDC_SESSION_COOKIE)?.value, config.sessionSecret))?.csrfToken ?? null;
}
