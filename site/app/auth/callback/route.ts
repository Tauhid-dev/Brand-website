import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { OIDC_FLOW_COOKIE, OIDC_SESSION_COOKIE, standaloneIdentityConfig } from "@/app/identity-runtime";
import { openOidcLoginFlow, sealStandaloneSession } from "@/modules/identity/infrastructure/oidc-session";
import { oidcConfiguration } from "../oidc-runtime";
import { cookieOptions } from "../login/route";
import { recordStandaloneAuthentication } from "../standalone-auth-security";

export async function GET(request: Request) {
  const config = standaloneIdentityConfig();
  const store = await cookies();
  const flow = await openOidcLoginFlow(store.get(OIDC_FLOW_COOKIE)?.value, config.sessionSecret);
  if (!flow) return new NextResponse("The sign-in attempt has expired. Start again.", { status: 400 });
  try {
    const callbackUrl = new URL(config.redirectUri);
    callbackUrl.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await oidcConfiguration(), callbackUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub || typeof claims.email !== "string" || claims.email_verified === false) {
      return new NextResponse("The identity provider did not return a verified subject and email.", { status: 403 });
    }
    const displayName = typeof claims.name === "string" && claims.name.trim() ? claims.name : claims.email;
    await recordStandaloneAuthentication(request, "success", { provider: config.provider, externalSubject: claims.sub, email: claims.email });
    const session = await sealStandaloneSession({ provider: config.provider, externalSubject: claims.sub, email: claims.email, displayName, csrfToken: oidc.randomState() }, config.sessionSecret, config.sessionTtlSeconds);
    const response = NextResponse.redirect(new URL(flow.returnTo, config.appBaseUrl));
    response.cookies.set(OIDC_SESSION_COOKIE, session, cookieOptions(config.sessionTtlSeconds));
    response.cookies.set(OIDC_FLOW_COOKIE, "", cookieOptions(0));
    return response;
  } catch {
    await recordStandaloneAuthentication(request, "failure").catch(() => undefined);
    const response = new NextResponse("Sign-in could not be verified.", { status: 401 });
    response.cookies.set(OIDC_FLOW_COOKIE, "", cookieOptions(0));
    return response;
  }
}
