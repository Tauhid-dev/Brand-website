import { apiRoute, assertAllowedFields, jsonObject, optionalString, requiredString } from "../v1/api-http";
import { createApiRuntime, enforcePublicRateLimit } from "../v1/api-runtime";
import { SubmitWebsiteLeadService, type WebsiteLeadSubmission } from "../../../modules/lead/application/website-lead-delivery";
import { configuredWebsiteLeadDelivery } from "../../../modules/lead/infrastructure/http-website-lead-delivery";
import { SystemClock } from "../../../modules/shared/application/ports";
import { DomainValidationError } from "../../../modules/shared/domain/errors";
import { EmailAddress } from "../../../modules/shared/domain/value-objects";

const required = ["contactName", "businessName", "industry", "location", "email", "phone", "challenge", "privacyConsent"] as const;
const allowed = [...required, "source", "websiteUrl", "googleProfileUrl", "websiteStatus", "googleStatus", "interestAreas", "contactMethod", "consultationTime", "marketingConsent", "companyFax"] as const;

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const runtime = await createApiRuntime(request, requestId);
    await enforcePublicRateLimit(runtime, request, "public:growth-audit", 5);
    const body = await jsonObject(request);
    if (body.companyFax) return Response.json({ ok: true });
    assertAllowedFields(body, allowed);
    const submission = leadSubmission(body);
    const result = await new SubmitWebsiteLeadService(await configuredWebsiteLeadDelivery(), new SystemClock()).execute(submission, requestId);
    return Response.json({ ok: true, delivered: true, acceptedAt: result.acceptedAt }, { status: 202 });
  });
}

function leadSubmission(body: Record<string, unknown>): WebsiteLeadSubmission {
  const source = requiredString(body, "source", 40);
  if (source !== "website_growth_audit" && source !== "website_contact") throw new DomainValidationError("INVALID_LEAD_SOURCE", "Lead source is invalid.");
  if (body.privacyConsent !== "accepted") throw new DomainValidationError("PRIVACY_CONSENT_REQUIRED", "Privacy consent is required.");
  const interestArea = optionalString(body, "interestAreas", 100);
  return {
    source,
    contactName: requiredString(body, "contactName", 120),
    businessName: requiredString(body, "businessName", 160),
    industry: requiredString(body, "industry", 100),
    location: requiredString(body, "location", 160),
    email: new EmailAddress(requiredString(body, "email", 254)).value,
    phone: requiredString(body, "phone", 40),
    challenge: requiredString(body, "challenge", 2_000),
    websiteUrl: optionalString(body, "websiteUrl", 500),
    googleProfileUrl: optionalString(body, "googleProfileUrl", 500),
    websiteStatus: optionalString(body, "websiteStatus", 100),
    googleStatus: optionalString(body, "googleStatus", 100),
    interestAreas: interestArea ? [interestArea] : [],
    contactMethod: optionalString(body, "contactMethod", 40),
    consultationTime: optionalString(body, "consultationTime", 40),
    privacyConsent: true,
    marketingConsent: body.marketingConsent === "accepted",
  };
}
