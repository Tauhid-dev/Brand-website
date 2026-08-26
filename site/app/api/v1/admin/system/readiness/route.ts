import { systemHardeningServices } from "@/app/system-hardening-runtime";
import { apiRoute, dataResponse } from "../../../api-http";
import { authenticateAdmin, createApiRuntime } from "../../../api-runtime";

export async function GET(request: Request) {
  return apiRoute(request, async ({ requestId }) => {
    const runtime = await createApiRuntime(request, requestId);
    const { audit } = await authenticateAdmin(runtime, "OPERATIONS_READ");
    return dataResponse(await systemHardeningServices(runtime, audit).readiness.execute(), 200, { "cache-control": "private, no-store" });
  });
}
