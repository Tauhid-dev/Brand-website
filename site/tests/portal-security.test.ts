import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("protected portal pages are dynamic and authenticate on the server", () => {
  const customer = read("../app/account/page.tsx");
  const admin = read("../app/admin/page.tsx");
  const sections = read("../app/admin/[section]/page.tsx");
  const operations = read("../app/admin/operations/page.tsx");
  assert.match(customer, /dynamic = "force-dynamic"/);
  assert.match(customer, /customerPortalSession\(/);
  assert.match(admin, /adminPortalSession\("\/admin", "CUSTOMER_READ"\)/);
  assert.match(sections, /permission: "AUDIT_READ"/);
  assert.match(sections, /permission: "ADMIN_USER_MANAGE"/);
  assert.match(operations, /adminPortalSession\("\/admin\/operations", "OPERATIONS_READ"\)/);
});

test("commercial mutations require confirmation and permission checks", () => {
  const actions = read("../app/portal-actions.ts");
  assert.match(actions, /requireConfirmation\(data\)/g);
  assert.match(actions, /"CUSTOMER_WRITE"/);
  assert.match(actions, /"SUBSCRIPTION_WRITE"/);
  assert.match(actions, /"BILLING_WRITE"/);
  assert.match(actions, /"OPERATIONS_WRITE"/);
  assert.match(actions, /subscriptionBillingOperationAction/);
  assert.match(actions, /updateBillingProfileAction/);
  assert.match(actions, /addBillingNoteAction/);
  assert.match(actions, /data\.get\("confirmed"\) !== "yes"/);
});

test("Phase 8 does not introduce the deferred versioned REST surface", () => {
  const actions = read("../app/portal-actions.ts");
  const server = read("../app/portal-server.ts");
  assert.equal(actions.includes("/api/v1"), false);
  assert.equal(server.includes("/api/v1"), false);
});
