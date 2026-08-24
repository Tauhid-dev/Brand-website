import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  DomainConflictError,
} from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { CustomerIdentityRepository } from "../../customer/application/ports.ts";
import {
  AdminUser,
  PERMISSION_CODES,
  ROLE_CODES,
  type AdminPrincipal,
  type AdminUserStatus,
  type ExternalIdentity,
  type PermissionCode,
  type RoleCode,
  type CustomerPrincipal,
} from "../domain/access-control.ts";
import type { AdminAccessRepository } from "./ports.ts";

export class AdminAuthorizationGuard {
  requirePermission(principal: AdminPrincipal, permission: PermissionCode): void {
    if (!PERMISSION_CODES.includes(permission) || !principal.permissions.has(permission)) {
      throw new AuthorizationDeniedError("MISSING_PERMISSION", `Permission ${permission} is required.`);
    }
  }
}

export class CustomerAuthenticationService {
  constructor(private readonly identities: CustomerIdentityRepository) {}

  async execute(identity: ExternalIdentity): Promise<CustomerPrincipal> {
    const stored = await this.identities.findByProviderSubject(identity.provider, identity.externalSubject);
    if (!stored) {
      throw new AuthenticationRequiredError("This signed-in identity is not linked to a customer account.");
    }
    return Object.freeze({
      type: "CUSTOMER",
      customerId: stored.customerId.value,
      identityId: stored.id.value,
      email: stored.email.value,
    });
  }

  requireCustomer(principal: CustomerPrincipal, customerId: string): void {
    if (principal.customerId !== customerId) {
      throw new AuthorizationDeniedError("CUSTOMER_SCOPE_DENIED", "Customer access is limited to the signed-in account.");
    }
  }
}

export class AdminAuthenticationService {
  constructor(
    private readonly repository: AdminAccessRepository,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(identity: ExternalIdentity): Promise<AdminPrincipal> {
    const user = await this.repository.findByProviderSubject(identity.provider, identity.externalSubject);
    if (!user) {
      await this.audit.record({
        action: AUDIT_ACTIONS.adminLoginFailed,
        entityType: "ADMIN_USER",
        after: { identityProvider: identity.provider, email: identity.email.value, reason: "NOT_PROVISIONED" },
      });
      throw new AuthenticationRequiredError("This signed-in identity is not provisioned for administration.");
    }
    if (user.props.status !== "ACTIVE") {
      await this.audit.record({
        action: AUDIT_ACTIONS.adminLoginFailed,
        entityType: "ADMIN_USER",
        entityId: user.props.id.value,
        after: { status: user.props.status, reason: "ACCOUNT_SUSPENDED" },
      });
      throw new AuthorizationDeniedError("ADMIN_ACCOUNT_SUSPENDED", "This administrator account is suspended.");
    }
    const [roles, permissions] = await Promise.all([
      this.repository.listRoleCodes(user.props.id.value),
      this.repository.listPermissionCodes(user.props.id.value),
    ]);
    if (roles.length === 0) {
      await this.audit.record({
        action: AUDIT_ACTIONS.adminLoginFailed,
        entityType: "ADMIN_USER",
        entityId: user.props.id.value,
        after: { reason: "NO_ROLE" },
      });
      throw new AuthorizationDeniedError("ADMIN_ROLE_REQUIRED", "This administrator has no assigned role.");
    }
    const loggedIn = user.recordLogin(this.clock.now());
    await this.repository.saveLogin(loggedIn);
    await this.audit.record({
      action: AUDIT_ACTIONS.adminLoginSuccess,
      entityType: "ADMIN_USER",
      entityId: user.props.id.value,
      after: { roles, permissions },
    });
    return Object.freeze({
      type: "ADMIN",
      adminUserId: user.props.id.value,
      email: user.props.email.value,
      displayName: user.props.displayName,
      roles: new Set(roles),
      permissions: new Set(permissions),
    });
  }
}

export class BootstrapFirstAdminService {
  constructor(
    private readonly repository: AdminAccessRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(identity: ExternalIdentity): Promise<AdminUser> {
    if (await this.repository.countAdminUsers() !== 0) {
      throw new DomainConflictError("ADMIN_BOOTSTRAP_CLOSED", "The first-administrator bootstrap has already been used.");
    }
    const user = createAdminUser(identity, this.ids, this.clock, true);
    await this.repository.saveWithRole(user, "SUPER_ADMIN", null);
    await this.audit.record({
      action: AUDIT_ACTIONS.adminUserCreated,
      entityType: "ADMIN_USER",
      entityId: user.props.id.value,
      after: adminSnapshot(user, ["SUPER_ADMIN"]),
    });
    return user;
  }
}

export class ManageAdminAccessService {
  constructor(
    private readonly repository: AdminAccessRepository,
    private readonly guard: AdminAuthorizationGuard,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async create(principal: AdminPrincipal, identity: ExternalIdentity, initialRole: RoleCode): Promise<AdminUser> {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    if (!ROLE_CODES.includes(initialRole)) throw new DomainConflictError("ROLE_NOT_FOUND", "Role does not exist.");
    if (await this.repository.findByEmail(identity.email.value)) {
      throw new DomainConflictError("ADMIN_EMAIL_EXISTS", "An administrator already uses this email.");
    }
    if (await this.repository.findByProviderSubject(identity.provider, identity.externalSubject)) {
      throw new DomainConflictError("ADMIN_IDENTITY_EXISTS", "This administrator identity already exists.");
    }
    const user = createAdminUser(identity, this.ids, this.clock);
    await this.repository.saveWithRole(user, initialRole, principal.adminUserId);
    await this.audit.record({
      action: AUDIT_ACTIONS.adminUserCreated,
      entityType: "ADMIN_USER",
      entityId: user.props.id.value,
      after: adminSnapshot(user, [initialRole]),
    });
    return user;
  }

  async changeStatus(principal: AdminPrincipal, user: AdminUser, status: AdminUserStatus): Promise<AdminUser> {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    if (principal.adminUserId === user.props.id.value && status === "SUSPENDED") {
      throw new DomainConflictError("SELF_SUSPENSION_NOT_ALLOWED", "Administrators cannot suspend their own account.");
    }
    const next = user.changeStatus(status, this.clock.now());
    await this.repository.saveStatus(next);
    await this.audit.record({
      action: AUDIT_ACTIONS.adminUserStatusChanged,
      entityType: "ADMIN_USER",
      entityId: user.props.id.value,
      before: { status: user.props.status },
      after: { status: next.props.status },
    });
    return next;
  }

  async assignRole(principal: AdminPrincipal, adminUserId: string, role: RoleCode): Promise<void> {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    if (!ROLE_CODES.includes(role)) throw new DomainConflictError("ROLE_NOT_FOUND", "Role does not exist.");
    const currentRoles = await this.repository.listRoleCodes(adminUserId);
    if (currentRoles.includes(role)) {
      throw new DomainConflictError("ADMIN_ROLE_EXISTS", "Administrator already has this role.");
    }
    await this.repository.assignRole(adminUserId, role, principal.adminUserId, this.clock.now());
    await this.audit.record({
      action: AUDIT_ACTIONS.adminRoleAssigned,
      entityType: "ADMIN_USER",
      entityId: adminUserId,
      after: { role },
    });
  }

  async revokeRole(principal: AdminPrincipal, adminUserId: string, role: RoleCode): Promise<void> {
    this.guard.requirePermission(principal, "ADMIN_USER_MANAGE");
    if (principal.adminUserId === adminUserId && role === "SUPER_ADMIN") {
      throw new DomainConflictError("SELF_SUPER_ADMIN_REVOKE_NOT_ALLOWED", "Administrators cannot revoke their own super-admin role.");
    }
    const currentRoles = await this.repository.listRoleCodes(adminUserId);
    if (!currentRoles.includes(role)) {
      throw new DomainConflictError("ADMIN_ROLE_NOT_ASSIGNED", "Administrator does not have this role.");
    }
    if (currentRoles.length === 1) {
      throw new DomainConflictError("ADMIN_ROLE_REQUIRED", "Administrator must retain at least one role.");
    }
    await this.repository.revokeRole(adminUserId, role);
    await this.audit.record({
      action: AUDIT_ACTIONS.adminRoleRevoked,
      entityType: "ADMIN_USER",
      entityId: adminUserId,
      before: { role },
    });
  }
}

function createAdminUser(identity: ExternalIdentity, ids: IdGenerator, clock: Clock, bootstrap = false): AdminUser {
  const now = clock.now();
  return new AdminUser({
    id: new EntityId(ids.next()),
    identityProvider: identity.provider,
    externalSubject: identity.externalSubject,
    email: identity.email,
    displayName: identity.displayName,
    status: "ACTIVE",
    bootstrap,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function adminSnapshot(user: AdminUser, roles: RoleCode[]) {
  return {
    id: user.props.id.value,
    identityProvider: user.props.identityProvider,
    email: user.props.email.value,
    displayName: user.props.displayName,
    status: user.props.status,
    bootstrap: user.props.bootstrap,
    roles,
  };
}
