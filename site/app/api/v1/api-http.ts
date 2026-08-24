import { mapApplicationError } from "../../../modules/shared/presentation/api-primitives.ts";
import type { CursorPosition } from "../../../modules/api/application/read-ports.ts";
import { IdempotencyService, sha256 } from "../../../modules/api/application/api-security-services.ts";
import type { ApiSecurityRepository } from "../../../modules/api/application/ports.ts";
import type { Clock, IdGenerator } from "../../../modules/shared/application/ports.ts";
import { AuthorizationDeniedError, DomainValidationError, PayloadTooLargeError } from "../../../modules/shared/domain/errors.ts";

export type ApiRequestContext = { requestId: string; request: Request };

export async function apiRoute(request: Request, handler: (context: ApiRequestContext) => Promise<Response>) {
  const requestId = crypto.randomUUID();
  try { enforceSameOriginWrite(request); const response = await handler({ requestId, request }); response.headers.set("x-request-id", requestId); return response; }
  catch (error) { return applicationErrorResponse(error, requestId); }
}

export function dataResponse(data: unknown, status = 200, headers?: HeadersInit) { return Response.json({ data }, { status, headers }); }
export function pageResponse(items: unknown[], next: CursorPosition | null) { return Response.json({ data: items, pagination: { nextCursor: next ? encodeCursor(next) : null, hasMore: next != null } }); }

export async function jsonObject(request: Request) {
  let value: unknown;
  try { value = JSON.parse(await readBoundedText(request)); } catch (error) { if (error instanceof PayloadTooLargeError) throw error; throw new DomainValidationError("INVALID_JSON", "Request body must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainValidationError("INVALID_JSON_OBJECT", "Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

export async function readBoundedText(request: Request, maxBytes = 32_768): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new PayloadTooLargeError();
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new PayloadTooLargeError();
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function idempotentResponse(input: { request: Request; requestId: string; scope: string; body: unknown; repository: ApiSecurityRepository; ids: IdGenerator; clock: Clock; execute: () => Promise<Response> }) {
  const service = new IdempotencyService(input.repository, input.ids, input.clock);
  const begun = await service.begin({ scope: input.scope, key: input.request.headers.get("idempotency-key") ?? "", requestHash: await sha256(canonicalJson(input.body)) });
  if (begun.kind === "REPLAY") return Response.json(begun.body, { status: begun.status, headers: { "x-idempotent-replay": "true" } });
  let response: Response;
  try {
    response = await input.execute();
  } catch (error) {
    response = applicationErrorResponse(error, input.requestId);
    if (response.status >= 500) await service.release(begun.id);
    else await service.complete(begun.id, response.status, await response.clone().json());
    return response;
  }
  if (response.status >= 500) await service.release(begun.id);
  else await service.complete(begun.id, response.status, await response.clone().json());
  return response;
}

export function paginationFrom(url: URL) { return { cursor: decodeCursor(url.searchParams.get("cursor")), limit: parseLimit(url.searchParams.get("limit")) }; }
export function optionalBoolean(value: string | null) { if (value == null || value === "") return undefined; if (value === "true") return true; if (value === "false") return false; throw new DomainValidationError("INVALID_BOOLEAN_FILTER", "Boolean filter must be true or false."); }
export function oneOfFilter<T extends string>(value: string | null, allowed: readonly T[], name: string): T | undefined { if (value == null || value === "") return undefined; if (!allowed.includes(value as T)) throw new DomainValidationError("INVALID_FILTER", `${name} filter is invalid.`); return value as T; }
export function requiredString(body: Record<string, unknown>, key: string, max = 255) { if (typeof body[key] !== "string") throw new DomainValidationError("INVALID_FIELD", `${key} must be a string.`); const value = body[key].trim(); if (!value || value.length > max) throw new DomainValidationError("INVALID_FIELD", `${key} is required and must be at most ${max} characters.`); return value; }
export function optionalString(body: Record<string, unknown>, key: string, max = 255) { if (body[key] == null || body[key] === "") return null; return requiredString(body, key, max); }
export function requiredInteger(body: Record<string, unknown>, key: string) { const value = body[key]; if (!Number.isSafeInteger(value)) throw new DomainValidationError("INVALID_FIELD", `${key} must be an integer.`); return value as number; }
export function optionalInteger(body: Record<string, unknown>, key: string) { if (body[key] == null) return null; return requiredInteger(body, key); }
export function optionalBooleanField(body: Record<string, unknown>, key: string, fallback: boolean) { if (body[key] == null) return fallback; if (typeof body[key] !== "boolean") throw new DomainValidationError("INVALID_FIELD", `${key} must be a boolean.`); return body[key]; }
export function requiredDate(body: Record<string, unknown>, key: string) { const date = new Date(requiredString(body, key)); if (!Number.isFinite(date.getTime())) throw new DomainValidationError("INVALID_FIELD", `${key} must be an ISO date-time.`); return date; }
export function optionalDate(body: Record<string, unknown>, key: string) { if (body[key] == null || body[key] === "") return null; return requiredDate(body, key); }

export function encodeCursor(value: CursorPosition) { return Buffer.from(JSON.stringify({ v: 1, createdAt: value.createdAt.toISOString(), id: value.id })).toString("base64url"); }
export function decodeCursor(value: string | null): CursorPosition | null { if (!value) return null; try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); const createdAt = new Date(parsed.createdAt); if (parsed.v !== 1 || typeof parsed.id !== "string" || !Number.isFinite(createdAt.getTime())) throw new Error(); return { createdAt, id: parsed.id }; } catch { throw new DomainValidationError("INVALID_CURSOR", "Pagination cursor is invalid."); } }
function parseLimit(value: string | null) { const parsed = value == null ? 25 : Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) throw new DomainValidationError("INVALID_PAGE_LIMIT", "limit must be from 1 to 100."); return parsed; }
function canonicalJson(value: unknown): string { if (value == null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; }
function applicationErrorResponse(error: unknown, requestId: string) { const problem = mapApplicationError(error, requestId); return Response.json(problem.body, { status: problem.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } }); }
function enforceSameOriginWrite(request: Request) { if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new AuthorizationDeniedError("CROSS_ORIGIN_WRITE_DENIED", "Cross-origin writes are not allowed."); } }
