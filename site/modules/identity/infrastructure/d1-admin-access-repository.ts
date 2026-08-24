import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  adminUserRoles,
  adminUsers,
  permissions,
  rolePermissions,
  roles,
} from "../../../db/schema.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import type { AdminAccessRepository } from "../application/ports.ts";
import {
  AdminUser,
  PERMISSION_CODES,
  ROLE_CODES,
  type PermissionCode,
  type RoleCode,
} from "../domain/access-control.ts";

export class D1AdminAccessRepository implements AdminAccessRepository {
  constructor(private readonly db: AppDatabase) {}

  async countAdminUsers(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)` }).from(adminUsers);
    return Number(row?.count ?? 0);
  }

  async findByProviderSubject(provider: string, externalSubject: string): Promise<AdminUser | null> {
    const [row] = await this.db.select().from(adminUsers).where(and(
      eq(adminUsers.identityProvider, provider.toLowerCase()),
      eq(adminUsers.externalSubject, externalSubject),
    )).limit(1);
    return row ? mapAdminUser(row) : null;
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const [row] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase())).limit(1);
    return row ? mapAdminUser(row) : null;
  }

  async saveWithRole(user: AdminUser, role: RoleCode, assignedByAdminUserId: string | null): Promise<void> {
    const roleId = await this.roleId(role);
    const { props } = user;
    await this.db.batch([
      this.db.insert(adminUsers).values({
        id: props.id.value,
        identityProvider: props.identityProvider,
        externalSubject: props.externalSubject,
        email: props.email.value,
        displayName: props.displayName,
        status: props.status,
        bootstrap: props.bootstrap,
        lastLoginAt: props.lastLoginAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      }),
      this.db.insert(adminUserRoles).values({
        adminUserId: props.id.value,
        roleId,
        assignedByAdminUserId,
        createdAt: props.createdAt,
      }),
    ]);
  }

  async saveLogin(user: AdminUser): Promise<void> {
    await this.db.update(adminUsers).set({
      lastLoginAt: user.props.lastLoginAt,
      updatedAt: user.props.updatedAt,
    }).where(eq(adminUsers.id, user.props.id.value));
  }

  async saveStatus(user: AdminUser): Promise<void> {
    await this.db.update(adminUsers).set({
      status: user.props.status,
      updatedAt: user.props.updatedAt,
    }).where(eq(adminUsers.id, user.props.id.value));
  }

  async listRoleCodes(adminUserId: string): Promise<RoleCode[]> {
    const rows = await this.db.select({ code: roles.code })
      .from(adminUserRoles)
      .innerJoin(roles, eq(adminUserRoles.roleId, roles.id))
      .where(eq(adminUserRoles.adminUserId, adminUserId));
    return rows.map((row) => row.code).filter(isRoleCode);
  }

  async listPermissionCodes(adminUserId: string): Promise<PermissionCode[]> {
    const rows = await this.db.selectDistinct({ code: permissions.code })
      .from(adminUserRoles)
      .innerJoin(rolePermissions, eq(adminUserRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(adminUserRoles.adminUserId, adminUserId));
    return rows.map((row) => row.code).filter(isPermissionCode);
  }

  async assignRole(adminUserId: string, role: RoleCode, assignedByAdminUserId: string, assignedAt: Date): Promise<void> {
    await this.db.insert(adminUserRoles).values({
      adminUserId,
      roleId: await this.roleId(role),
      assignedByAdminUserId,
      createdAt: assignedAt,
    }).onConflictDoNothing();
  }

  async revokeRole(adminUserId: string, role: RoleCode): Promise<void> {
    await this.db.delete(adminUserRoles).where(and(
      eq(adminUserRoles.adminUserId, adminUserId),
      eq(adminUserRoles.roleId, await this.roleId(role)),
    ));
  }

  private async roleId(code: RoleCode): Promise<string> {
    const [row] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
    if (!row) throw new Error(`Required system role ${code} is missing.`);
    return row.id;
  }
}

function mapAdminUser(row: typeof adminUsers.$inferSelect): AdminUser {
  return new AdminUser({
    id: new EntityId(row.id),
    identityProvider: row.identityProvider,
    externalSubject: row.externalSubject,
    email: new EmailAddress(row.email),
    displayName: row.displayName,
    status: row.status as "ACTIVE" | "SUSPENDED",
    bootstrap: row.bootstrap,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.includes(value as RoleCode);
}

function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODES.includes(value as PermissionCode);
}
