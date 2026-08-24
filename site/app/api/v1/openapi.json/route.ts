import { openApiDocument } from "../openapi-document";

export function GET() { return Response.json(openApiDocument, { headers: { "cache-control": "public, max-age=300" } }); }
