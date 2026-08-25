import { RunAgentProvisioningService } from "@/modules/agent/application/agent-provisioning-services";
import { D1AgentProvisioningRepository } from "@/modules/agent/infrastructure/d1-agent-provisioning-repository";
import { configuredAgentProvisioner } from "@/modules/agent/infrastructure/http-agent-platform-provisioner";
import { apiRoute, dataResponse } from "../../../../api-http";
import { authenticateService, createApiRuntime } from "../../../../api-runtime";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const runtime = await createApiRuntime(request, requestId);
    const { audit } = await authenticateService(runtime, request, "agent-link:write");
    const job = await new RunAgentProvisioningService(new D1AgentProvisioningRepository(runtime.db), await configuredAgentProvisioner(), runtime.ids, runtime.clock, audit).execute();
    if (!job) return dataResponse({ processed: false });
    const p = job.props;
    return dataResponse({ processed: true, job: { id: p.id.value, customerId: p.customerId.value, agentLinkId: p.agentLinkId.value, operation: p.operation, status: p.status, attemptCount: p.attemptCount, requestedAt: p.requestedAt } });
  });
}
