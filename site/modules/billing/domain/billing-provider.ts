import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";

export type BillingCheckoutStatus = "OPEN" | "COMPLETED" | "EXPIRED";

export class BillingProviderPriceReference {
  readonly props: Readonly<{
    id: EntityId; provider: string; subscriptionPriceId: EntityId;
    providerProductId: string; providerPriceId: string; createdAt: Date; updatedAt: Date;
  }>;

  constructor(input: BillingProviderPriceReference["props"]) {
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = Object.freeze({
      ...input,
      provider: requireText(input.provider, "billing provider", 80).toLowerCase(),
      providerProductId: requireText(input.providerProductId, "provider product ID", 255),
      providerPriceId: requireText(input.providerPriceId, "provider price ID", 255),
    });
  }
}

export class BillingCheckoutSession {
  readonly props: Readonly<{
    id: EntityId; customerId: EntityId; subscriptionId: EntityId; provider: string;
    providerSessionId: string; idempotencyKey: string; status: BillingCheckoutStatus;
    expiresAt: Date; completedAt: Date | null; createdAt: Date; updatedAt: Date;
  }>;

  constructor(input: BillingCheckoutSession["props"]) {
    if (!["OPEN", "COMPLETED", "EXPIRED"].includes(input.status)) throw new DomainValidationError("INVALID_CHECKOUT_STATUS", "Checkout status is invalid.");
    if (input.expiresAt <= input.createdAt || input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_CHECKOUT_TIMESTAMPS", "Checkout timestamps are invalid.");
    if ((input.status === "COMPLETED") !== (input.completedAt != null)) throw new DomainValidationError("INVALID_CHECKOUT_OUTCOME", "Checkout completion state is inconsistent.");
    this.props = Object.freeze({
      ...input,
      provider: requireText(input.provider, "billing provider", 80).toLowerCase(),
      providerSessionId: requireText(input.providerSessionId, "provider checkout session ID", 255),
      idempotencyKey: requireText(input.idempotencyKey, "idempotency key", 200),
    });
  }
}
