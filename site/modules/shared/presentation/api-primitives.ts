import type { Clock, IdGenerator } from "../application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../domain/errors.ts";

export type RequestActor =
  | { type: "ANONYMOUS" }
  | { type: "CUSTOMER" | "ADMIN" | "SERVICE" | "SYSTEM"; id: string };

export type RequestContext = {
  requestId: string;
  occurredAt: Date;
  actor: RequestActor;
  idempotencyKey: string | null;
};

export class RequestContextFactory {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  create(input: { actor?: RequestActor; idempotencyKey?: string | null } = {}): RequestContext {
    return {
      requestId: this.ids.next(),
      occurredAt: this.clock.now(),
      actor: input.actor ?? { type: "ANONYMOUS" },
      idempotencyKey: input.idempotencyKey?.trim() || null,
    };
  }
}

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
