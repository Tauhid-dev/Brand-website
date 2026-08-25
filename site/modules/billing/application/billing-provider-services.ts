import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { SubscriptionRepository } from "../../subscription/application/ports.ts";
import type { Subscription, SubscriptionPrice } from "../../subscription/domain/subscription.ts";
import { BillingAccount } from "../domain/billing.ts";
import { BillingCheckoutSession, BillingProviderPriceReference } from "../domain/billing-provider.ts";
import type { BillingProvider, BillingProviderReferenceRepository, BillingRepository } from "./ports.ts";

export class InitiateSubscriptionCheckoutService {
  constructor(
    private readonly provider: BillingProvider,
    private readonly billing: BillingRepository,
    private readonly references: BillingProviderReferenceRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: { customerId: string; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    const subscription = await this.subscriptions.findCurrentForCustomer(input.customerId);
    if (!subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "A current subscription is required for checkout.");
    if (subscription.props.externalSubscriptionId) throw new DomainConflictError("SUBSCRIPTION_ALREADY_LINKED", "Subscription is already connected to the billing provider.");
    if (await this.references.findCheckoutByIdempotencyKey(input.customerId, input.idempotencyKey)) throw new DomainConflictError("CHECKOUT_ALREADY_CREATED", "Checkout has already been created for this request.");

    const now = this.clock.now();
    const profile = await this.billing.findCustomerProfile(input.customerId);
    let account = await this.billing.findAccount(input.customerId, this.provider.code);
    if (!account) {
      const created = await this.provider.createCustomer({
        customerId: input.customerId, email: profile?.props.contactEmail.value ?? null,
        name: profile?.props.contactName ?? null, currency: subscription.props.currency,
        idempotencyKey: `${input.idempotencyKey}:customer`,
      });
      account = new BillingAccount({
        id: new EntityId(this.ids.next()), customerId: subscription.props.customerId,
        provider: this.provider.code, providerCustomerId: created.providerCustomerId,
        status: "ACTIVE", currency: subscription.props.currency, createdAt: now, updatedAt: now,
      });
      await this.billing.saveAccount(account);
      await this.audit.record({ action: AUDIT_ACTIONS.billingAccountLinked, entityType: "BILLING_ACCOUNT", entityId: account.props.id.value, after: account.props });
    }

    const price = await this.subscriptions.findPriceAt(subscription.props.id.value, now);
    if (!price) throw new DomainConflictError("SUBSCRIPTION_PRICE_NOT_FOUND", "Subscription has no effective contracted price.");
    const providerPrice = await new EnsureBillingProviderPriceService(this.provider, this.references, this.ids, this.clock, this.audit)
      .execute(subscription, price, `${input.idempotencyKey}:catalogue`);

    const created = await this.provider.createCheckoutSession({
      subscriptionId: subscription.props.id.value, providerCustomerId: account.props.providerCustomerId,
      providerPriceId: providerPrice.props.providerPriceId, successUrl: input.successUrl, cancelUrl: input.cancelUrl,
      idempotencyKey: `${input.idempotencyKey}:checkout`,
    });
    const checkout = new BillingCheckoutSession({
      id: new EntityId(this.ids.next()), customerId: subscription.props.customerId, subscriptionId: subscription.props.id,
      provider: this.provider.code, providerSessionId: created.providerSessionId, idempotencyKey: input.idempotencyKey,
      status: "OPEN", expiresAt: created.expiresAt, completedAt: null, createdAt: now, updatedAt: now,
    });
    await this.references.saveCheckout(checkout);
    await this.audit.record({ action: AUDIT_ACTIONS.billingCheckoutCreated, entityType: "BILLING_CHECKOUT_SESSION", entityId: checkout.props.id.value, after: { provider: checkout.props.provider, providerSessionId: checkout.props.providerSessionId, subscriptionId: checkout.props.subscriptionId.value, expiresAt: checkout.props.expiresAt } });
    return { checkoutUrl: created.checkoutUrl, expiresAt: created.expiresAt, provider: this.provider.code };
  }
}

export type ProviderSubscriptionOperation = "UPDATE" | "SUSPEND" | "RESUME" | "CANCEL";

export class SynchronizeProviderSubscriptionService {
  constructor(
    private readonly provider: BillingProvider,
    private readonly references: BillingProviderReferenceRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: { subscriptionId: string; operation: ProviderSubscriptionOperation; idempotencyKey: string }) {
    const subscription = await this.subscriptions.findById(input.subscriptionId);
    if (!subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Subscription does not exist.");
    if (subscription.props.externalBillingProvider !== this.provider.code || !subscription.props.externalSubscriptionId) throw new DomainConflictError("SUBSCRIPTION_PROVIDER_NOT_LINKED", "Subscription is not linked to the configured billing provider.");
    const providerSubscriptionId = subscription.props.externalSubscriptionId;
    if (input.operation === "UPDATE") {
      const price = await this.subscriptions.findPriceAt(subscription.props.id.value, this.clock.now());
      if (!price) throw new DomainConflictError("SUBSCRIPTION_PRICE_NOT_FOUND", "Subscription has no effective contracted price.");
      const reference = await new EnsureBillingProviderPriceService(this.provider, this.references, this.ids, this.clock, this.audit)
        .execute(subscription, price, `${input.idempotencyKey}:catalogue`);
      await this.provider.updateSubscription({ providerSubscriptionId, providerPriceId: reference.props.providerPriceId, idempotencyKey: input.idempotencyKey });
    } else if (input.operation === "SUSPEND") await this.provider.suspendSubscription({ providerSubscriptionId, idempotencyKey: input.idempotencyKey });
    else if (input.operation === "RESUME") await this.provider.resumeSubscription({ providerSubscriptionId, idempotencyKey: input.idempotencyKey });
    else await this.provider.cancelSubscription({ providerSubscriptionId, idempotencyKey: input.idempotencyKey });
    await this.audit.record({ action: AUDIT_ACTIONS.billingProviderSubscriptionSynchronized, entityType: "SUBSCRIPTION", entityId: subscription.props.id.value, after: { provider: this.provider.code, operation: input.operation, providerSubscriptionId } });
    return { provider: this.provider.code, operation: input.operation, synchronizedAt: this.clock.now() };
  }
}

class EnsureBillingProviderPriceService {
  constructor(
    private readonly provider: BillingProvider,
    private readonly references: BillingProviderReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(subscription: Subscription, price: SubscriptionPrice, idempotencyKey: string) {
    const existing = await this.references.findPrice(this.provider.code, price.props.id.value);
    if (existing) return existing;
    const created = await this.provider.createPrice({
      subscriptionPriceId: price.props.id.value, planId: subscription.props.planId.value,
      label: "Zuno Pixel subscription", amountMinor: price.props.effectiveAmount.amountMinor,
      currency: price.props.effectiveAmount.currency, interval: subscription.props.billingInterval, idempotencyKey,
    });
    const now = this.clock.now();
    const candidate = new BillingProviderPriceReference({
      id: new EntityId(this.ids.next()), provider: this.provider.code, subscriptionPriceId: price.props.id,
      providerProductId: created.providerProductId, providerPriceId: created.providerPriceId,
      createdAt: now, updatedAt: now,
    });
    await this.references.savePrice(candidate);
    const persisted = await this.references.findPrice(this.provider.code, price.props.id.value) ?? candidate;
    if (persisted.props.id.value === candidate.props.id.value) await this.audit.record({ action: AUDIT_ACTIONS.billingProviderPriceLinked, entityType: "BILLING_PROVIDER_PRICE_REFERENCE", entityId: persisted.props.id.value, after: persisted.props });
    return persisted;
  }
}
