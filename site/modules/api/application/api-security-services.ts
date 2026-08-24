import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import type { AdminAuthorizationGuard } from "../../identity/application/access-control-services.ts";
import type { AdminPrincipal } from "../../identity/domain/access-control.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { AuthenticationRequiredError, AuthorizationDeniedError, DomainConflictError, DomainValidationError, RateLimitExceededError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";
import type { ApiSecurityRepository } from "./ports.ts";
import { SERVICE_SCOPES, ServiceCredential, type IdempotencyRecord, type ServicePrincipal, type ServiceScope } from "../domain/api-security.ts";

export class ManageServiceCredentialService {
  constructor(private readonly repository: ApiSecurityRepository, private readonly guard: AdminAuthorizationGuard, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}

  async issue(principal: AdminPrincipal, input: { name: string; scopes: ServiceScope[]; expiresAt: Date }) {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    const issued = await this.build(principal, input, null);
    await this.repository.createCredential(issued.credential);
    await this.audit.record({ action: AUDIT_ACTIONS.serviceCredentialCreated, entityType: "SERVICE_CREDENTIAL", entityId: issued.credential.props.id.value, after: safeCredentialSnapshot(issued.credential) });
    return issued;
  }

  async rotate(principal: AdminPrincipal, credentialId: string, expiresAt: Date) {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    const current = await this.required(credentialId);
    if (current.props.status !== "ACTIVE") throw new DomainConflictError("SERVICE_CREDENTIAL_REVOKED", "Revoked credentials cannot be rotated.");
    const next = await this.build(principal, { name: current.props.name, scopes: [...current.props.scopes], expiresAt }, current.props.id);
    const revoked = current.revoke(principal.adminUserId, this.clock.now());
    await this.repository.rotateCredential(revoked, next.credential);
    await this.audit.record({ action: AUDIT_ACTIONS.serviceCredentialRotated, entityType: "SERVICE_CREDENTIAL", entityId: current.props.id.value, before: safeCredentialSnapshot(current), after: safeCredentialSnapshot(next.credential) });
    return next;
  }

  async revoke(principal: AdminPrincipal, credentialId: string) {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    const current = await this.required(credentialId);
    if (current.props.status === "REVOKED") return;
    const revoked = current.revoke(principal.adminUserId, this.clock.now());
    await this.repository.revokeCredential(revoked);
    await this.audit.record({ action: AUDIT_ACTIONS.serviceCredentialRevoked, entityType: "SERVICE_CREDENTIAL", entityId: credentialId, before: safeCredentialSnapshot(current), after: safeCredentialSnapshot(revoked) });
  }

  private async required(id: string) { const credential = await this.repository.findCredential(new EntityId(id).value); if (!credential) throw new DomainConflictError("SERVICE_CREDENTIAL_NOT_FOUND", "Service credential does not exist."); return credential; }
  private async build(principal: AdminPrincipal, input: { name: string; scopes: ServiceScope[]; expiresAt: Date }, rotatedFromId: EntityId | null) {
    if (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= this.clock.now()) throw new DomainValidationError("INVALID_CREDENTIAL_EXPIRY", "Credential expiry must be in the future.");
    const id = new EntityId(this.ids.next());
    const secret = randomSecret();
    const now = this.clock.now();
    const credential = new ServiceCredential({ id, name: input.name, secretHash: await sha256(secret), scopes: input.scopes, status: "ACTIVE", expiresAt: input.expiresAt, rotatedFromId, createdByAdminUserId: new EntityId(principal.adminUserId), lastUsedAt: null, revokedAt: null, revokedByAdminUserId: null, createdAt: now, updatedAt: now });
    return { credential, rawToken: `${id.value}.${secret}` };
  }
}

export class ServiceAuthenticationService {
  constructor(private readonly repository: ApiSecurityRepository, private readonly clock: Clock, private readonly audit: AuditRecorder, private readonly requestsPerMinute = 120) {}

  async authenticate(authorization: string | null, requiredScope: ServiceScope): Promise<ServicePrincipal> {
    const match = authorization?.match(/^Bearer ([^.\s]+)\.([^\s]+)$/);
    if (!match) return this.fail("MISSING_BEARER_TOKEN");
    const credential = await this.repository.findCredential(match[1]);
    if (!credential || !constantTimeEqual(credential.props.secretHash, await sha256(match[2]))) return this.fail("INVALID_CREDENTIAL");
    const now = this.clock.now();
    if (credential.props.status !== "ACTIVE" || credential.props.expiresAt <= now) return this.fail("EXPIRED_OR_REVOKED");
    const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    if (await this.repository.consumeRateLimit(credential.props.id.value, windowStartedAt, now) > this.requestsPerMinute) throw new RateLimitExceededError("Service credential rate limit exceeded.");
    if (!credential.props.scopes.includes(requiredScope)) throw new AuthorizationDeniedError("SERVICE_SCOPE_REQUIRED", `Service scope ${requiredScope} is required.`);
    await this.repository.markCredentialUsed(credential.props.id.value, now);
    return Object.freeze({ type: "SERVICE", credentialId: credential.props.id.value, name: credential.props.name, scopes: new Set(credential.props.scopes) });
  }

  private async fail(reason: string): Promise<never> { await this.audit.record({ action: AUDIT_ACTIONS.serviceAuthenticationFailed, entityType: "SERVICE_CREDENTIAL", after: { reason } }); throw new AuthenticationRequiredError("Valid service credentials are required."); }
}

export class IdempotencyService {
  constructor(private readonly repository: ApiSecurityRepository, private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async begin(input: { scope: string; key: string; requestHash: string; ttlHours?: number }): Promise<{ kind: "EXECUTE"; id: string } | { kind: "REPLAY"; status: number; body: unknown }> {
    const scope = requireText(input.scope, "scope", 180).toLowerCase();
    const key = requireText(input.key, "idempotencyKey", 255);
    if (key.length < 8) throw new DomainValidationError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must contain at least 8 characters.");
    const now = this.clock.now();
    const candidate: IdempotencyRecord = { id: this.ids.next(), scope, key, requestHash: requireText(input.requestHash, "requestHash", 128), state: "PROCESSING", responseStatus: null, responseBody: null, expiresAt: new Date(now.getTime() + (input.ttlHours ?? 24) * 3_600_000), createdAt: now, updatedAt: now };
    const claimed = await this.repository.claimIdempotency(candidate);
    if (claimed.requestHash !== candidate.requestHash) throw new DomainConflictError("IDEMPOTENCY_PAYLOAD_CONFLICT", "Idempotency-Key was already used with a different request payload.");
    if (claimed.state === "COMPLETED") return { kind: "REPLAY", status: claimed.responseStatus!, body: claimed.responseBody };
    if (claimed.id !== candidate.id) throw new DomainConflictError("IDEMPOTENCY_REQUEST_IN_PROGRESS", "An identical request is already processing.");
    return { kind: "EXECUTE", id: candidate.id };
  }

  complete(id: string, status: number, body: unknown) { return this.repository.completeIdempotency(id, status, body, this.clock.now()); }
  release(id: string) { return this.repository.releaseIdempotency(id); }
}

export async function sha256(value: string) { const bytes = new TextEncoder().encode(value); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function randomSecret() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Buffer.from(bytes).toString("base64url"); }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i); return difference === 0; }
function safeCredentialSnapshot(value: ServiceCredential) { const p = value.props; return { id: p.id.value, name: p.name, scopes: p.scopes, status: p.status, expiresAt: p.expiresAt, rotatedFromId: p.rotatedFromId?.value ?? null, revokedAt: p.revokedAt }; }

export function parseServiceScopes(value: unknown): ServiceScope[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !SERVICE_SCOPES.includes(item as ServiceScope))) throw new DomainValidationError("INVALID_SERVICE_SCOPES", "Service scopes are invalid.");
  return value as ServiceScope[];
}
