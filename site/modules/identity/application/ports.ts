import type { AdminUser, PermissionCode, RoleCode } from "../domain/access-control.ts";

export interface AdminAccessRepository {
  countAdminUsers(): Promise<number>;
  findByProviderSubject(provider: string, externalSubject: string): Promise<AdminUser | null>;
  findByEmail(email: string): Promise<AdminUser | null>;
  saveWithRole(user: AdminUser, role: RoleCode, assignedByAdminUserId: string | null): Promise<void>;
  saveLogin(user: AdminUser): Promise<void>;
  saveStatus(user: AdminUser): Promise<void>;
  listRoleCodes(adminUserId: string): Promise<RoleCode[]>;
  listPermissionCodes(adminUserId: string): Promise<PermissionCode[]>;
  assignRole(adminUserId: string, role: RoleCode, assignedByAdminUserId: string, assignedAt: Date): Promise<void>;
  revokeRole(adminUserId: string, role: RoleCode): Promise<void>;
}
