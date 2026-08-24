import { dataResponse } from "./api-http";

export function GET() { return dataResponse({ version: "v1", documentation: "/api/v1/openapi.json", surfaces: { public: "/api/v1/public", customer: "/api/v1/customer", admin: "/api/v1/admin", agentIntegration: "/api/v1/integrations/agent" } }); }
