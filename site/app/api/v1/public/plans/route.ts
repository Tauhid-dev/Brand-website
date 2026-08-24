import { apiRoute, dataResponse } from "../../api-http";
import { createApiRuntime } from "../../api-runtime";

export async function GET(request: Request) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); return dataResponse(await runtime.read.listPublicPlans(runtime.clock.now()), 200, { "cache-control": "public, max-age=300" }); }); }
