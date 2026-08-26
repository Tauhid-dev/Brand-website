import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OIDC_SESSION_COOKIE, standaloneIdentityConfig } from "@/app/identity-runtime";
import { openStandaloneSession } from "@/modules/identity/infrastructure/oidc-session";
import { cookieOptions } from "../login/route";
import { recordStandaloneAuthentication } from "../standalone-auth-security";

export async function POST(request: Request) {
  const config = standaloneIdentityConfig();
  if (request.headers.get("origin") !== config.appBaseUrl.origin) return new NextResponse("Invalid request origin.", { status: 403 });
  const store = await cookies();
  const session = await openStandaloneSession(store.get(OIDC_SESSION_COOKIE)?.value, config.sessionSecret);
  const data = await request.formData();
  if (!session || data.get("csrfToken") !== session.csrfToken) return new NextResponse("Invalid CSRF token.", { status: 403 });
  await recordStandaloneAuthentication(request, "logout", session);
  const response = NextResponse.redirect(config.appBaseUrl, 303);
  response.cookies.set(OIDC_SESSION_COOKIE, "", cookieOptions(0));
  return response;
}
