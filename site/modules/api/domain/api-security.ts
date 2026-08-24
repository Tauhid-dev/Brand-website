import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";

export const SERVICE_SCOPES = [
  "customer:read",
  "subscription:validate",
  "entitlement:read",
  "agent-link:write",
] as const;
export type ServiceScope = (typeof SERVICE_SCOPES)[number];

export type ServiceCredentialProps = {
  id: EntityId;
  name: string;
  secretHash: string;
  scopes: readonly ServiceScope[];
  status: "ACTIVE" | "REVOKED";
  expiresAt: Date;
  rotatedFromId: EntityId | null;
  createdByAdminUserId: EntityId;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedByAdminUserId: EntityId | null;
  createdAt: Date;
  updatedAt: Date;
};

export class ServiceCredential {
  readonly props: Readonly<ServiceCredentialProps>;

  constructor(input: ServiceCredentialProps) {
    const scopes = [...new Set(input.scopes)].sort();
    if (!scopes.length || scopes.some((scope) => !SERVICE_SCOPES.includes(scope))) throw new DomainValidationError("INVALID_SERVICE_SCOPES", "At least one supported service scope is required.");
    if (input.expiresAt <= input.createdAt) throw new DomainValidationError("INVALID_CREDENTIAL_EXPIRY", "Service credential expiry must be in the future.");
    if ((input.status === "ACTIVE") !== (input.revokedAt == null && input.revokedByAdminUserId == null)) throw new DomainValidationError("INVALID_CREDENTIAL_STATUS", "Service credential revocation state is contradictory.");
    this.props = Object.freeze({ ...input, name: requireText(input.name, "name", 160), secretHash: requireText(input.secretHash, "secretHash", 128), scopes: Object.freeze(scopes) });
  }

  revoke(adminUserId: string, at: Date) {
    if (this.props.status === "REVOKED") return this;
    return new ServiceCredential({ ...this.props, status: "REVOKED", revokedAt: at, revokedByAdminUserId: new EntityId(adminUserId), updatedAt: at });
  }
}

export type ServicePrincipal = Readonly<{ type: "SERVICE"; credentialId: string; name: string; scopes: ReadonlySet<ServiceScope> }>;

export type IdempotencyRecord = Readonly<{
  id: string;
  scope: string;
  key: string;
  requestHash: string;
  state: "PROCESSING" | "COMPLETED";
  responseStatus: number | null;
  responseBody: unknown;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;
