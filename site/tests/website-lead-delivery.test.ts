import assert from "node:assert/strict";
import test from "node:test";
import { SubmitWebsiteLeadService, type DeliverableWebsiteLead, type WebsiteLeadSubmission } from "../modules/lead/application/website-lead-delivery.ts";
import { HttpWebsiteLeadDelivery } from "../modules/lead/infrastructure/http-website-lead-delivery.ts";

const submission: WebsiteLeadSubmission = {
  source: "website_growth_audit",
  contactName: "Casey",
  businessName: "Example Plumbing",
  industry: "Trades",
  location: "Sydney",
  email: "casey@example.invalid",
  phone: "0400 000 000",
  challenge: "More qualified enquiries",
  websiteUrl: null,
  googleProfileUrl: null,
  websiteStatus: null,
  googleStatus: null,
  interestAreas: ["SEO and Google"],
  contactMethod: "Email",
  consultationTime: "Morning",
  privacyConsent: true,
  marketingConsent: false,
};

test("lead application service records consent time and delegates once with the request id", async () => {
  const recorded: { delivered: DeliverableWebsiteLead | null; key: string } = { delivered: null, key: "" };
  const service = new SubmitWebsiteLeadService({ deliver: async (input, idempotencyKey) => { recorded.delivered = input; recorded.key = idempotencyKey; } }, { now: () => new Date("2026-08-26T12:00:00.000Z") });
  const result = await service.execute(submission, "request-17");
  assert.equal(result.acceptedAt, "2026-08-26T12:00:00.000Z");
  assert.equal(recorded.delivered?.consentRecordedAt, result.acceptedAt);
  assert.equal(recorded.key, "request-17");
});

test("HTTPS lead adapter sends a bounded contract with auth and idempotency", async () => {
  const recorded: { request: { url: string; init?: RequestInit } | null } = { request: null };
  const adapter = new HttpWebsiteLeadDelivery("https://crm.example.invalid/leads", "runtime-token", async (url, init) => {
    recorded.request = { url: String(url), init };
    return new Response(null, { status: 202 });
  });
  await adapter.deliver({ ...submission, consentRecordedAt: "2026-08-26T12:00:00.000Z" }, "request-17");
  assert.equal(recorded.request?.url, "https://crm.example.invalid/leads");
  const headers = new Headers(recorded.request?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer runtime-token");
  assert.equal(headers.get("idempotency-key"), "request-17");
  assert.equal(JSON.parse(String(recorded.request?.init?.body)).email, "casey@example.invalid");
  assert.equal(recorded.request?.init?.redirect, "error");
});

test("lead adapter fails closed for unsafe configuration, rejection and network errors", async () => {
  assert.throws(() => new HttpWebsiteLeadDelivery("http://remote.example.invalid/leads", "token"), { code: "LEAD_DELIVERY_CONFIGURATION_INVALID" });
  assert.throws(() => new HttpWebsiteLeadDelivery("https://crm.example.invalid/leads", ""), { code: "LEAD_DELIVERY_CONFIGURATION_INVALID" });
  await assert.rejects(() => new HttpWebsiteLeadDelivery("https://crm.example.invalid/leads", "runtime-token", async () => new Response("private provider detail", { status: 500 })).deliver({ ...submission, consentRecordedAt: "2026-08-26T12:00:00.000Z" }, "request-17"), { code: "LEAD_DELIVERY_REJECTED", message: "Online enquiry delivery is temporarily unavailable." });
  await assert.rejects(() => new HttpWebsiteLeadDelivery("https://crm.example.invalid/leads", "runtime-token", async () => { throw new Error("runtime-token private network detail"); }).deliver({ ...submission, consentRecordedAt: "2026-08-26T12:00:00.000Z" }, "request-17"), { code: "LEAD_DELIVERY_UNAVAILABLE", message: "Online enquiry delivery is temporarily unavailable." });
});
