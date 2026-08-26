import { getDb, type AppDatabase } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AuditService } from "@/modules/audit/application/audit-service";
import type { AuditRecorder } from "@/modules/audit/application/ports";
import { AUDIT_ACTIONS } from "@/modules/audit/domain/audit-event";
import { D1AuditEventRepository } from "@/modules/audit/infrastructure/d1-audit-event-repository";
import { CustomerAuthenticationService, AdminAuthenticationService, AdminAuthorizationGuard } from "@/modules/identity/application/access-control-services";
import { CHATGPT_IDENTITY_PROVIDER, createExternalIdentity, type AdminPrincipal, type CustomerPrincipal, type PermissionCode } from "@/modules/identity/domain/access-control";
import { D1AdminAccessRepository } from "@/modules/identity/infrastructure/d1-admin-access-repository";
import { D1CustomerIdentityRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { D1ApiSecurityRepository } from "@/modules/api/infrastructure/d1-api-security-repository";
import { D1ApiReadRepository } from "@/modules/api/infrastructure/d1-api-read-repository";
import { RequestRateLimitService, ServiceAuthenticationService } from "@/modules/api/application/api-security-services";
import type { ServicePrincipal, ServiceScope } from "@/modules/api/domain/api-security";
import { CryptoUuidGenerator, SystemClock } from "@/modules/shared/application/ports";
import type { RequestActor, RequestContext } from "@/modules/shared/application/request-context";
import { AuthenticationRequiredError } from "@/modules/shared/domain/errors";
import { sha256Hex } from "@/modules/shared/application/web-crypto";
import { D1PortalReadRepository } from "@/modules/portal/infrastructure/d1-portal-read-repository";

export type ApiRuntime = Awaited<ReturnType<typeof createApiRuntime>>;

export async function createApiRuntime(request: Request, requestId: string) {
  const db = await getDb();
  const ids = new CryptoUuidGenerator();
  const clock = new SystemClock();
  const metadata = { requestId, occurredAt: clock.now(), idempotencyKey: request.headers.get("idempotency-key")?.trim() || null, ipAddress: request.headers.get("cf-connecting-ip")?.trim().slice(0, 64) || null, userAgent: request.headers.get("user-agent")?.trim().slice(0, 512) || null };
  return { db, ids, clock, metadata, security: new D1ApiSecurityRepository(db), read: new D1ApiReadRepository(db), portal: new D1PortalReadRepository(db), anonymousAudit: auditFor(db, ids, clock, metadata, { type: "ANONYMOUS" }) };
}

export function actorAudit(runtime: ApiRuntime, actor: RequestActor) { return auditFor(runtime.db, runtime.ids, runtime.clock, runtime.metadata, actor); }

export async function authenticateCustomer(runtime: ApiRuntime): Promise<{ principal: CustomerPrincipal; audit: AuditRecorder }> {
  const identity = await externalIdentity();
  const principal = await new CustomerAuthenticationService(new D1CustomerIdentityRepository(runtime.db)).execute(identity);
  await enforcePrincipalRateLimit(runtime, "customer", principal.customerId, 300);
  return { principal, audit: actorAudit(runtime, { type: "CUSTOMER", id: principal.customerId }) };
}

export async function authenticateAdmin(runtime: ApiRuntime, permission: PermissionCode): Promise<{ principal: AdminPrincipal; audit: AuditRecorder }> {
  const identity = await externalIdentity();
  const principal = await new AdminAuthenticationService(new D1AdminAccessRepository(runtime.db), runtime.clock, runtime.anonymousAudit).execute(identity);
  new AdminAuthorizationGuard().requirePermission(principal, permission);
  await enforcePrincipalRateLimit(runtime, "admin", principal.adminUserId, 600);
  return { principal, audit: actorAudit(runtime, { type: "ADMIN", id: principal.adminUserId }) };
}

export async function authenticateService(runtime: ApiRuntime, request: Request, scope: ServiceScope): Promise<{ principal: ServicePrincipal; audit: AuditRecorder }> {
  const principal = await new ServiceAuthenticationService(runtime.security, runtime.clock, runtime.anonymousAudit).authenticate(request.headers.get("authorization"), scope);
  const audit = actorAudit(runtime, { type: "SERVICE", id: principal.credentialId });
  await audit.record({ action: AUDIT_ACTIONS.serviceApiRequested, entityType: "SERVICE_CREDENTIAL", entityId: principal.credentialId, after: { scope, method: request.method, path: new URL(request.url).pathname } });
  return { principal, audit };
}

export async function enforcePublicRateLimit(runtime: ApiRuntime, request: Request, scope: string, limit = 60) {
  const subject = request.headers.get("cf-connecting-ip")?.trim() || `local:${request.headers.get("user-agent")?.slice(0, 160) || "anonymous"}`;
  await new RequestRateLimitService(runtime.security, runtime.clock).consume(scope, await sha256Hex(subject), limit);
}

async function enforcePrincipalRateLimit(runtime: ApiRuntime, actorType: "customer" | "admin", actorId: string, limit: number) {
  await new RequestRateLimitService(runtime.security, runtime.clock).consume(`${actorType}:api`, await sha256Hex(actorId), limit);
}

function auditFor(db: AppDatabase, ids: CryptoUuidGenerator, clock: SystemClock, metadata: Omit<RequestContext, "actor">, actor: RequestActor) { return new AuditService(new D1AuditEventRepository(db), ids, clock, { ...metadata, actor }); }
async function externalIdentity() { const user = await getChatGPTUser(); if (!user) throw new AuthenticationRequiredError(); return createExternalIdentity({ provider: CHATGPT_IDENTITY_PROVIDER, externalSubject: user.externalSubject, email: user.email, displayName: user.displayName }); }
