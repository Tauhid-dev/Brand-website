import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminAuthenticationService,
  AdminAuthorizationGuard,
  BootstrapFirstAdminService,
  ManageAdminAccessService,
} from "../modules/identity/application/access-control-services.ts";
import type { AdminAccessRepository } from "../modules/identity/application/ports.ts";
import {
  AdminUser,
  createExternalIdentity,
  type PermissionCode,
  type RoleCode,
} from "../modules/identity/domain/access-control.ts";
import { RecordingAudit } from "./support/audit.ts";

const NOW = new Date("2026-08-24T00:00:00.000Z");
const ALL_PERMISSIONS = new Set<PermissionCode>([
  "CUSTOMER_READ", "CUSTOMER_WRITE", "CATALOG_READ", "CATALOG_WRITE",
  "PRICE_READ", "PRICE_WRITE", "DISCOUNT_READ", "DISCOUNT_WRITE",
  "SUBSCRIPTION_READ", "SUBSCRIPTION_WRITE", "BILLING_READ", "BILLING_WRITE",
  "AGENT_LINK_READ", "AGENT_LINK_WRITE", "ADMIN_USER_MANAGE", "AUDIT_READ",
]);

class SequenceIds {
  private value = 0;
  next() { return `10000000-0000-4000-8000-${(++this.value).toString().padStart(12, "0")}`; }
}

class MemoryAdminAccess implements AdminAccessRepository {
  readonly users = new Map<string, AdminUser>();
  readonly roles = new Map<string, Set<RoleCode>>();
  async countAdminUsers() { return this.users.size; }
  async findByProviderSubject(provider: string, subject: string) {
    return [...this.users.values()].find((user) => user.props.identityProvider === provider && user.props.externalSubject === subject) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((user) => user.props.email.value === email) ?? null;
  }
  async saveWithRole(user: AdminUser, role: RoleCode, assignedBy: string | null) {
    void assignedBy;
    this.users.set(user.props.id.value, user);
    this.roles.set(user.props.id.value, new Set([role]));
  }
  async saveLogin(user: AdminUser) { this.users.set(user.props.id.value, user); }
  async saveStatus(user: AdminUser) { this.users.set(user.props.id.value, user); }
  async listRoleCodes(id: string) { return [...(this.roles.get(id) ?? [])]; }
  async listPermissionCodes(id: string): Promise<PermissionCode[]> {
    const roles = this.roles.get(id) ?? new Set<RoleCode>();
    if (roles.has("SUPER_ADMIN")) return [...ALL_PERMISSIONS];
    if (roles.has("READ_ONLY")) return ["CUSTOMER_READ", "CATALOG_READ", "PRICE_READ", "AUDIT_READ"];
    return [];
  }
  async assignRole(id: string, role: RoleCode, assignedBy: string, assignedAt: Date) {
    void assignedBy;
    void assignedAt;
    const values = this.roles.get(id) ?? new Set<RoleCode>();
    values.add(role);
    this.roles.set(id, values);
  }
  async revokeRole(id: string, role: RoleCode) { this.roles.get(id)?.delete(role); }
}

const firstIdentity = createExternalIdentity({
  provider: "CHATGPT-SIWC",
  externalSubject: "site-user-1",
  email: "owner@example.invalid",
  displayName: "Owner Example",
});

test("one-time bootstrap provisions an external super admin without passwords", async () => {
  const repository = new MemoryAdminAccess();
  const audit = new RecordingAudit();
  const bootstrap = new BootstrapFirstAdminService(repository, new SequenceIds(), { now: () => NOW }, audit);
  const user = await bootstrap.execute(firstIdentity);
  assert.equal(user.props.bootstrap, true);
  assert.deepEqual(await repository.listRoleCodes(user.props.id.value), ["SUPER_ADMIN"]);
  assert.equal("passwordHash" in user.props, false);
  await assert.rejects(bootstrap.execute(createExternalIdentity({
    provider: "chatgpt-siwc", externalSubject: "site-user-2", email: "other@example.invalid", displayName: "Other",
  })), { code: "ADMIN_BOOTSTRAP_CLOSED" });
  assert.equal(audit.records[0]?.action, "ADMIN_USER_CREATED");
});

test("external admin authentication resolves roles and guards permissions server-side", async () => {
  const repository = new MemoryAdminAccess();
  const audit = new RecordingAudit();
  const user = await new BootstrapFirstAdminService(repository, new SequenceIds(), { now: () => NOW }, audit).execute(firstIdentity);
  const principal = await new AdminAuthenticationService(repository, { now: () => NOW }, audit).execute(firstIdentity);
  const guard = new AdminAuthorizationGuard();
  assert.doesNotThrow(() => guard.requirePermission(principal, "ADMIN_USER_MANAGE"));
  assert.equal(repository.users.get(user.props.id.value)?.props.lastLoginAt?.toISOString(), NOW.toISOString());
  assert.equal(audit.records.at(-1)?.action, "ADMIN_LOGIN_SUCCESS");
  const readOnlyPrincipal = { ...principal, permissions: new Set<PermissionCode>(["CUSTOMER_READ"]) };
  assert.throws(() => guard.requirePermission(readOnlyPrincipal, "CUSTOMER_WRITE"), { code: "MISSING_PERMISSION" });
});

test("unprovisioned identities are rejected and failed access is audited", async () => {
  const audit = new RecordingAudit();
  const service = new AdminAuthenticationService(new MemoryAdminAccess(), { now: () => NOW }, audit);
  await assert.rejects(service.execute(firstIdentity), { code: "AUTHENTICATION_REQUIRED" });
  assert.deepEqual(audit.records.map((record) => record.action), ["ADMIN_LOGIN_FAILED"]);
});

test("admin access management requires permission and protects self-escalation controls", async () => {
  const repository = new MemoryAdminAccess();
  const audit = new RecordingAudit();
  const ids = new SequenceIds();
  const owner = await new BootstrapFirstAdminService(repository, ids, { now: () => NOW }, audit).execute(firstIdentity);
  const principal = await new AdminAuthenticationService(repository, { now: () => NOW }, audit).execute(firstIdentity);
  const management = new ManageAdminAccessService(repository, new AdminAuthorizationGuard(), ids, { now: () => NOW }, audit);
  const created = await management.create(principal, createExternalIdentity({
    provider: "chatgpt-siwc", externalSubject: "site-user-2", email: "reader@example.invalid", displayName: "Reader",
  }), "READ_ONLY");
  assert.deepEqual(await repository.listRoleCodes(created.props.id.value), ["READ_ONLY"]);
  await assert.rejects(management.changeStatus(principal, owner, "SUSPENDED"), { code: "SELF_SUSPENSION_NOT_ALLOWED" });
  await assert.rejects(management.revokeRole(principal, owner.props.id.value, "SUPER_ADMIN"), { code: "SELF_SUPER_ADMIN_REVOKE_NOT_ALLOWED" });
});
