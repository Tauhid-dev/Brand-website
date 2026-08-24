import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId, requireText } from "../../shared/domain/value-objects.ts";

export const CHATGPT_IDENTITY_PROVIDER = "chatgpt-siwc";

export const ROLE_CODES = ["SUPER_ADMIN", "ADMIN", "SALES", "SUPPORT", "READ_ONLY"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSION_CODES = [
  "CUSTOMER_READ", "CUSTOMER_WRITE", "CATALOG_READ", "CATALOG_WRITE",
  "PRICE_READ", "PRICE_WRITE", "DISCOUNT_READ", "DISCOUNT_WRITE",
  "SUBSCRIPTION_READ", "SUBSCRIPTION_WRITE", "BILLING_READ", "BILLING_WRITE",
  "OPERATIONS_READ", "OPERATIONS_WRITE",
  "AGENT_LINK_READ", "AGENT_LINK_WRITE", "ADMIN_USER_MANAGE", "AUDIT_READ",
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type ExternalIdentity = Readonly<{
  provider: string;
  externalSubject: string;
  email: EmailAddress;
  displayName: string;
}>;

export function createExternalIdentity(input: {
  provider: string;
  externalSubject: string;
  email: string;
  displayName: string;
}): ExternalIdentity {
  return Object.freeze({
    provider: requireText(input.provider, "provider", 80).toLowerCase(),
    externalSubject: requireText(input.externalSubject, "externalSubject", 255),
    email: new EmailAddress(input.email),
    displayName: requireText(input.displayName, "displayName", 200),
  });
}

export type AdminUserStatus = "ACTIVE" | "SUSPENDED";

export type AdminUserProps = {
  id: EntityId;
  identityProvider: string;
  externalSubject: string;
  email: EmailAddress;
  displayName: string;
  status: AdminUserStatus;
  bootstrap: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class AdminUser {
  readonly props: Readonly<AdminUserProps>;

  constructor(input: AdminUserProps) {
    if (input.status !== "ACTIVE" && input.status !== "SUSPENDED") {
      throw new DomainValidationError("INVALID_ADMIN_STATUS", "Admin user status is invalid.");
    }
    if (input.updatedAt < input.createdAt || (input.lastLoginAt && input.lastLoginAt < input.createdAt)) {
      throw new DomainValidationError("INVALID_ADMIN_TIMESTAMPS", "Admin user timestamps are contradictory.");
    }
    this.props = Object.freeze({
      ...input,
      identityProvider: requireText(input.identityProvider, "identityProvider", 80).toLowerCase(),
      externalSubject: requireText(input.externalSubject, "externalSubject", 255),
      displayName: requireText(input.displayName, "displayName", 200),
    });
  }

  recordLogin(at: Date): AdminUser {
    return new AdminUser({ ...this.props, lastLoginAt: at, updatedAt: at });
  }

  changeStatus(status: AdminUserStatus, at: Date): AdminUser {
    return new AdminUser({ ...this.props, status, updatedAt: at });
  }
}

export type AdminPrincipal = Readonly<{
  type: "ADMIN";
  adminUserId: string;
  email: string;
  displayName: string;
  roles: ReadonlySet<RoleCode>;
  permissions: ReadonlySet<PermissionCode>;
}>;

export type CustomerPrincipal = Readonly<{
  type: "CUSTOMER";
  customerId: string;
  identityId: string;
  email: string;
}>;
