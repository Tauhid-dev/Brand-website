import type { BillingAccount, Invoice, PaymentReminder } from "../domain/billing.ts";

export interface BillingRepository {
  findAccount(customerId: string, provider: string): Promise<BillingAccount | null>;
  saveAccount(account: BillingAccount): Promise<void>;
  findInvoiceById(id: string): Promise<Invoice | null>;
  listInvoiceHistory(customerId: string, limit: number): Promise<Invoice[]>;
  saveInvoice(invoice: Invoice): Promise<void>;
  saveInvoiceTransition(invoice: Invoice): Promise<void>;
  findReminderByIdempotencyKey(key: string): Promise<PaymentReminder | null>;
  saveReminder(reminder: PaymentReminder): Promise<void>;
  saveReminderOutcome(reminder: PaymentReminder): Promise<void>;
}

export interface BillingProvider {
  createCustomer(input: { customerId: string; idempotencyKey: string }): Promise<{ providerCustomerId: string }>;
  createSubscription(input: { subscriptionId: string; customerId: string; planId: string; amountMinor: number; currency: string; idempotencyKey: string }): Promise<{ providerSubscriptionId: string }>;
  updateSubscription(input: { subscriptionId: string; amountMinor: number; currency: string; idempotencyKey: string }): Promise<void>;
  suspendSubscription(input: { subscriptionId: string; idempotencyKey: string }): Promise<void>;
  resumeSubscription(input: { subscriptionId: string; idempotencyKey: string }): Promise<void>;
  cancelSubscription(input: { subscriptionId: string; idempotencyKey: string }): Promise<void>;
}
