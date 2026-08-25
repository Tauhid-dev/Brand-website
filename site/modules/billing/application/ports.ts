import type { BillingAccount, BillingNote, CustomerBillingProfile, Invoice, PaymentReminder } from "../domain/billing.ts";
import type { BillingCheckoutSession, BillingProviderPriceReference } from "../domain/billing-provider.ts";

export interface BillingRepository {
  findAccount(customerId: string, provider: string): Promise<BillingAccount | null>;
  findAccountByProviderReference(provider: string, providerCustomerId: string): Promise<BillingAccount | null>;
  saveAccount(account: BillingAccount): Promise<void>;
  findCustomerProfile(customerId: string): Promise<CustomerBillingProfile | null>;
  saveCustomerProfile(profile: CustomerBillingProfile): Promise<void>;
  saveBillingNote(note: BillingNote): Promise<void>;
  listBillingNotes(customerId: string, limit: number): Promise<BillingNote[]>;
  findInvoiceById(id: string): Promise<Invoice | null>;
  findInvoiceByProviderReference(providerInvoiceId: string): Promise<Invoice | null>;
  listInvoiceHistory(customerId: string, limit: number): Promise<Invoice[]>;
  saveInvoice(invoice: Invoice): Promise<void>;
  saveInvoiceTransition(invoice: Invoice): Promise<void>;
  findReminderByIdempotencyKey(key: string): Promise<PaymentReminder | null>;
  saveReminder(reminder: PaymentReminder): Promise<void>;
  saveReminderOutcome(reminder: PaymentReminder): Promise<void>;
}

export interface BillingProvider {
  readonly code: string;
  createCustomer(input: { customerId: string; email: string | null; name: string | null; currency: string; idempotencyKey: string }): Promise<{ providerCustomerId: string }>;
  createPrice(input: { subscriptionPriceId: string; planId: string; label: string; amountMinor: number; currency: string; interval: "MONTHLY" | "ANNUAL"; idempotencyKey: string }): Promise<{ providerProductId: string; providerPriceId: string }>;
  createCheckoutSession(input: { subscriptionId: string; providerCustomerId: string; providerPriceId: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ providerSessionId: string; checkoutUrl: string; expiresAt: Date }>;
  updateSubscription(input: { providerSubscriptionId: string; providerPriceId: string; idempotencyKey: string }): Promise<void>;
  suspendSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }): Promise<void>;
  resumeSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }): Promise<void>;
  cancelSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }): Promise<void>;
}

export interface BillingProviderReferenceRepository {
  findPrice(provider: string, subscriptionPriceId: string): Promise<BillingProviderPriceReference | null>;
  savePrice(reference: BillingProviderPriceReference): Promise<void>;
  findCheckoutByIdempotencyKey(customerId: string, idempotencyKey: string): Promise<BillingCheckoutSession | null>;
  saveCheckout(session: BillingCheckoutSession): Promise<void>;
  completeCheckout(provider: string, providerSessionId: string, at: Date): Promise<void>;
}
