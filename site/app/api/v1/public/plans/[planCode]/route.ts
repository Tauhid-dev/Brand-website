import { DomainConflictError } from "@/modules/shared/domain/errors";
import { apiRoute, dataResponse } from "../../../api-http";
import { createApiRuntime } from "../../../api-runtime";

export async function GET(request: Request, { params }: { params: Promise<{ planCode: string }> }) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); const plan = await runtime.read.getPublicPlan((await params).planCode, runtime.clock.now()); if (!plan) throw new DomainConflictError("PLAN_NOT_FOUND", "Public plan does not exist."); return dataResponse(plan, 200, { "cache-control": "public, max-age=300" }); }); }
