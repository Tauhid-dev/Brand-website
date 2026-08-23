import assert from "node:assert/strict";
import test from "node:test";
import { Customer } from "../modules/customer/domain/customer.ts";
import { createCustomerInvitation } from "../modules/customer/domain/customer-access.ts";
import { createPlanFeature } from "../modules/catalogue/domain/catalogue.ts";
import { DomainValidationError } from "../modules/shared/domain/errors.ts";
import { EmailAddress, EntityId, StableCode } from "../modules/shared/domain/value-objects.ts";

const ID = new EntityId("00000000-0000-4000-8000-000000000001");
const OTHER_ID = new EntityId("00000000-0000-4000-8000-000000000002");
const NOW = new Date("2026-08-23T00:00:00.000Z");

test("value objects normalise emails and stable codes", () => {
  assert.equal(new EmailAddress(" Owner@Example.COM ").value, "owner@example.com");
  assert.equal(new StableCode("growth_engine").value, "growth_engine");
  assert.throws(() => new StableCode("Growth Engine"), DomainValidationError);
});

test("customer aggregate enforces lifecycle transitions", () => {
  const customer = Customer.create({
    id: ID,
    externalReference: "customer-001",
    businessName: "Example Plumbing Pty Ltd",
    contactName: "Casey Example",
    email: new EmailAddress("casey@example.invalid"),
    phone: null,
    industry: "Plumbing",
    websiteUrl: null,
    status: "PROSPECT",
    creationSource: "ADMIN",
    createdAt: NOW,
    updatedAt: NOW,
  });
  customer.transitionTo("ACTIVE", new Date(NOW.getTime() + 1));
  assert.equal(customer.snapshot.status, "ACTIVE");
  assert.throws(() => customer.transitionTo("PROSPECT", new Date(NOW.getTime() + 2)), {
    code: "INVALID_CUSTOMER_TRANSITION",
  });
});

test("invitation and plan feature invariants reject contradictory state", () => {
  assert.throws(() => createCustomerInvitation({
    id: ID,
    customerId: null,
    email: new EmailAddress("invitee@example.invalid"),
    tokenHash: "hash",
    status: "ACCEPTED",
    invitedBy: "admin-1",
    expiresAt: new Date(NOW.getTime() + 1_000),
    acceptedAt: null,
    createdAt: NOW,
  }), { code: "MISSING_ACCEPTED_AT" });

  assert.throws(() => createPlanFeature({
    id: ID,
    planId: ID,
    offeringId: OTHER_ID,
    included: false,
    limitValue: 4,
    limitUnit: "posts_per_month",
    configuration: null,
    createdAt: NOW,
    updatedAt: NOW,
  }), { code: "EXCLUDED_FEATURE_HAS_LIMIT" });
});
