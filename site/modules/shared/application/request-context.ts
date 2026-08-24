import type { Clock, IdGenerator } from "./ports.ts";

export type RequestActor =
  | { type: "ANONYMOUS" }
  | { type: "CUSTOMER" | "ADMIN" | "SERVICE" | "SYSTEM"; id: string };

export type RequestContext = {
  requestId: string;
  occurredAt: Date;
  actor: RequestActor;
  idempotencyKey: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export class RequestContextFactory {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  create(input: {
    actor?: RequestActor;
    idempotencyKey?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {}): RequestContext {
    return {
      requestId: this.ids.next(),
      occurredAt: this.clock.now(),
      actor: input.actor ?? { type: "ANONYMOUS" },
      idempotencyKey: input.idempotencyKey?.trim() || null,
      ipAddress: input.ipAddress?.trim().slice(0, 64) || null,
      userAgent: input.userAgent?.trim().slice(0, 512) || null,
    };
  }
}
