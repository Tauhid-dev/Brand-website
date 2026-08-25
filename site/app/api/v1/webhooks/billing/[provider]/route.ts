import { ReconcileBillingEventService } from "@/modules/billing/application/billing-event-reconciliation-service";
import { ProcessBillingWebhookService } from "@/modules/billing/application/billing-webhook-service";
import { D1BillingRepository } from "@/modules/billing/infrastructure/d1-billing-repository";
import { D1BillingWebhookRepository } from "@/modules/billing/infrastructure/d1-billing-webhook-repository";
import { D1BillingProviderReferenceRepository } from "@/modules/billing/infrastructure/d1-billing-provider-reference-repository";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { AUDIT_ACTIONS } from "@/modules/audit/domain/audit-event";
import { AuthenticationRequiredError } from "@/modules/shared/domain/errors";
import { apiRoute, dataResponse, readBoundedText } from "../../../api-http";
import { actorAudit, createApiRuntime } from "../../../api-runtime";
import { configuredBillingWebhookVerifier } from "../../../billing-webhook-runtime";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const provider = (await params).provider.trim().toLowerCase();
    const verifier = await configuredBillingWebhookVerifier(provider);
    const rawBody = await readBoundedText(request, 262_144);
    const runtime = await createApiRuntime(request, requestId);
    const audit = actorAudit(runtime, { type: "SYSTEM", id: `billing-webhook:${provider}` });
    const service = new ProcessBillingWebhookService(verifier, new D1BillingWebhookRepository(runtime.db), new ReconcileBillingEventService(new D1SubscriptionRepository(runtime.db), new D1BillingRepository(runtime.db), runtime.ids, runtime.clock, audit, new D1BillingProviderReferenceRepository(runtime.db)), runtime.ids, runtime.clock, audit);
    try {
      const result = await service.execute(rawBody, request.headers, requestId);
      return dataResponse({ received: true, duplicate: result.duplicate, status: result.status }, result.duplicate ? 200 : 202, { "cache-control": "no-store" });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) await runtime.anonymousAudit.record({ action: AUDIT_ACTIONS.billingWebhookFailed, entityType: "BILLING_WEBHOOK_PROVIDER", entityId: provider, after: { failureCode: "INVALID_WEBHOOK_SIGNATURE" } });
      throw error;
    }
  });
}
