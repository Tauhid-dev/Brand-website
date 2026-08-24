import type { BillingWebhookEvent, NormalizedBillingEvent } from "../domain/billing-webhook.ts";

export interface BillingWebhookVerifier {
  verify(rawBody: string, headers: Headers, now: Date): Promise<{ event: NormalizedBillingEvent; payloadHash: string }>;
}

export type BillingWebhookClaim =
  | { kind: "PROCESS"; event: BillingWebhookEvent }
  | { kind: "DUPLICATE"; event: BillingWebhookEvent }
  | { kind: "RETRY_LATER"; event: BillingWebhookEvent };

export interface BillingWebhookRepository {
  claim(event: BillingWebhookEvent, now: Date): Promise<BillingWebhookClaim>;
  complete(id: string, status: "PROCESSED" | "IGNORED", at: Date): Promise<void>;
  fail(id: string, failureCode: string, nextAttemptAt: Date | null, at: Date): Promise<void>;
}

export interface BillingEventReconciler {
  reconcile(event: NormalizedBillingEvent): Promise<"PROCESSED" | "IGNORED">;
}
