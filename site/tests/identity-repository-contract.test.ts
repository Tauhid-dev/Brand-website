import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminAuthenticationService,
  BootstrapFirstAdminService,
} from "../modules/identity/application/access-control-services.ts";
import { PERMISSION_CODES, ROLE_CODES, createExternalIdentity } from "../modules/identity/domain/access-control.ts";
import { D1AdminAccessRepository } from "../modules/identity/infrastructure/d1-admin-access-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { RecordingAudit } from "./support/audit.ts";
import {
  AcceptCustomerInvitationService,
  CreateCustomerService,
  InviteCustomerService,
} from "../modules/customer/application/customer-services.ts";
import {
  D1CustomerIdentityRepository,
  D1CustomerInvitationRepository,
  D1CustomerRepository,
} from "../modules/customer/infrastructure/d1-customer-repositories.ts";
import { NOOP_AUDIT } from "./support/audit.ts";

const NOW = new Date("2026-08-24T00:00:00.000Z");

test("D1 admin repository composes seeded roles into a server-side principal", async () => {
  const context = repositoryDatabase();
  const repository = new D1AdminAccessRepository(context.database);
  const audit = new RecordingAudit();
  const identity = createExternalIdentity({
    provider: "chatgpt-siwc",
    externalSubject: "site-user-1",
    email: "owner@example.invalid",
    displayName: "Owner Example",
  });
  await new BootstrapFirstAdminService(
    repository,
    { next: () => "10000000-0000-4000-8000-000000000001" },
    { now: () => NOW },
    audit,
  ).execute(identity);
  const principal = await new AdminAuthenticationService(repository, { now: () => NOW }, audit).execute(identity);
  assert.equal(principal.roles.has("SUPER_ADMIN"), true);
  assert.equal(principal.permissions.size, 16);
  assert.equal(principal.permissions.has("ADMIN_USER_MANAGE"), true);
  assert.equal(context.client.database.prepare("select count(*) as count from admin_user_roles where admin_user_id = '10000000-0000-4000-8000-000000000001'").get()?.count, 1);
  context.client.close();
});

test("migration-seeded RBAC codes stay aligned with the typed policy", () => {
  const context = repositoryDatabase();
  const roleCodes = context.client.database.prepare("select code from roles order by code").all().map((row) => String(row.code));
  const permissionCodes = context.client.database.prepare("select code from permissions order by code").all().map((row) => String(row.code));
  assert.deepEqual(roleCodes, [...ROLE_CODES].sort());
  assert.deepEqual(permissionCodes, [...PERMISSION_CODES].sort());
  context.client.close();
});

test("D1 invitation acceptance atomically creates an unbound customer and identity", async () => {
  const context = repositoryDatabase();
  let sequence = 100;
  const ids = { next: () => `20000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` };
  const clock = { now: () => NOW };
  const customers = new D1CustomerRepository(context.database);
  const identities = new D1CustomerIdentityRepository(context.database);
  const invitations = new D1CustomerInvitationRepository(context.database);
  const tokens = {
    create: async () => ({ rawToken: "opaque-invitation-token-value-123456", tokenHash: "known-hash" }),
    hash: async () => "known-hash",
  };
  const createCustomer = new CreateCustomerService(customers, ids, clock, NOOP_AUDIT);
  await new InviteCustomerService(
    invitations, tokens, { send: async () => undefined }, ids, clock, NOOP_AUDIT,
  ).execute({ email: "invitee@example.invalid", invitedBy: "admin-1" });
  await new AcceptCustomerInvitationService(
    createCustomer, customers, identities, invitations, tokens, ids,
    { now: () => new Date("2026-08-24T01:00:00.000Z") }, NOOP_AUDIT,
  ).execute({
    rawToken: "opaque-invitation-token-value-123456",
    provider: "chatgpt-siwc",
    externalSubject: "site-user-2",
    authenticatedEmail: "invitee@example.invalid",
    customer: {
      externalReference: "invited-customer-1",
      businessName: "Invited Example Pty Ltd",
      contactName: "Invited Example",
    },
  });
  assert.equal(context.client.database.prepare("select count(*) as count from customers").get()?.count, 1);
  assert.equal(context.client.database.prepare("select count(*) as count from customer_business_profiles").get()?.count, 1);
  assert.equal(context.client.database.prepare("select count(*) as count from customer_identities where accepted_invitation_id is not null").get()?.count, 1);
  assert.equal(context.client.database.prepare("select status from customer_invitations").get()?.status, "ACCEPTED");
  context.client.close();
});
