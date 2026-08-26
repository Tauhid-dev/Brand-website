import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { OIDC_FLOW_COOKIE, safeReturnTo, standaloneIdentityConfig } from "@/app/identity-runtime";
import { sealOidcLoginFlow } from "@/modules/identity/infrastructure/oidc-session";
import { oidcConfiguration } from "../oidc-runtime";
import { enforceStandaloneAuthRateLimit } from "../standalone-auth-security";

export async function GET(request: Request) {
  await enforceStandaloneAuthRateLimit(request, "login", 30);
  const config = standaloneIdentityConfig();
  const client = await oidcConfiguration();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const redirectTo = oidc.buildAuthorizationUrl(client, {
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  const response = NextResponse.redirect(redirectTo);
  response.cookies.set(OIDC_FLOW_COOKIE, await sealOidcLoginFlow({ codeVerifier, state, nonce, returnTo: safeReturnTo(new URL(request.url).searchParams.get("return_to")) }, config.sessionSecret), cookieOptions(600));
  return response;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}
