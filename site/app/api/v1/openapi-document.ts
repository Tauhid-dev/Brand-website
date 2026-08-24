import { apiSchemas, schemaRef } from "./openapi-schemas.ts";

const sessionSecurity = [{ ChatGPTSession: [] }];
const serviceSecurity = (scopes: string[]) => [{ ServiceBearer: scopes }];
const idempotency = { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 255 } };
const pathId = (name: string) => ({ name, in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 80 } });
const pagination = [
  { name: "cursor", in: "query", schema: { type: "string", description: "Opaque cursor returned by the preceding page." } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "sort", in: "query", schema: { type: "string", enum: ["createdAt", "-createdAt"], default: "-createdAt" } },
];
const jsonBody = (schema: string) => ({ required: true, content: { "application/json": { schema: schemaRef(schema) } } });
const response = (description: string, schema: string) => ({ description, headers: { "x-request-id": { required: true, schema: { type: "string", format: "uuid" } } }, content: { "application/json": { schema: schemaRef(schema) } } });
const dataResponse = (description: string, schema: string) => response(description, `${schema}Response`);
const arrayDataResponse = (description: string, schema: string) => ({ description, headers: { "x-request-id": { required: true, schema: { type: "string", format: "uuid" } } }, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { type: "array", items: schemaRef(schema) } } } } } });
const errorResponse = (description: string) => response(description, "Error");
const standardErrors = { "400": errorResponse("Invalid request"), "401": errorResponse("Authentication required"), "403": errorResponse("Permission or scope denied"), "404": errorResponse("Resource not found"), "409": errorResponse("Domain or idempotency conflict"), "413": errorResponse("Request body too large"), "415": errorResponse("Content-Type must be application/json"), "429": errorResponse("Rate limit exceeded"), "500": errorResponse("Unexpected server error") };
const ok = (schema: string) => ({ "200": dataResponse("Successful response", schema), ...standardErrors });
const created = (schema: string) => ({ "201": dataResponse("Resource created", schema), ...standardErrors });
const accepted = (schema: string) => ({ "202": dataResponse("Request accepted", schema), ...standardErrors });
const adminList = (summary: string, pageSchema: string, filters: object[] = []) => ({ get: { tags: ["Admin"], security: sessionSecurity, summary, parameters: [...pagination, ...filters], responses: { "200": response("Cursor page", pageSchema), ...standardErrors } } });
const adminCreate = (summary: string, requestSchema: string, responseSchema: string) => ({ tags: ["Admin"], security: sessionSecurity, summary, parameters: [idempotency], requestBody: jsonBody(requestSchema), responses: created(responseSchema) });
const serviceGet = (summary: string, scopes: string[], schema: string) => ({ get: { tags: ["Agent integration"], security: serviceSecurity(scopes), summary, parameters: [pathId("customerId")], responses: ok(schema) } });

const responseSchemas = Object.fromEntries(["PublicPlan", "CustomerAccount", "Customer", "BillingOverview", "Plan", "Offering", "PlanPrice", "Discount", "PromotionCode", "Subscription", "AuditEvent", "OperationResult", "AgentCustomer", "AgentBootstrap", "ProvisioningJob", "PromotionValidation", "BillingProfile", "BillingNote", "PriceOverride", "CustomerDiscount", "ServiceCredentialIssue", "EntitlementValidation"].map((name) => [`${name}Response`, { type: "object", additionalProperties: false, required: ["data"], properties: { data: schemaRef(name) } }])) as Record<string, unknown>;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Zuno Pixel API",
    version: "1.0.0",
    description: "Stable v1 public, customer, administration, agent-integration and configured billing-webhook contracts. Additive changes are allowed; breaking changes require a new major namespace. Money uses integer minor units and timestamps use ISO 8601.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [{ name: "Public" }, { name: "Customer" }, { name: "Admin" }, { name: "Agent integration" }, { name: "Billing webhooks" }],
  components: {
    securitySchemes: {
      ChatGPTSession: { type: "apiKey", in: "cookie", name: "dispatch-owned-siwc", description: "Dispatch-owned Sign in with ChatGPT session." },
      ServiceBearer: { type: "http", scheme: "bearer", bearerFormat: "credential-id.secret" },
      StripeSignature: { type: "apiKey", in: "header", name: "Stripe-Signature", description: "Stripe timestamped HMAC signature over the unmodified request body." },
    },
    schemas: { ...apiSchemas, ...responseSchemas, EntitlementValidationResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { oneOf: [schemaRef("EntitlementValidation"), { type: "null" }] } } } },
  },
  paths: {
    "/public/plans": { get: { tags: ["Public"], summary: "List current public plans", responses: { "200": { ...dataResponse("Public plans", "PublicPlan"), content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { type: "array", items: schemaRef("PublicPlan") } } } } } }, ...standardErrors } } },
    "/public/plans/{planCode}": { get: { tags: ["Public"], summary: "Get one current public plan", parameters: [{ name: "planCode", in: "path", required: true, schema: { type: "string" } }], responses: ok("PublicPlan") } },
    "/public/promotion-codes/validate": { post: { tags: ["Public"], summary: "Validate a promotion code without redeeming it", requestBody: jsonBody("PromotionValidationRequest"), responses: { "200": dataResponse("Eligibility result", "PromotionValidation"), ...standardErrors } } },
    "/customer/account": { get: { tags: ["Customer"], security: sessionSecurity, summary: "Get the signed-in customer account and billing overview", responses: ok("CustomerAccount") } },
    "/customer/entitlements": { get: { tags: ["Customer"], security: sessionSecurity, summary: "Get signed-in customer entitlements", responses: ok("EntitlementValidation") } },
    "/customer/notification-preferences": { patch: { tags: ["Customer"], security: sessionSecurity, summary: "Update a notification preference", parameters: [idempotency], requestBody: jsonBody("NotificationPreferenceRequest"), responses: ok("OperationResult") } },
    "/admin/customers": { ...adminList("List customers", "CustomerPage", [{ name: "status", in: "query", schema: { type: "string", enum: ["PROSPECT", "ACTIVE", "SUSPENDED", "CANCELLED", "ARCHIVED"] } }, { name: "q", in: "query", schema: { type: "string", maxLength: 120 } }]), post: adminCreate("Create a customer", "CreateCustomerRequest", "Customer") },
    "/admin/customers/{customerId}": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get administration customer detail", parameters: [pathId("customerId")], responses: ok("CustomerAccount") } },
    "/admin/customers/{customerId}/pricing": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get customer pricing context", parameters: [pathId("customerId")], responses: ok("BillingOverview") } },
    "/admin/customers/{customerId}/billing": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get commercial billing, payment and entitlement overview", parameters: [pathId("customerId")], responses: ok("BillingOverview") } },
    "/admin/customers/{customerId}/billing-profile": { post: { ...adminCreate("Create or update the billing contact", "BillingProfileRequest", "BillingProfile"), parameters: [pathId("customerId"), idempotency] } },
    "/admin/customers/{customerId}/billing-notes": { post: { ...adminCreate("Append an immutable internal billing note", "BillingNoteRequest", "BillingNote"), parameters: [pathId("customerId"), idempotency] } },
    "/admin/customers/{customerId}/pricing/preview": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Preview effective pricing without persistence", parameters: [pathId("customerId")], requestBody: jsonBody("PricingPreviewRequest"), responses: ok("PlanPrice") } },
    "/admin/customers/{customerId}/price-overrides": { post: { ...adminCreate("Create an effective-dated price override", "PriceOverrideRequest", "PriceOverride"), parameters: [pathId("customerId"), idempotency] } },
    "/admin/customers/{customerId}/discounts": { post: { ...adminCreate("Apply a customer discount", "ApplyDiscountRequest", "CustomerDiscount"), parameters: [pathId("customerId"), idempotency] } },
    "/admin/plans": { get: { tags: ["Admin"], security: sessionSecurity, summary: "List plans", responses: { "200": arrayDataResponse("Plans", "Plan"), ...standardErrors } }, post: adminCreate("Create a plan", "CreatePlanRequest", "Plan") },
    "/admin/offerings": { get: { tags: ["Admin"], security: sessionSecurity, summary: "List offerings", responses: { "200": arrayDataResponse("Offerings", "Offering"), ...standardErrors } }, post: adminCreate("Create an offering", "CreateOfferingRequest", "Offering") },
    "/admin/prices": { get: { tags: ["Admin"], security: sessionSecurity, summary: "List plan prices", responses: { "200": arrayDataResponse("Prices", "PlanPrice"), ...standardErrors } }, post: adminCreate("Publish a plan price", "CreatePriceRequest", "PlanPrice") },
    "/admin/discounts": { ...adminList("List discounts", "DiscountPage", [{ name: "active", in: "query", schema: { type: "boolean" } }]), post: adminCreate("Create a discount", "CreateDiscountRequest", "Discount") },
    "/admin/promotion-codes": { ...adminList("List promotion codes", "PromotionCodePage", [{ name: "active", in: "query", schema: { type: "boolean" } }]), post: adminCreate("Create a promotion code", "CreatePromotionCodeRequest", "PromotionCode") },
    "/admin/subscriptions": { ...adminList("List subscriptions", "SubscriptionPage", [{ name: "status", in: "query", schema: { type: "string" } }, { name: "customerId", in: "query", schema: { type: "string" } }, { name: "planId", in: "query", schema: { type: "string" } }]), post: adminCreate("Create a subscription", "CreateSubscriptionRequest", "Subscription") },
    "/admin/subscriptions/{subscriptionId}": { get: { tags: ["Admin"], security: sessionSecurity, summary: "Get a subscription", parameters: [pathId("subscriptionId")], responses: ok("Subscription") }, patch: { tags: ["Admin"], security: sessionSecurity, summary: "Transition a subscription", parameters: [pathId("subscriptionId"), idempotency], requestBody: jsonBody("SubscriptionPatchRequest"), responses: ok("Subscription") } },
    "/admin/subscriptions/{subscriptionId}/operations": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Run an explicit subscription lifecycle operation", parameters: [pathId("subscriptionId"), idempotency], requestBody: jsonBody("SubscriptionOperationRequest"), responses: ok("Subscription") } },
    "/admin/invoices": adminList("List invoices", "InvoicePage", [{ name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"] } }, { name: "customerId", in: "query", schema: { type: "string" } }, { name: "subscriptionId", in: "query", schema: { type: "string" } }]),
    "/admin/notifications": adminList("List notification deliveries", "NotificationPage", [{ name: "status", in: "query", schema: { type: "string" } }, { name: "channel", in: "query", schema: { type: "string" } }, { name: "customerId", in: "query", schema: { type: "string" } }, { name: "code", in: "query", schema: { type: "string" } }]),
    "/admin/audit-events": adminList("List immutable audit events", "AuditEventPage", [{ name: "action", in: "query", schema: { type: "string" } }, { name: "entityType", in: "query", schema: { type: "string" } }]),
    "/admin/service-credentials": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Issue a scoped credential; its raw token is returned once", requestBody: jsonBody("ServiceCredentialRequest"), responses: created("ServiceCredentialIssue") } },
    "/admin/service-credentials/{credentialId}/rotate": { post: { tags: ["Admin"], security: sessionSecurity, summary: "Rotate a service credential; replacement token is returned once", parameters: [pathId("credentialId")], requestBody: jsonBody("RotateCredentialRequest"), responses: created("ServiceCredentialIssue") } },
    "/admin/service-credentials/{credentialId}": { delete: { tags: ["Admin"], security: sessionSecurity, summary: "Revoke a service credential", parameters: [pathId("credentialId"), idempotency], responses: ok("OperationResult") } },
    "/integrations/agent/customers/{customerId}": serviceGet("Get purpose-specific customer profile", ["customer:read"], "AgentCustomer"),
    "/integrations/agent/customers/{customerId}/entitlements": serviceGet("Validate subscription and get entitlements", ["subscription:validate", "entitlement:read"], "EntitlementValidation"),
    "/integrations/agent/customers/{customerId}/bootstrap": serviceGet("Build an agent bootstrap profile", ["customer:read", "subscription:validate", "entitlement:read"], "AgentBootstrap"),
    "/integrations/agent/customers/{customerId}/provisioning-jobs": { post: { tags: ["Agent integration"], security: serviceSecurity(["agent-link:write"]), summary: "Request agent provisioning", parameters: [pathId("customerId"), idempotency], requestBody: jsonBody("ProvisioningRequest"), responses: accepted("ProvisioningJob") } },
    "/webhooks/billing/{provider}": { post: { tags: ["Billing webhooks"], security: [{ StripeSignature: [] }], summary: "Verify, deduplicate and reconcile a configured billing-provider event", parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["stripe"] } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": dataResponse("Duplicate event acknowledged", "OperationResult"), "202": dataResponse("Event accepted", "OperationResult"), ...standardErrors, "503": errorResponse("Provider not configured") } } },
  },
} as const;
