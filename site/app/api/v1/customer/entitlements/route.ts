import { EntitlementService } from "@/modules/subscription/application/subscription-services";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { apiRoute, dataResponse } from "../../api-http";
import { authenticateCustomer, createApiRuntime } from "../../api-runtime";

export async function GET(request: Request) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); const { principal } = await authenticateCustomer(runtime); return dataResponse(await new EntitlementService(new D1SubscriptionRepository(runtime.db), runtime.clock).getEntitlements(principal.customerId), 200, { "cache-control": "private, no-store" }); }); }
