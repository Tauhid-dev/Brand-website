import { configuredBillingProvider } from "@/app/api/v1/billing-provider-runtime";
import { InitiateSubscriptionCheckoutService } from "@/modules/billing/application/billing-provider-services";
import { D1BillingProviderReferenceRepository } from "@/modules/billing/infrastructure/d1-billing-provider-reference-repository";
import { D1BillingRepository } from "@/modules/billing/infrastructure/d1-billing-repository";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { apiRoute, dataResponse, idempotentResponse, jsonObject, assertAllowedFields } from "../../../api-http";
import { actorAudit, authenticateCustomer, createApiRuntime } from "../../../api-runtime";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const body = await jsonObject(request);
    assertAllowedFields(body, []);
    const runtime = await createApiRuntime(request, requestId);
    const { principal } = await authenticateCustomer(runtime);
    return idempotentResponse({
      request, requestId, scope: `customer:${principal.customerId}:billing-checkout`, body,
      repository: runtime.security, ids: runtime.ids, clock: runtime.clock,
      execute: async () => {
        const provider = await configuredBillingProvider();
        const origin = new URL(request.url).origin;
        const service = new InitiateSubscriptionCheckoutService(
          provider, new D1BillingRepository(runtime.db), new D1BillingProviderReferenceRepository(runtime.db),
          new D1SubscriptionRepository(runtime.db), runtime.ids, runtime.clock,
          actorAudit(runtime, { type: "CUSTOMER", id: principal.customerId }),
        );
        const result = await service.execute({
          customerId: principal.customerId, successUrl: `${origin}/account?checkout=success`,
          cancelUrl: `${origin}/account?checkout=cancelled`, idempotencyKey: request.headers.get("idempotency-key") ?? "",
        });
        return dataResponse(result, 201, { "cache-control": "private, no-store" });
      },
    });
  });
}
