import { getDb } from "@/db";
import { RequestRateLimitService } from "@/modules/api/application/api-security-services";
import { D1ApiSecurityRepository } from "@/modules/api/infrastructure/d1-api-security-repository";
import { AuditService } from "@/modules/audit/application/audit-service";
import { D1AuditEventRepository } from "@/modules/audit/infrastructure/d1-audit-event-repository";
import { AUDIT_ACTIONS } from "@/modules/audit/domain/audit-event";
import { CryptoUuidGenerator, SystemClock } from "@/modules/shared/application/ports";
import { sha256Hex } from "@/modules/shared/application/web-crypto";

export async function enforceStandaloneAuthRateLimit(request: Request, operation: string, limit: number) {
  const subject = [request.headers.get("user-agent")?.slice(0, 180), request.headers.get("accept-language")?.slice(0, 80)].join(":");
  await new RequestRateLimitService(new D1ApiSecurityRepository(await getDb()), new SystemClock()).consume(`oidc:${operation}`, await sha256Hex(subject), limit);
}

export async function recordStandaloneAuthentication(request: Request, outcome: "success" | "failure" | "logout", identity?: { provider: string; externalSubject: string; email: string }) {
  const db = await getDb();
  const ids = new CryptoUuidGenerator();
  const clock = new SystemClock();
  const audit = new AuditService(new D1AuditEventRepository(db), ids, clock, {
    actor: { type: "ANONYMOUS" },
    requestId: request.headers.get("x-request-id")?.slice(0, 255) || ids.next(),
    occurredAt: clock.now(),
    idempotencyKey: null,
    ipAddress: null,
    userAgent: request.headers.get("user-agent")?.slice(0, 512) || null,
  });
  await audit.record({
    action: outcome === "success" ? AUDIT_ACTIONS.standaloneLoginSuccess : outcome === "logout" ? AUDIT_ACTIONS.standaloneLogout : AUDIT_ACTIONS.standaloneLoginFailed,
    entityType: "EXTERNAL_IDENTITY",
    entityId: identity ? await sha256Hex(`${identity.provider}:${identity.externalSubject}`) : null,
    after: identity ? { provider: identity.provider, email: identity.email } : { reason: "OIDC_VERIFICATION_FAILED" },
  });
}
