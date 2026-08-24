const sessionSecurity = [{ ChatGPTSession: [] }];
const serviceSecurity = (scopes: string[]) => [{ ServiceBearer: scopes }];
const idempotency = { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 255 } };
const pagination = [
  { name: "cursor", in: "query", schema: { type: "string" } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
];
const response = (description: string) => ({ description, content: { "application/json": { schema: { type: "object" } } } });
const body = (required: string[] = []) => ({ required: true, content: { "application/json": { schema: { type: "object", required } } } });
const adminCollection = (name: string, paginated = false) => ({
  get: { tags: ["Admin"], security: sessionSecurity, summary: `List ${name}`, parameters: paginated ? pagination : [], responses: { "200": response(`${name} collection`) } },
  post: { tags: ["Admin"], security: sessionSecurity, summary: `Create ${name}`, parameters: [idempotency], requestBody: body(), responses: { "201": response(`Created ${name}`), "409": response("Conflict") } },
});
const serviceGet = (summary: string, scopes: string[]) => ({
  get: { tags: ["Agent integration"], security: serviceSecurity(scopes), summary, responses: { "200": response("Purpose-specific DTO"), "401": response("Invalid credential"), "403": response("Missing scope"), "429": response("Rate limited") } },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Zuno Pixel API",
    version: "1.0.0",
    description: "Purpose-specific public, customer, administration, agent-integration and configured billing-webhook contracts. Money uses integer minor units and timestamps use ISO 8601.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [{ name: "Public" }, { name: "Customer" }, { name: "Admin" }, { name: "Agent integration" }, { name: "Billing webhooks" }],
  components: {
    securitySchemes: {
      ChatGPTSession: { type: "apiKey", in: "cookie", name: "dispatch-owned-siwc", description: "Dispatch-owned Sign in with ChatGPT session." },
      ServiceBearer: { type: "http", scheme: "bearer", bearerFormat: "credential-id.secret" },
      StripeSignature: { type: "apiKey", in: "header", name: "Stripe-Signature", description: "Stripe timestamped HMAC signature over the unmodified request body." },
    },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message", "requestId"], properties: { code: { type: "string" }, message: { type: "string" }, requestId: { type: "string", format: "uuid" } } } } },
      CursorPage: { type: "object", required: ["data", "pagination"], properties: { data: { type: "array", items: {} }, pagination: { type: "object", required: ["nextCursor", "hasMore"], properties: { nextCursor: { type: ["string", "null"] }, hasMore: { type: "boolean" } } } } },
    },
  },
  paths: {
    "/public/plans": { get: { tags: ["Public"], summary: "List current public plans", responses: { "200": response("Public plans") } } },
    "/public/plans/{planCode}": { get: { tags: ["Public"], summary: "Get one current public plan", responses: { "200": response("Public plan"), "404": response("Not found") } } },
    "/public/promotion-codes/validate": { post: { tags: ["Public"], summary: "Validate a promotion code without redeeming it", requestBody: body(["code", "customerId", "planId"]), responses: { "200": response("Eligibility result"), "409": response("Ineligible") } } },
    "/customer/account": { get: { tags: ["Customer"], security: sessionSecurity, summary: "Get the signed-in customer account, billing overview, invoice history and payment state", responses: { "200": response("Customer account"), "401": response("Authentication required"), "403": response("Forbidden") } } },
    "/customer/entitlements": { get: { tags: ["Customer"], security: sessionSecurity, summary: "Get signed-in customer entitlements", responses: { "200": response("Entitlements") } } },
    "/customer/notification-preferences": { patch: { tags: ["Customer"], security: sessionSecurity, summary: "Update a notification preference", requestBody: body(["code", "channel", "status"]), responses: { "200": response("Updated") } } },
    "/admin/customers": adminCollection("customers", true),
    "/admin/customers/{customerId}": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get administration customer detail", responses: { "200": response("Customer detail"), "404": response("Not found") } } },
    "/admin/customers/{customerId}/pricing": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get customer pricing context", responses: { "200": response("Pricing context") } } },
    "/admin/customers/{customerId}/billing": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get the commercial billing, payment and entitlement overview", responses: { "200": response("Billing overview"), "404": response("Not found") } } },
    "/admin/customers/{customerId}/billing-profile": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Create or update the billing contact", parameters: [idempotency], requestBody: body(["contactName", "contactEmail"]), responses: { "200": response("Billing profile") } } },
    "/admin/customers/{customerId}/billing-notes": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Append an immutable internal billing note", parameters: [idempotency], requestBody: body(["body"]), responses: { "201": response("Billing note") } } },
    "/admin/customers/{customerId}/pricing/preview": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Preview effective pricing without persistence", requestBody: body(["planId", "billingInterval"]), responses: { "200": response("Pricing preview") } } },
    "/admin/customers/{customerId}/price-overrides": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Create an effective-dated price override", parameters: [idempotency], requestBody: body(["planId", "billingInterval", "amountMinor", "setupFeeMinor", "currency", "effectiveFrom", "reason"]), responses: { "201": response("Created override") } } },
    "/admin/customers/{customerId}/discounts": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Apply a customer discount", parameters: [idempotency], requestBody: body(["discountId", "effectiveFrom", "reason"]), responses: { "201": response("Discount assignment") } } },
    "/admin/plans": adminCollection("plans"),
    "/admin/offerings": adminCollection("offerings"),
    "/admin/prices": adminCollection("prices"),
    "/admin/discounts": adminCollection("discounts", true),
    "/admin/promotion-codes": adminCollection("promotion codes", true),
    "/admin/subscriptions": adminCollection("subscriptions", true),
    "/admin/subscriptions/{subscriptionId}": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get a subscription", responses: { "200": response("Subscription") } }, patch: { tags: ["Admin"], security: sessionSecurity, summary: "Transition a subscription", parameters: [idempotency], requestBody: body(["status"]), responses: { "200": response("Updated subscription") } } },
    "/admin/subscriptions/{subscriptionId}/operations": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Run an explicit past-due, suspension, resumption, cancellation or temporary-extension operation", parameters: [idempotency], requestBody: body(["operation"]), responses: { "200": response("Updated subscription"), "409": response("Lifecycle conflict") } } },
    "/admin/audit-events": { get: { tags: ["Admin"], security: sessionSecurity, summary: "List immutable audit events", parameters: pagination, responses: { "200": response("Audit event page") } } },
    "/admin/service-credentials": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Issue a scoped credential; its raw token is returned once and never persisted", requestBody: body(["name", "scopes", "expiresAt"]), responses: { "201": response("Issued credential") } } },
    "/admin/service-credentials/{credentialId}/rotate": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Rotate a service credential; replacement token is returned once", requestBody: body(["expiresAt"]), responses: { "201": response("Replacement credential") } } },
    "/admin/service-credentials/{credentialId}": { delete: { tags: ["Admin"], security: sessionSecurity, summary: "Revoke a service credential", parameters: [idempotency], responses: { "200": response("Revoked") } } },
    "/integrations/agent/customers/{customerId}": serviceGet("Get purpose-specific customer profile", ["customer:read"]),
    "/integrations/agent/customers/{customerId}/entitlements": serviceGet("Validate subscription and get entitlements", ["subscription:validate", "entitlement:read"]),
    "/integrations/agent/customers/{customerId}/bootstrap": serviceGet("Build an agent bootstrap profile", ["customer:read", "subscription:validate", "entitlement:read"]),
    "/integrations/agent/customers/{customerId}/provisioning-jobs": { post: { tags: ["Agent integration"], security: serviceSecurity(["agent-link:write"]), summary: "Request agent provisioning", parameters: [idempotency], requestBody: body(["platform", "operation"]), responses: { "202": response("Provisioning job"), "429": response("Rate limited") } } },
    "/webhooks/billing/{provider}": { post: { tags: ["Billing webhooks"], security: [{ StripeSignature: [] }], summary: "Verify, deduplicate and reconcile a configured billing-provider event", parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["stripe"] } }], requestBody: body(), responses: { "200": response("Duplicate event acknowledged"), "202": response("Event accepted"), "400": response("Invalid event"), "401": response("Invalid signature"), "413": response("Payload too large"), "429": response("Retry not ready"), "503": response("Provider not configured") } } },
  },
} as const;
