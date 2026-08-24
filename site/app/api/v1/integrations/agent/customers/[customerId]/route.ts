import { AgentIntegrationService } from "@/modules/agent/application/agent-integration-service";
import { D1AgentIntegrationRepository } from "@/modules/agent/infrastructure/d1-agent-integration-repository";
import { EntitlementService } from "@/modules/subscription/application/subscription-services";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { apiRoute, dataResponse } from "../../../../api-http";
import { authenticateService, createApiRuntime } from "../../../../api-runtime";

export async function GET(request: Request, { params }: { params: Promise<{ customerId: string }> }) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); await authenticateService(runtime, request, "customer:read"); const service = new AgentIntegrationService(new D1AgentIntegrationRepository(runtime.db), new EntitlementService(new D1SubscriptionRepository(runtime.db), runtime.clock)); return dataResponse(await service.getCustomer((await params).customerId), 200, { "cache-control": "private, no-store" }); }); }
