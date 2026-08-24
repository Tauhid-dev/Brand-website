import { apiRoute, jsonObject } from "../v1/api-http";
import { createApiRuntime, enforcePublicRateLimit } from "../v1/api-runtime";

const required = ["contactName", "businessName", "industry", "location", "email", "phone", "challenge", "privacyConsent"] as const;

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const runtime = await createApiRuntime(request, requestId);
    await enforcePublicRateLimit(runtime, request, "public:growth-audit", 5);
    const body = await jsonObject(request);
    if (body.companyFax) return Response.json({ ok: true });
    const missing = required.filter((key) => !String(body[key] ?? "").trim());
    if (missing.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email ?? ""))) return Response.json({ ok: false, error: "Please check the required fields." }, { status: 422 });
    // Development adapter: validates the integration boundary without logging,
    // persisting or transmitting personal information. Replace before launch.
    return Response.json({ ok: true, delivered: false, consent: { source: "website_growth_audit", timestamp: new Date().toISOString() } }, { status: 202 });
  });
}
