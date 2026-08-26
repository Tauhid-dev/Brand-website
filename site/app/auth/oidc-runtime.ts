import * as oidc from "openid-client";
import { standaloneIdentityConfig } from "@/app/identity-runtime";

let cached: Promise<oidc.Configuration> | undefined;

export function oidcConfiguration() {
  const config = standaloneIdentityConfig();
  cached ??= oidc.discovery(
    config.issuer,
    config.clientId,
    { client_secret: config.clientSecret, redirect_uris: [config.redirectUri], response_types: ["code"] },
    oidc.ClientSecretBasic(config.clientSecret),
    process.env.NODE_ENV === "production" ? undefined : { execute: [oidc.allowInsecureRequests] },
  );
  return cached;
}
