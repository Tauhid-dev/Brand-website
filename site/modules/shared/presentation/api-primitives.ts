import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  DomainConflictError,
  DomainValidationError,
} from "../domain/errors.ts";
export { RequestContextFactory } from "../application/request-context.ts";
export type { RequestActor, RequestContext } from "../application/request-context.ts";

export type ApiProblem = {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      requestId: string;
    };
  };
};

export function mapApplicationError(error: unknown, requestId: string): ApiProblem {
  if (error instanceof AuthenticationRequiredError) {
    return problem(401, error.code, error.message, requestId);
  }
  if (error instanceof AuthorizationDeniedError) {
    return problem(403, error.code, error.message, requestId);
  }
  if (error instanceof DomainValidationError) {
    return problem(400, error.code, error.message, requestId);
  }
  if (error instanceof DomainConflictError) {
    const status = error.code.endsWith("_NOT_FOUND") ? 404 : 409;
    return problem(status, error.code, error.message, requestId);
  }
  return problem(500, "INTERNAL_ERROR", "An unexpected error occurred.", requestId);
}

function problem(status: number, code: string, message: string, requestId: string): ApiProblem {
  return { status, body: { error: { code, message, requestId } } };
}
