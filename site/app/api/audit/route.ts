const rateLimit = new Map<string, { count: number; reset: number }>();

const required = ["contactName", "businessName", "industry", "location", "email", "phone", "challenge", "privacyConsent"] as const;

export async function POST(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const now = Date.now();
  const current = rateLimit.get(ip);
  if (current && current.reset > now && current.count >= 5) {
    return Response.json({ ok: false, error: "Too many requests. Please try again later." }, { status: 429 });
  }
  rateLimit.set(ip, current && current.reset > now ? { ...current, count: current.count + 1 } : { count: 1, reset: now + 60_000 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (body.companyFax) return Response.json({ ok: true });
  const missing = required.filter((key) => !String(body[key] ?? "").trim());
  if (missing.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email ?? ""))) {
    return Response.json({ ok: false, error: "Please check the required fields." }, { status: 422 });
  }
  // Development adapter: validates the integration boundary without logging,
  // persisting or transmitting personal information. Replace before launch.
  return Response.json({
    ok: true,
    delivered: false,
    consent: { source: "website_growth_audit", timestamp: new Date().toISOString() },
  }, { status: 202 });
}
