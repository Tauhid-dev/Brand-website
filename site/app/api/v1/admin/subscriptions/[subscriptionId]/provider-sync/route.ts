import { configuredBillingProvider } from "@/app/api/v1/billing-provider-runtime";
import { SynchronizeProviderSubscriptionService, type ProviderSubscriptionOperation } from "@/modules/billing/application/billing-provider-services";
import { D1BillingProviderReferenceRepository } from "@/modules/billing/infrastructure/d1-billing-provider-reference-repository";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { assertAllowedFields, apiRoute, dataResponse, idempotentResponse, jsonObject, requiredString } from "../../../../api-http";
import { authenticateAdmin, createApiRuntime } from "../../../../api-runtime";
import { DomainValidationError } from "@/modules/shared/domain/errors";

const OPERATIONS = ["UPDATE", "SUSPEND", "RESUME", "CANCEL"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  return apiRoute(request, async ({ requestId }) => {
    const body = await jsonObject(request);
    assertAllowedFields(body, ["operation"]);
    const operation = requiredString(body, "operation", 20).toUpperCase() as ProviderSubscriptionOperation;
    if (!OPERATIONS.includes(operation)) throw new DomainValidationError("INVALID_PROVIDER_OPERATION", "Provider subscription operation is invalid.");
    const { subscriptionId } = await params;
    const runtime = await createApiRuntime(request, requestId);
    const { audit } = await authenticateAdmin(runtime, "BILLING_WRITE");
    return idempotentResponse({
      request, requestId, scope: `admin:subscription:${subscriptionId}:provider-sync`, body,
      repository: runtime.security, ids: runtime.ids, clock: runtime.clock,
      execute: async () => {
        const service = new SynchronizeProviderSubscriptionService(
          await configuredBillingProvider(), new D1BillingProviderReferenceRepository(runtime.db),
          new D1SubscriptionRepository(runtime.db), runtime.ids, runtime.clock, audit,
        );
        return dataResponse(await service.execute({ subscriptionId, operation, idempotencyKey: request.headers.get("idempotency-key") ?? "" }), 200, { "cache-control": "no-store" });
      },
    });
  });
}
