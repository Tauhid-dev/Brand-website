import { StripeBillingProvider } from "@/modules/billing/infrastructure/stripe-billing-provider";
import { ServiceUnavailableError } from "@/modules/shared/domain/errors";
import { runtimeEnv } from "@/db/runtime-env";

export async function configuredBillingProvider() {
  const env = await runtimeEnv();
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new ServiceUnavailableError("BILLING_PROVIDER_NOT_CONFIGURED", "Outbound billing is not configured.");
  if (secret.startsWith("sk_live_") && env.STRIPE_LIVE_ENABLED?.trim().toLowerCase() !== "true") {
    throw new ServiceUnavailableError("LIVE_BILLING_NOT_ENABLED", "Live billing execution requires explicit runtime approval.");
  }
  return new StripeBillingProvider(secret);
}
