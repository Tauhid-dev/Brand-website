import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopmentCatalogue } from "../db/seeds/development.ts";
import type { CatalogueRepository } from "../modules/catalogue/application/ports.ts";
import { CatalogueManagementService } from "../modules/catalogue/application/catalogue-services.ts";
import type { Offering, Plan, PlanFeature } from "../modules/catalogue/domain/catalogue.ts";
import {
  CreateCustomerService,
  AcceptCustomerInvitationService,
  AddCustomerNoteService,
  InviteCustomerService,
  RegisterCustomerService,
} from "../modules/customer/application/customer-services.ts";
import type {
  CustomerIdentityRepository,
  CustomerInvitationRepository,
  CustomerRepository,
} from "../modules/customer/application/ports.ts";
import type { Customer, CustomerBusinessProfile, CustomerNote } from "../modules/customer/domain/customer.ts";
import type { CustomerIdentity, CustomerInvitation } from "../modules/customer/domain/customer-access.ts";
import { DomainConflictError } from "../modules/shared/domain/errors.ts";
import { RequestContextFactory, mapApplicationError } from "../modules/shared/presentation/api-primitives.ts";
import { NOOP_AUDIT, RecordingAudit } from "./support/audit.ts";
import { WebCryptoInvitationToken } from "../modules/customer/infrastructure/web-crypto-invitation-token.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");

class SequenceIds {
  private value = 0;
  next(): string {
    this.value += 1;
    return `00000000-0000-4000-8000-${this.value.toString().padStart(12, "0")}`;
  }
}

class MemoryCustomers implements CustomerRepository {
  readonly values = new Map<string, Customer>();
  readonly profiles = new Map<string, CustomerBusinessProfile>();
  readonly notes: CustomerNote[] = [];
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findByExternalReference(reference: string) {
    return [...this.values.values()].find((value) => value.snapshot.externalReference === reference) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.values.values()].find((value) => value.snapshot.email.value === email) ?? null;
  }
  async save(customer: Customer, profile: CustomerBusinessProfile) {
    this.values.set(customer.snapshot.id.value, customer);
    this.profiles.set(profile.props.customerId.value, profile);
  }
  async addNote(note: CustomerNote) { this.notes.push(note); }
}

class MemoryIdentities implements CustomerIdentityRepository {
  readonly values: CustomerIdentity[] = [];
  async findByProviderSubject(provider: string, subject: string) {
    return this.values.find((value) => value.provider === provider.toLowerCase() && value.externalSubject === subject) ?? null;
  }
  async save(identity: CustomerIdentity) { this.values.push(identity); }
}

class MemoryInvitations implements CustomerInvitationRepository {
  readonly values: CustomerInvitation[] = [];
  readonly acceptedIdentities: CustomerIdentity[] = [];
  async findPendingByEmail(email: string) {
    return this.values.find((value) => value.email.value === email && value.status === "PENDING") ?? null;
  }
  async findPendingByTokenHash(tokenHash: string) {
    return this.values.find((value) => value.tokenHash === tokenHash && value.status === "PENDING") ?? null;
  }
  async save(invitation: CustomerInvitation) { this.values.push(invitation); }
  async accept(invitation: CustomerInvitation, identity: CustomerIdentity, newCustomer?: { customer: Customer; profile: CustomerBusinessProfile }) {
    const index = this.values.findIndex((value) => value.id.value === invitation.id.value);
    if (index >= 0) this.values[index] = invitation;
    this.acceptedIdentities.push(identity);
    void newCustomer;
  }
}

class MemoryCatalogue implements CatalogueRepository {
  readonly offerings = new Map<string, Offering>();
  readonly plans = new Map<string, Plan>();
  readonly features = new Map<string, PlanFeature>();
  async findOfferingByCode(code: string) { return this.offerings.get(code) ?? null; }
  async findPlanByCode(code: string) { return this.plans.get(code) ?? null; }
  async saveOffering(value: Offering) { this.offerings.set(value.props.code.value, value); }
  async savePlan(value: Plan) { this.plans.set(value.props.code.value, value); }
  async savePlanFeature(value: PlanFeature) {
    this.features.set(`${value.planId.value}:${value.offeringId.value}`, value);
  }
}

function createService(customers = new MemoryCustomers(), ids = new SequenceIds()) {
  return {
    customers,
    ids,
    service: new CreateCustomerService(customers, ids, { now: () => NOW }, NOOP_AUDIT),
  };
}

const CUSTOMER_INPUT = {
  externalReference: "customer-001",
  businessName: "Example Plumbing Pty Ltd",
  contactName: "Casey Example",
  email: "CASEY@example.invalid",
};

test("admin creation persists a customer and one business profile", async () => {
  const context = createService();
  const customer = await context.service.execute({ ...CUSTOMER_INPUT, creationSource: "ADMIN" });
  assert.equal(customer.snapshot.creationSource, "ADMIN");
  assert.equal(customer.snapshot.email.value, "casey@example.invalid");
  assert.equal(context.customers.profiles.size, 1);
  await assert.rejects(
    context.service.execute({ ...CUSTOMER_INPUT, creationSource: "ADMIN" }),
    { code: "CUSTOMER_REFERENCE_EXISTS" },
  );
});

test("internal notes require an existing customer", async () => {
  const context = createService();
  const customer = await context.service.execute({ ...CUSTOMER_INPUT, creationSource: "ADMIN" });
  const notes = new AddCustomerNoteService(context.customers, context.ids, { now: () => NOW }, NOOP_AUDIT);
  await notes.execute({
    customerId: customer.snapshot.id.value,
    body: "Customer prefers weekday calls.",
    authorType: "ADMIN",
    authorId: "admin-1",
  });
  assert.equal(context.customers.notes[0]?.body, "Customer prefers weekday calls.");
  await assert.rejects(notes.execute({
    customerId: "00000000-0000-4000-8000-999999999999",
    body: "Should not persist.",
    authorType: "SYSTEM",
    authorId: "system",
  }), { code: "CUSTOMER_NOT_FOUND" });
});

test("self-registration records an external identity without coupling to HTTP", async () => {
  const context = createService();
  const identities = new MemoryIdentities();
  const registration = new RegisterCustomerService(
    context.service,
    identities,
    context.ids,
    { now: () => NOW },
    NOOP_AUDIT,
  );
  const customer = await registration.execute({
    ...CUSTOMER_INPUT,
    provider: "AUTH0",
    externalSubject: "auth0|subject-1",
  });
  assert.equal(customer.snapshot.creationSource, "SELF_REGISTRATION");
  assert.equal(identities.values[0]?.provider, "auth0");
  assert.equal(identities.values[0]?.customerId.value, customer.snapshot.id.value);
});

test("invitation service persists only a hash and passes the raw token to delivery", async () => {
  const repository = new MemoryInvitations();
  const deliveries: Array<{ email: string; rawToken: string }> = [];
  const service = new InviteCustomerService(
    repository,
    {
      create: async () => ({ rawToken: "opaque-token", tokenHash: "sha256-hash" }),
      hash: async () => "sha256-hash",
    },
    { send: async (value) => { deliveries.push(value); } },
    new SequenceIds(),
    { now: () => NOW },
    NOOP_AUDIT,
  );
  await service.execute({ email: "invitee@example.invalid", invitedBy: "admin-1" });
  assert.equal(repository.values[0]?.tokenHash, "sha256-hash");
  assert.equal(deliveries[0]?.rawToken, "opaque-token");
  assert.equal(deliveries[0]?.email, "invitee@example.invalid");
});

test("invitation acceptance binds the authenticated identity and prevents replay", async () => {
  const context = createService();
  const customer = await context.service.execute({ ...CUSTOMER_INPUT, creationSource: "ADMIN" });
  const invitations = new MemoryInvitations();
  const identities = new MemoryIdentities();
  const tokens = {
    create: async () => ({ rawToken: "opaque-token", tokenHash: "sha256-hash" }),
    hash: async () => "sha256-hash",
  };
  await new InviteCustomerService(
    invitations, tokens, { send: async () => undefined }, context.ids, { now: () => NOW }, NOOP_AUDIT,
  ).execute({
    email: CUSTOMER_INPUT.email,
    invitedBy: "admin-1",
    customerId: customer.snapshot.id.value,
  });
  const accepted = new AcceptCustomerInvitationService(
    context.service,
    context.customers,
    identities,
    invitations,
    tokens,
    context.ids,
    { now: () => new Date("2026-08-23T01:00:00.000Z") },
    NOOP_AUDIT,
  );
  const result = await accepted.execute({
    rawToken: "opaque-token",
    provider: "chatgpt-siwc",
    externalSubject: "site-user-1",
    authenticatedEmail: "casey@example.invalid",
  });
  assert.equal(result.snapshot.id.value, customer.snapshot.id.value);
  assert.equal(invitations.values[0]?.status, "ACCEPTED");
  assert.equal(invitations.acceptedIdentities[0]?.acceptedInvitationId?.value, invitations.values[0]?.id.value);
  await assert.rejects(accepted.execute({
    rawToken: "opaque-token",
    provider: "chatgpt-siwc",
    externalSubject: "site-user-2",
    authenticatedEmail: "casey@example.invalid",
  }), { code: "INVITATION_NOT_FOUND" });
});

test("invitation tokens use platform cryptography and store only a deterministic hash", async () => {
  const tokens = new WebCryptoInvitationToken();
  const created = await tokens.create();
  assert.equal(created.rawToken.length >= 43, true);
  assert.equal(created.tokenHash.length, 64);
  assert.notEqual(created.rawToken, created.tokenHash);
  assert.equal(await tokens.hash(created.rawToken), created.tokenHash);
});

test("development catalogue seed is deterministic and idempotent", async () => {
  const repository = new MemoryCatalogue();
  await seedDevelopmentCatalogue(repository);
  await seedDevelopmentCatalogue(repository);
  assert.equal(repository.offerings.size, 10);
  assert.equal(repository.plans.size, 4);
  assert.equal(repository.features.size, 17);
  assert.equal(repository.plans.get("growth_engine")?.props.featured, true);
  assert.equal(
    [...repository.features.values()].find((value) => value.limitUnit === "posts_per_month")?.limitValue,
    4,
  );
});

test("catalogue management records commercial changes through the audit boundary", async () => {
  const repository = new MemoryCatalogue();
  const audit = new RecordingAudit();
  const service = new CatalogueManagementService(repository, new SequenceIds(), { now: () => NOW }, audit);
  await service.createOffering({ code: "ai_receptionist", name: "AI Receptionist", category: "AI" });
  await service.createPlan({ code: "growth_engine", name: "Growth Engine", featured: true });
  await service.setPlanFeature({ planCode: "growth_engine", offeringCode: "ai_receptionist", included: true, limitValue: 500, limitUnit: "conversations_per_month" });
  assert.deepEqual(audit.records.map((record) => record.action), [
    "OFFERING_CREATED", "PLAN_CREATED", "PLAN_FEATURE_CHANGED",
  ]);
});

test("API primitives carry request context and safely map application errors", () => {
  const context = new RequestContextFactory(new SequenceIds(), { now: () => NOW }).create({
    actor: { type: "ADMIN", id: "admin-1" },
    idempotencyKey: " create-customer-1 ",
  });
  const problem = mapApplicationError(
    new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist."),
    context.requestId,
  );
  assert.equal(context.idempotencyKey, "create-customer-1");
  assert.equal(problem.status, 404);
  assert.equal(problem.body.error.requestId, context.requestId);
  assert.equal(mapApplicationError(new Error("secret detail"), context.requestId).body.error.message,
    "An unexpected error occurred.");
});
