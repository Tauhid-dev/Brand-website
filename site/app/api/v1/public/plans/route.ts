import { apiRoute, dataResponse } from "../../api-http";
import { createApiRuntime, enforcePublicRateLimit } from "../../api-runtime";

export async function GET(request: Request) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); await enforcePublicRateLimit(runtime, request, "public:plans", 120); return dataResponse(await runtime.read.listPublicPlans(runtime.clock.now()), 200, { "cache-control": "public, max-age=300" }); }); }
