import { StripeWebhookVerifier } from "@/modules/billing/infrastructure/stripe-webhook-verifier";
import { DomainConflictError, ServiceUnavailableError } from "@/modules/shared/domain/errors";
import { runtimeEnv } from "@/db/runtime-env";

export async function configuredBillingWebhookVerifier(provider: string) {
  const code = provider.trim().toLowerCase();
  if (code !== "stripe") throw new DomainConflictError("BILLING_PROVIDER_NOT_FOUND", "Billing webhook provider is not supported.");
  const env = await runtimeEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new ServiceUnavailableError("BILLING_WEBHOOK_NOT_CONFIGURED", "Billing webhook provider is not configured.");
  return new StripeWebhookVerifier(secret);
}
