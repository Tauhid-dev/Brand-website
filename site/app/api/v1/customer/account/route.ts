import { DomainConflictError } from "@/modules/shared/domain/errors";
import { apiRoute, dataResponse } from "../../api-http";
import { authenticateCustomer, createApiRuntime } from "../../api-runtime";

export async function GET(request: Request) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); const { principal } = await authenticateCustomer(runtime); const account = await runtime.portal.getCustomerAccount(principal.customerId); if (!account) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer account does not exist."); return dataResponse(account, 200, { "cache-control": "private, no-store" }); }); }
