import { systemHardeningServices } from "@/app/system-hardening-runtime";
import { apiRoute, assertAllowedFields, dataResponse, idempotentResponse, jsonObject } from "../../../api-http";
import { authenticateAdmin, createApiRuntime } from "../../../api-runtime";

export async function POST(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const body = await jsonObject(request);
    assertAllowedFields(body, []);
    const runtime = await createApiRuntime(request, requestId);
    const { principal, audit } = await authenticateAdmin(runtime, "OPERATIONS_WRITE");
    return idempotentResponse({
      request, requestId, scope: `admin:${principal.adminUserId}:system-maintenance`, body,
      repository: runtime.security, ids: runtime.ids, clock: runtime.clock,
      execute: async () => dataResponse(await systemHardeningServices(runtime, audit).maintenance.execute(principal.adminUserId), 200, { "cache-control": "private, no-store" }),
    });
  });
}
