import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    externalReference: text("external_reference").notNull(),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    industry: text("industry"),
    websiteUrl: text("website_url"),
    status: text("status").notNull(),
    creationSource: text("creation_source").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("customers_external_reference_uq").on(table.externalReference),
    uniqueIndex("customers_email_uq").on(table.email),
    index("customers_status_idx").on(table.status),
    index("customers_created_at_idx").on(table.createdAt),
    check("customers_status_check", sql`${table.status} in ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED')`),
    check("customers_creation_source_check", sql`${table.creationSource} in ('SELF_REGISTRATION', 'ADMIN', 'INVITATION', 'MIGRATION')`),
    check("customers_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const customerBusinessProfiles = sqliteTable(
  "customer_business_profiles",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    tradingName: text("trading_name"),
    abn: text("abn"),
    websiteUrl: text("website_url"),
    primaryEmail: text("primary_email").notNull(),
    primaryPhone: text("primary_phone"),
    industry: text("industry"),
    timezone: text("timezone").notNull().default("Australia/Sydney"),
    country: text("country").notNull().default("AU"),
    state: text("state"),
    suburb: text("suburb"),
    postcode: text("postcode"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_business_profiles_customer_uq").on(table.customerId),
    check("customer_business_profiles_country_check", sql`${table.country} = 'AU'`),
    check("customer_business_profiles_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const customerNotes = sqliteTable(
  "customer_notes",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorType: text("author_type").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("customer_notes_customer_created_idx").on(table.customerId, table.createdAt),
    check("customer_notes_author_type_check", sql`${table.authorType} in ('ADMIN', 'SYSTEM')`),
  ],
);

export const customerInvitations = sqliteTable(
  "customer_invitations",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_invitations_token_hash_uq").on(table.tokenHash),
    index("customer_invitations_email_status_idx").on(table.email, table.status),
    index("customer_invitations_customer_idx").on(table.customerId),
    check("customer_invitations_status_check", sql`${table.status} in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')`),
    check("customer_invitations_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("customer_invitations_acceptance_check", sql`(${table.status} = 'ACCEPTED' and ${table.acceptedAt} is not null) or (${table.status} <> 'ACCEPTED' and ${table.acceptedAt} is null)`),
  ],
);

export const customerIdentities = sqliteTable(
  "customer_identities",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalSubject: text("external_subject").notNull(),
    email: text("email").notNull(),
    acceptedInvitationId: text("accepted_invitation_id").references(() => customerInvitations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_identities_provider_subject_uq").on(table.provider, table.externalSubject),
    uniqueIndex("customer_identities_invitation_uq").on(table.acceptedInvitationId),
    index("customer_identities_customer_idx").on(table.customerId),
    index("customer_identities_email_idx").on(table.email),
  ],
);

export const offerings = sqliteTable(
  "offerings",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("offerings_code_uq").on(table.code),
    index("offerings_active_order_idx").on(table.active, table.displayOrder),
    check("offerings_display_order_check", sql`${table.displayOrder} >= 0`),
    check("offerings_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    custom: integer("custom", { mode: "boolean" }).notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("plans_code_uq").on(table.code),
    index("plans_active_order_idx").on(table.active, table.displayOrder),
    check("plans_display_order_check", sql`${table.displayOrder} >= 0`),
    check("plans_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const planFeatures = sqliteTable(
  "plan_features",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    offeringId: text("offering_id").notNull().references(() => offerings.id, { onDelete: "cascade" }),
    included: integer("included", { mode: "boolean" }).notNull().default(true),
    limitValue: integer("limit_value"),
    limitUnit: text("limit_unit"),
    configuration: text("configuration_json", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("plan_features_plan_offering_uq").on(table.planId, table.offeringId),
    index("plan_features_offering_idx").on(table.offeringId),
    check("plan_features_limit_check", sql`${table.limitValue} is null or ${table.limitValue} >= 0`),
    check("plan_features_limit_unit_check", sql`(${table.limitValue} is null and ${table.limitUnit} is null) or (${table.limitValue} is not null and ${table.limitUnit} is not null)`),
    check("plan_features_inclusion_check", sql`${table.included} = 1 or ${table.limitValue} is null`),
    check("plan_features_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const planPrices = sqliteTable(
  "plan_prices",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    billingInterval: text("billing_interval").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    setupFeeMinor: integer("setup_fee_minor").notNull().default(0),
    taxBehaviour: text("tax_behaviour").notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("plan_prices_scope_start_uq").on(
      table.planId,
      table.billingInterval,
      table.effectiveFrom,
    ),
    index("plan_prices_effective_lookup_idx").on(
      table.planId,
      table.billingInterval,
      table.active,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check("plan_prices_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("plan_prices_interval_check", sql`${table.billingInterval} in ('MONTHLY', 'ANNUAL')`),
    check("plan_prices_amount_check", sql`${table.amountMinor} >= 0 and ${table.setupFeeMinor} >= 0`),
    check("plan_prices_tax_check", sql`${table.taxBehaviour} in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')`),
    check("plan_prices_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
  ],
);

export const customerPriceOverrides = sqliteTable(
  "customer_price_overrides",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    billingInterval: text("billing_interval").notNull(),
    overrideAmountMinor: integer("override_amount_minor").notNull(),
    overrideSetupFeeMinor: integer("override_setup_fee_minor").notNull().default(0),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_price_overrides_scope_start_uq").on(
      table.customerId,
      table.planId,
      table.billingInterval,
      table.effectiveFrom,
    ),
    index("customer_price_overrides_effective_lookup_idx").on(
      table.customerId,
      table.planId,
      table.billingInterval,
      table.status,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    index("customer_price_overrides_plan_idx").on(table.planId),
    check("customer_price_overrides_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("customer_price_overrides_interval_check", sql`${table.billingInterval} in ('MONTHLY', 'ANNUAL')`),
    check("customer_price_overrides_amount_check", sql`${table.overrideAmountMinor} >= 0 and ${table.overrideSetupFeeMinor} >= 0`),
    check("customer_price_overrides_status_check", sql`${table.status} in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')`),
    check("customer_price_overrides_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
    check("customer_price_overrides_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const priceQuotes = sqliteTable(
  "price_quotes",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    billingInterval: text("billing_interval").notNull(),
    basePriceMinor: integer("base_price_minor").notNull(),
    overridePriceMinor: integer("override_price_minor"),
    discountTotalMinor: integer("discount_total_minor").notNull().default(0),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    pricingSnapshot: text("pricing_snapshot_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    validUntil: timestamp("valid_until").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("price_quotes_customer_created_idx").on(table.customerId, table.createdAt),
    index("price_quotes_plan_created_idx").on(table.planId, table.createdAt),
    check("price_quotes_interval_check", sql`${table.billingInterval} in ('MONTHLY', 'ANNUAL')`),
    check("price_quotes_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("price_quotes_amounts_check", sql`${table.basePriceMinor} >= 0 and (${table.overridePriceMinor} is null or ${table.overridePriceMinor} >= 0) and ${table.discountTotalMinor} >= 0 and ${table.subtotalMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.totalMinor} = ${table.subtotalMinor} + ${table.taxMinor}`),
    check("price_quotes_validity_check", sql`${table.validUntil} > ${table.createdAt}`),
  ],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    billingInterval: text("billing_interval").notNull(),
    currency: text("currency").notNull(),
    startedAt: timestamp("started_at"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    gracePeriodEndsAt: timestamp("grace_period_ends_at"),
    serviceExtendedUntil: timestamp("service_extended_until"),
    cancelAt: timestamp("cancel_at"),
    cancelledAt: timestamp("cancelled_at"),
    trialEndsAt: timestamp("trial_ends_at"),
    externalBillingProvider: text("external_billing_provider"),
    externalCustomerId: text("external_customer_id"),
    externalSubscriptionId: text("external_subscription_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_current_customer_uq").on(table.customerId)
      .where(sql`${table.status} in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END')`),
    uniqueIndex("subscriptions_provider_reference_uq").on(table.externalBillingProvider, table.externalSubscriptionId),
    index("subscriptions_customer_status_idx").on(table.customerId, table.status),
    index("subscriptions_status_period_idx").on(table.status, table.currentPeriodEnd),
    check("subscriptions_status_check", sql`${table.status} in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED')`),
    check("subscriptions_interval_check", sql`${table.billingInterval} in ('MONTHLY', 'ANNUAL')`),
    check("subscriptions_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("subscriptions_period_check", sql`(${table.currentPeriodStart} is null and ${table.currentPeriodEnd} is null) or (${table.currentPeriodStart} is not null and ${table.currentPeriodEnd} > ${table.currentPeriodStart})`),
    check("subscriptions_trial_check", sql`${table.status} <> 'TRIAL' or (${table.trialEndsAt} is not null and ${table.trialEndsAt} > ${table.createdAt})`),
    check("subscriptions_cancellation_check", sql`(${table.status} = 'CANCEL_AT_PERIOD_END' and ${table.cancelAt} = ${table.currentPeriodEnd} and ${table.cancelledAt} is null) or (${table.status} = 'CANCELLED' and ${table.cancelledAt} is not null) or (${table.status} not in ('CANCEL_AT_PERIOD_END', 'CANCELLED') and ${table.cancelAt} is null and ${table.cancelledAt} is null)`),
    check("subscriptions_grace_check", sql`${table.gracePeriodEndsAt} is null or ${table.gracePeriodEndsAt} > ${table.updatedAt}`),
    check("subscriptions_extension_check", sql`${table.serviceExtendedUntil} is null or ${table.serviceExtendedUntil} > ${table.updatedAt}`),
    check("subscriptions_external_check", sql`(${table.externalBillingProvider} is null and ${table.externalCustomerId} is null and ${table.externalSubscriptionId} is null) or (${table.externalBillingProvider} is not null and ${table.externalCustomerId} is not null)`),
    check("subscriptions_version_check", sql`${table.version} > 0`),
    check("subscriptions_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const customerBillingProfiles = sqliteTable(
  "customer_billing_profiles",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_billing_profiles_customer_uq").on(table.customerId),
    check("customer_billing_profiles_name_check", sql`length(trim(${table.contactName})) between 1 and 200`),
    check("customer_billing_profiles_email_check", sql`length(trim(${table.contactEmail})) between 3 and 320`),
    check("customer_billing_profiles_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const billingNotes = sqliteTable(
  "billing_notes",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    authorAdminUserId: text("author_admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("billing_notes_customer_created_idx").on(table.customerId, table.createdAt),
    index("billing_notes_subscription_idx").on(table.subscriptionId),
    index("billing_notes_invoice_idx").on(table.invoiceId),
    check("billing_notes_body_check", sql`length(trim(${table.body})) between 1 and 4000`),
  ],
);

export const subscriptionPrices = sqliteTable(
  "subscription_prices",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    effectiveAmountMinor: integer("effective_amount_minor").notNull(),
    setupFeeMinor: integer("setup_fee_minor").notNull().default(0),
    discountTotalMinor: integer("discount_total_minor").notNull().default(0),
    currency: text("currency").notNull(),
    taxBehaviour: text("tax_behaviour").notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    pricingSource: text("pricing_source").notNull(),
    pricingSnapshot: text("pricing_snapshot_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("subscription_prices_scope_start_uq").on(table.subscriptionId, table.effectiveFrom),
    index("subscription_prices_effective_lookup_idx").on(table.subscriptionId, table.effectiveFrom, table.effectiveTo),
    check("subscription_prices_amount_check", sql`${table.baseAmountMinor} >= 0 and ${table.effectiveAmountMinor} >= 0 and ${table.setupFeeMinor} >= 0 and ${table.discountTotalMinor} >= 0`),
    check("subscription_prices_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("subscription_prices_tax_check", sql`${table.taxBehaviour} in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')`),
    check("subscription_prices_source_check", sql`${table.pricingSource} in ('QUOTE', 'RESOLVED', 'MANUAL', 'RENEWAL')`),
    check("subscription_prices_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
  ],
);

export const subscriptionEntitlements = sqliteTable(
  "subscription_entitlements",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
    offeringCode: text("offering_code").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    limitValue: integer("limit_value"),
    limitUnit: text("limit_unit"),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("subscription_entitlements_scope_start_uq").on(table.subscriptionId, table.offeringCode, table.effectiveFrom),
    index("subscription_entitlements_effective_lookup_idx").on(table.subscriptionId, table.effectiveFrom, table.effectiveTo),
    check("subscription_entitlements_code_check", sql`${table.offeringCode} = lower(${table.offeringCode})`),
    check("subscription_entitlements_limit_check", sql`(${table.limitValue} is null and ${table.limitUnit} is null) or (${table.limitValue} >= 0 and ${table.limitUnit} is not null)`),
    check("subscription_entitlements_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
    check("subscription_entitlements_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const billingAccounts = sqliteTable(
  "billing_accounts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    status: text("status").notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("billing_accounts_customer_provider_uq").on(table.customerId, table.provider),
    uniqueIndex("billing_accounts_provider_reference_uq").on(table.provider, table.providerCustomerId),
    index("billing_accounts_customer_status_idx").on(table.customerId, table.status),
    check("billing_accounts_status_check", sql`${table.status} in ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')`),
    check("billing_accounts_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("billing_accounts_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
    billingAccountId: text("billing_account_id").references(() => billingAccounts.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    providerInvoiceId: text("provider_invoice_id"),
    status: text("status").notNull(),
    currency: text("currency").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    amountDueMinor: integer("amount_due_minor").notNull(),
    issuedAt: timestamp("issued_at"),
    dueAt: timestamp("due_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("invoices_number_uq").on(table.invoiceNumber),
    uniqueIndex("invoices_provider_reference_uq").on(table.providerInvoiceId),
    index("invoices_customer_created_idx").on(table.customerId, table.createdAt),
    index("invoices_subscription_created_idx").on(table.subscriptionId, table.createdAt),
    index("invoices_status_due_idx").on(table.status, table.dueAt),
    check("invoices_status_check", sql`${table.status} in ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')`),
    check("invoices_currency_check", sql`length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("invoices_amount_check", sql`${table.subtotalMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.totalMinor} = ${table.subtotalMinor} + ${table.taxMinor} and ${table.amountDueMinor} >= 0 and ${table.amountDueMinor} <= ${table.totalMinor}`),
    check("invoices_dates_check", sql`(${table.dueAt} is null or ${table.issuedAt} is not null) and (${table.dueAt} is null or ${table.dueAt} >= ${table.issuedAt}) and ((${table.status} = 'PAID' and ${table.paidAt} is not null) or (${table.status} <> 'PAID' and ${table.paidAt} is null))`),
    check("invoices_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitAmountMinor: integer("unit_amount_minor").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("invoice_lines_invoice_idx").on(table.invoiceId),
    check("invoice_lines_amount_check", sql`${table.quantity} > 0 and ${table.unitAmountMinor} >= 0 and ${table.subtotalMinor} = ${table.quantity} * ${table.unitAmountMinor} and ${table.taxMinor} >= 0 and ${table.totalMinor} = ${table.subtotalMinor} + ${table.taxMinor}`),
  ],
);

export const paymentReminders = sqliteTable(
  "payment_reminders",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    stage: text("stage").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    sentAt: timestamp("sent_at"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("payment_reminders_idempotency_uq").on(table.idempotencyKey),
    uniqueIndex("payment_reminders_invoice_stage_uq").on(table.invoiceId, table.stage),
    index("payment_reminders_status_schedule_idx").on(table.status, table.scheduledFor),
    check("payment_reminders_stage_check", sql`${table.stage} in ('BEFORE_DUE', 'DUE', 'OVERDUE_1', 'OVERDUE_2', 'FINAL')`),
    check("payment_reminders_status_check", sql`${table.status} in ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED')`),
    check("payment_reminders_outcome_check", sql`(${table.status} = 'SENT' and ${table.sentAt} is not null and ${table.failureCode} is null) or (${table.status} = 'FAILED' and ${table.sentAt} is null and ${table.failureCode} is not null) or (${table.status} in ('SCHEDULED', 'CANCELLED') and ${table.sentAt} is null and ${table.failureCode} is null)`),
    check("payment_reminders_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const discounts = sqliteTable(
  "discounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    discountType: text("discount_type").notNull(),
    percentOffBasisPoints: integer("percent_off_basis_points"),
    amountOffMinor: integer("amount_off_minor"),
    currency: text("currency"),
    durationType: text("duration_type").notNull(),
    durationMonths: integer("duration_months"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    maxRedemptions: integer("max_redemptions"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    stackable: integer("stackable", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("discounts_code_uq").on(table.code),
    index("discounts_effective_lookup_idx").on(table.active, table.startsAt, table.endsAt),
    check("discounts_code_check", sql`${table.code} = lower(${table.code})`),
    check("discounts_type_check", sql`${table.discountType} in ('PERCENTAGE', 'FIXED_AMOUNT')`),
    check("discounts_value_check", sql`(${table.discountType} = 'PERCENTAGE' and ${table.percentOffBasisPoints} between 1 and 10000 and ${table.amountOffMinor} is null and ${table.currency} is null) or (${table.discountType} = 'FIXED_AMOUNT' and ${table.percentOffBasisPoints} is null and ${table.amountOffMinor} > 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency}))`),
    check("discounts_duration_check", sql`(${table.durationType} = 'REPEATING' and ${table.durationMonths} > 0) or (${table.durationType} in ('ONCE', 'FOREVER') and ${table.durationMonths} is null)`),
    check("discounts_range_check", sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`),
    check("discounts_max_redemptions_check", sql`${table.maxRedemptions} is null or ${table.maxRedemptions} > 0`),
    check("discounts_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const promotionCodes = sqliteTable(
  "promotion_codes",
  {
    id: text("id").primaryKey(),
    discountId: text("discount_id").notNull().references(() => discounts.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    planId: text("plan_id").references(() => plans.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at").notNull(),
    expiresAt: timestamp("expires_at"),
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    firstPurchaseOnly: integer("first_purchase_only", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("promotion_codes_code_uq").on(table.code),
    index("promotion_codes_discount_idx").on(table.discountId),
    index("promotion_codes_effective_lookup_idx").on(table.active, table.startsAt, table.expiresAt),
    check("promotion_codes_normalised_check", sql`${table.code} = upper(${table.code}) and length(${table.code}) between 3 and 64`),
    check("promotion_codes_range_check", sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.startsAt}`),
    check("promotion_codes_redemption_check", sql`${table.redemptionCount} >= 0 and (${table.maxRedemptions} is null or (${table.maxRedemptions} > 0 and ${table.redemptionCount} <= ${table.maxRedemptions}))`),
    check("promotion_codes_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const customerDiscounts = sqliteTable(
  "customer_discounts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    discountId: text("discount_id").notNull().references(() => discounts.id, { onDelete: "restrict" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
    promotionCodeId: text("promotion_code_id").references(() => promotionCodes.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo: timestamp("effective_to"),
    status: text("status").notNull(),
    appliedBy: text("applied_by").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("customer_discounts_effective_lookup_idx").on(table.customerId, table.status, table.effectiveFrom, table.effectiveTo),
    index("customer_discounts_discount_idx").on(table.discountId),
    index("customer_discounts_subscription_idx").on(table.subscriptionId),
    index("customer_discounts_promotion_idx").on(table.promotionCodeId),
    check("customer_discounts_source_check", sql`${table.source} in ('ADMIN', 'PROMOTION_CODE', 'SALES', 'MIGRATION', 'SYSTEM')`),
    check("customer_discounts_status_check", sql`${table.status} in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')`),
    check("customer_discounts_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`),
    check("customer_discounts_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const discountRedemptions = sqliteTable(
  "discount_redemptions",
  {
    id: text("id").primaryKey(),
    discountId: text("discount_id").notNull().references(() => discounts.id, { onDelete: "restrict" }),
    promotionCodeId: text("promotion_code_id").references(() => promotionCodes.id, { onDelete: "restrict" }),
    customerDiscountId: text("customer_discount_id").notNull().references(() => customerDiscounts.id, { onDelete: "restrict" }),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    redemptionType: text("redemption_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    amountDiscountedMinor: integer("amount_discounted_minor").notNull().default(0),
    currency: text("currency").notNull(),
    redeemedAt: timestamp("redeemed_at").notNull(),
  },
  (table) => [
    uniqueIndex("discount_redemptions_idempotency_uq").on(table.idempotencyKey),
    index("discount_redemptions_promotion_idx").on(table.promotionCodeId, table.redeemedAt),
    index("discount_redemptions_discount_idx").on(table.discountId, table.redeemedAt),
    index("discount_redemptions_customer_idx").on(table.customerId, table.redeemedAt),
    check("discount_redemptions_type_check", sql`${table.redemptionType} in ('PROMOTION_CLAIM', 'CHARGE_APPLICATION')`),
    check("discount_redemptions_amount_check", sql`${table.amountDiscountedMinor} >= 0 and length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`),
    check("discount_redemptions_claim_check", sql`(${table.redemptionType} = 'PROMOTION_CLAIM' and ${table.promotionCodeId} is not null and ${table.amountDiscountedMinor} = 0) or (${table.redemptionType} = 'CHARGE_APPLICATION' and ${table.amountDiscountedMinor} > 0)`),
  ],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: text("id").primaryKey(),
    identityProvider: text("identity_provider").notNull(),
    externalSubject: text("external_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    bootstrap: integer("bootstrap", { mode: "boolean" }).notNull().default(false),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("admin_users_provider_subject_uq").on(table.identityProvider, table.externalSubject),
    uniqueIndex("admin_users_email_uq").on(table.email),
    uniqueIndex("admin_users_bootstrap_uq").on(table.bootstrap).where(sql`${table.bootstrap} = 1`),
    index("admin_users_status_idx").on(table.status),
    check("admin_users_status_check", sql`${table.status} in ('ACTIVE', 'SUSPENDED')`),
    check("admin_users_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    system: integer("system", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("roles_code_uq").on(table.code),
    check("roles_code_check", sql`${table.code} = upper(${table.code})`),
    check("roles_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const permissions = sqliteTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("permissions_code_uq").on(table.code),
    check("permissions_code_check", sql`${table.code} = upper(${table.code})`),
  ],
);

export const adminUserRoles = sqliteTable(
  "admin_user_roles",
  {
    adminUserId: text("admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
    assignedByAdminUserId: text("assigned_by_admin_user_id").references(() => adminUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.adminUserId, table.roleId] }),
    index("admin_user_roles_role_idx").on(table.roleId),
  ],
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_idx").on(table.permissionId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: text("before_json", { mode: "json" }).$type<unknown>(),
    afterJson: text("after_json", { mode: "json" }).$type<unknown>(),
    requestId: text("request_id").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_events_action_created_idx").on(table.action, table.createdAt),
    index("audit_events_actor_created_idx").on(table.actorType, table.actorId, table.createdAt),
    index("audit_events_created_at_idx").on(table.createdAt),
    index("audit_events_request_idx").on(table.requestId),
    check("audit_events_actor_type_check", sql`${table.actorType} in ('ANONYMOUS', 'CUSTOMER', 'ADMIN', 'SERVICE', 'SYSTEM')`),
    check("audit_events_actor_id_check", sql`(${table.actorType} = 'ANONYMOUS' and ${table.actorId} is null) or (${table.actorType} <> 'ANONYMOUS' and ${table.actorId} is not null)`),
  ],
);

export const onboardingCases = sqliteTable(
  "onboarding_cases",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    startedAt: timestamp("started_at"),
    readyAt: timestamp("ready_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_cases_current_customer_uq").on(table.customerId)
      .where(sql`${table.status} in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY')`),
    index("onboarding_cases_customer_status_idx").on(table.customerId, table.status),
    index("onboarding_cases_status_updated_idx").on(table.status, table.updatedAt),
    check("onboarding_cases_status_check", sql`${table.status} in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'COMPLETED', 'CANCELLED')`),
    check("onboarding_cases_version_check", sql`${table.version} > 0`),
    check("onboarding_cases_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
    check("onboarding_cases_lifecycle_check", sql`
      (${table.status} = 'NOT_STARTED' and ${table.startedAt} is null and ${table.readyAt} is null and ${table.completedAt} is null and ${table.cancelledAt} is null) or
      (${table.status} in ('IN_PROGRESS', 'BLOCKED') and ${table.startedAt} is not null and ${table.readyAt} is null and ${table.completedAt} is null and ${table.cancelledAt} is null) or
      (${table.status} = 'READY' and ${table.startedAt} is not null and ${table.readyAt} is not null and ${table.completedAt} is null and ${table.cancelledAt} is null) or
      (${table.status} = 'COMPLETED' and ${table.startedAt} is not null and ${table.readyAt} is not null and ${table.completedAt} is not null and ${table.cancelledAt} is null) or
      (${table.status} = 'CANCELLED' and ${table.completedAt} is null and ${table.cancelledAt} is not null)
    `),
  ],
);

export const onboardingTasks = sqliteTable(
  "onboarding_tasks",
  {
    id: text("id").primaryKey(),
    onboardingCaseId: text("onboarding_case_id").notNull().references(() => onboardingCases.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ownerType: text("owner_type").notNull(),
    status: text("status").notNull(),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    dueAt: timestamp("due_at"),
    blockedReason: text("blocked_reason"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_tasks_case_code_uq").on(table.onboardingCaseId, table.code),
    index("onboarding_tasks_case_owner_status_idx").on(table.onboardingCaseId, table.ownerType, table.status),
    index("onboarding_tasks_status_due_idx").on(table.status, table.dueAt),
    check("onboarding_tasks_code_check", sql`${table.code} = lower(${table.code})`),
    check("onboarding_tasks_owner_check", sql`${table.ownerType} in ('CUSTOMER', 'INTERNAL')`),
    check("onboarding_tasks_status_check", sql`${table.status} in ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED', 'CANCELLED')`),
    check("onboarding_tasks_order_check", sql`${table.sortOrder} >= 0`),
    check("onboarding_tasks_version_check", sql`${table.version} > 0`),
    check("onboarding_tasks_completion_check", sql`(${table.status} = 'DONE' and ${table.completedAt} is not null) or (${table.status} <> 'DONE' and ${table.completedAt} is null)`),
    check("onboarding_tasks_blocked_check", sql`(${table.status} = 'BLOCKED' and ${table.blockedReason} is not null) or (${table.status} <> 'BLOCKED' and ${table.blockedReason} is null)`),
    check("onboarding_tasks_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const onboardingTaskDependencies = sqliteTable(
  "onboarding_task_dependencies",
  {
    taskId: text("task_id").notNull().references(() => onboardingTasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id").notNull().references(() => onboardingTasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index("onboarding_task_dependencies_dependency_idx").on(table.dependsOnTaskId),
    check("onboarding_task_dependencies_not_self_check", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
  ],
);

export const customerIntegrations = sqliteTable(
  "customer_integrations",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    integrationCode: text("integration_code").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    lastCheckedAt: timestamp("last_checked_at"),
    lastSuccessfulAt: timestamp("last_successful_at"),
    errorCode: text("error_code"),
    metadata: text("metadata_json", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_integrations_customer_code_uq").on(table.customerId, table.integrationCode),
    index("customer_integrations_customer_status_idx").on(table.customerId, table.status),
    index("customer_integrations_category_status_idx").on(table.category, table.status),
    check("customer_integrations_code_check", sql`${table.integrationCode} = lower(${table.integrationCode})`),
    check("customer_integrations_status_check", sql`${table.status} in ('NOT_CONNECTED', 'PENDING', 'HEALTHY', 'DEGRADED', 'ERROR', 'DISABLED')`),
    check("customer_integrations_error_check", sql`(${table.status} in ('DEGRADED', 'ERROR') and ${table.errorCode} is not null) or (${table.status} not in ('DEGRADED', 'ERROR') and ${table.errorCode} is null)`),
    check("customer_integrations_version_check", sql`${table.version} > 0`),
    check("customer_integrations_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const agentLinks = sqliteTable(
  "agent_links",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    agentPlatform: text("agent_platform").notNull(),
    externalAgentId: text("external_agent_id"),
    status: text("status").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_links_customer_platform_uq").on(table.customerId, table.agentPlatform),
    uniqueIndex("agent_links_platform_external_uq").on(table.agentPlatform, table.externalAgentId)
      .where(sql`${table.externalAgentId} is not null`),
    index("agent_links_status_idx").on(table.status),
    check("agent_links_platform_check", sql`${table.agentPlatform} = lower(${table.agentPlatform})`),
    check("agent_links_status_check", sql`${table.status} in ('NOT_PROVISIONED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ERROR')`),
    check("agent_links_external_check", sql`${table.status} not in ('ACTIVE', 'SUSPENDED') or ${table.externalAgentId} is not null`),
    check("agent_links_version_check", sql`${table.version} > 0`),
    check("agent_links_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const agentProvisioningJobs = sqliteTable(
  "agent_provisioning_jobs",
  {
    id: text("id").primaryKey(),
    agentLinkId: text("agent_link_id").notNull().references(() => agentLinks.id, { onDelete: "restrict" }),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at"),
    errorCategory: text("error_category"),
    requestedAt: timestamp("requested_at").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_provisioning_jobs_idempotency_uq").on(table.idempotencyKey),
    index("agent_provisioning_jobs_link_status_idx").on(table.agentLinkId, table.status, table.nextAttemptAt),
    index("agent_provisioning_jobs_customer_status_idx").on(table.customerId, table.status),
    check("agent_provisioning_jobs_operation_check", sql`${table.operation} in ('PROVISION', 'UPDATE', 'SUSPEND', 'RESUME')`),
    check("agent_provisioning_jobs_status_check", sql`${table.status} in ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED')`),
    check("agent_provisioning_jobs_attempt_check", sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`),
    check("agent_provisioning_jobs_outcome_check", sql`(${table.status} = 'SUCCEEDED' and ${table.completedAt} is not null and ${table.errorCategory} is null) or (${table.status} = 'FAILED' and ${table.completedAt} is not null and ${table.errorCategory} is not null) or (${table.status} in ('PENDING', 'IN_PROGRESS', 'CANCELLED') and ${table.completedAt} is null and ${table.errorCategory} is null)`),
    check("agent_provisioning_jobs_version_check", sql`${table.version} > 0`),
    check("agent_provisioning_jobs_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const operationalQueueItems = sqliteTable(
  "operational_queue_items",
  {
    id: text("id").primaryKey(),
    queueType: text("queue_type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    priority: integer("priority").notNull().default(50),
    title: text("title").notNull(),
    availableAt: timestamp("available_at").notNull(),
    dueAt: timestamp("due_at"),
    assignedToAdminUserId: text("assigned_to_admin_user_id").references(() => adminUsers.id, { onDelete: "restrict" }),
    claimedAt: timestamp("claimed_at"),
    resolvedAt: timestamp("resolved_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("operational_queue_items_open_source_uq").on(table.queueType, table.sourceType, table.sourceId)
      .where(sql`${table.status} in ('OPEN', 'CLAIMED')`),
    index("operational_queue_items_work_idx").on(table.queueType, table.status, table.priority, table.availableAt),
    index("operational_queue_items_customer_status_idx").on(table.customerId, table.status),
    index("operational_queue_items_assignee_status_idx").on(table.assignedToAdminUserId, table.status),
    check("operational_queue_items_type_check", sql`${table.queueType} in ('CUSTOMER_ACTION', 'INTERNAL_ACTION', 'BILLING_ATTENTION', 'AGENT_PROVISIONING')`),
    check("operational_queue_items_status_check", sql`${table.status} in ('OPEN', 'CLAIMED', 'COMPLETED', 'DISMISSED')`),
    check("operational_queue_items_priority_check", sql`${table.priority} between 0 and 100`),
    check("operational_queue_items_claim_check", sql`(${table.status} = 'CLAIMED' and ${table.assignedToAdminUserId} is not null and ${table.claimedAt} is not null and ${table.resolvedAt} is null) or (${table.status} = 'OPEN' and ${table.assignedToAdminUserId} is null and ${table.claimedAt} is null and ${table.resolvedAt} is null) or (${table.status} in ('COMPLETED', 'DISMISSED') and ${table.resolvedAt} is not null)`),
    check("operational_queue_items_version_check", sql`${table.version} > 0`),
    check("operational_queue_items_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const notificationTemplates = sqliteTable(
  "notification_templates",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    channel: text("channel").notNull(),
    version: integer("version").notNull(),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template").notNull(),
    requiredServiceNotice: integer("required_service_notice", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_templates_code_channel_version_uq").on(table.code, table.channel, table.version),
    uniqueIndex("notification_templates_active_code_channel_uq").on(table.code, table.channel)
      .where(sql`${table.active} = 1`),
    check("notification_templates_code_check", sql`${table.code} = lower(${table.code})`),
    check("notification_templates_channel_check", sql`${table.channel} in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')`),
    check("notification_templates_version_check", sql`${table.version} > 0`),
    check("notification_templates_subject_check", sql`${table.channel} <> 'EMAIL' or ${table.subjectTemplate} is not null`),
    check("notification_templates_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    notificationCode: text("notification_code").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_preferences_customer_code_channel_uq").on(table.customerId, table.notificationCode, table.channel),
    index("notification_preferences_customer_idx").on(table.customerId),
    check("notification_preferences_code_check", sql`${table.notificationCode} = lower(${table.notificationCode})`),
    check("notification_preferences_channel_check", sql`${table.channel} in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')`),
    check("notification_preferences_status_check", sql`${table.status} in ('OPTED_IN', 'OPTED_OUT')`),
    check("notification_preferences_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull().references(() => notificationTemplates.id, { onDelete: "restrict" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    recipientType: text("recipient_type").notNull(),
    recipientId: text("recipient_id").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    templateVariables: text("template_variables_json", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at"),
    processingStartedAt: timestamp("processing_started_at"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    providerReference: text("provider_reference"),
    errorCategory: text("error_category"),
    sentAt: timestamp("sent_at"),
    cancelledAt: timestamp("cancelled_at"),
    readAt: timestamp("read_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_idempotency_uq").on(table.idempotencyKey),
    index("notification_deliveries_retry_idx").on(table.status, table.nextAttemptAt, table.scheduledFor),
    index("notification_deliveries_lease_idx").on(table.status, table.leaseExpiresAt),
    index("notification_deliveries_customer_created_idx").on(table.customerId, table.createdAt),
    index("notification_deliveries_recipient_status_idx").on(table.recipientType, table.recipientId, table.status),
    check("notification_deliveries_recipient_check", sql`${table.recipientType} in ('CUSTOMER', 'ADMIN', 'SYSTEM')`),
    check("notification_deliveries_channel_check", sql`${table.channel} in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')`),
    check("notification_deliveries_status_check", sql`${table.status} in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')`),
    check("notification_deliveries_attempt_check", sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`),
    check("notification_deliveries_outcome_check", sql`(${table.status} = 'SENT' and ${table.sentAt} is not null and ${table.providerReference} is not null and ${table.errorCategory} is null and ${table.cancelledAt} is null) or (${table.status} = 'FAILED' and ${table.sentAt} is null and ${table.errorCategory} is not null and ${table.cancelledAt} is null) or (${table.status} in ('PENDING', 'PROCESSING') and ${table.sentAt} is null and ${table.errorCategory} is null and ${table.cancelledAt} is null) or (${table.status} = 'CANCELLED' and ${table.sentAt} is null and ${table.errorCategory} is null and ${table.cancelledAt} is not null)`),
    check("notification_deliveries_lease_check", sql`(${table.status} = 'PROCESSING' and ${table.processingStartedAt} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'PROCESSING' and ${table.processingStartedAt} is null and ${table.leaseExpiresAt} is null)`),
    check("notification_deliveries_read_check", sql`${table.readAt} is null or (${table.channel} = 'IN_APP' and ${table.status} = 'SENT' and ${table.readAt} >= ${table.sentAt})`),
    check("notification_deliveries_version_check", sql`${table.version} > 0`),
    check("notification_deliveries_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const notificationDeliveryAttempts = sqliteTable(
  "notification_delivery_attempts",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull().references(() => notificationDeliveries.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerReference: text("provider_reference"),
    errorCategory: text("error_category"),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_delivery_attempts_delivery_number_uq").on(table.deliveryId, table.attemptNumber),
    index("notification_delivery_attempts_delivery_created_idx").on(table.deliveryId, table.createdAt),
    index("notification_delivery_attempts_status_created_idx").on(table.status, table.createdAt),
    check("notification_delivery_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check("notification_delivery_attempts_status_check", sql`${table.status} in ('PROCESSING', 'SENT', 'FAILED')`),
    check("notification_delivery_attempts_outcome_check", sql`(${table.status} = 'PROCESSING' and ${table.completedAt} is null and ${table.providerReference} is null and ${table.errorCategory} is null) or (${table.status} = 'SENT' and ${table.completedAt} is not null and ${table.providerReference} is not null and ${table.errorCategory} is null) or (${table.status} = 'FAILED' and ${table.completedAt} is not null and ${table.providerReference} is null and ${table.errorCategory} is not null)`),
  ],
);

export const serviceCredentials = sqliteTable(
  "service_credentials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: text("scopes_json", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status").notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at").notNull(),
    rotatedFromId: text("rotated_from_id"),
    createdByAdminUserId: text("created_by_admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "restrict" }),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    revokedByAdminUserId: text("revoked_by_admin_user_id").references(() => adminUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("service_credentials_secret_hash_uq").on(table.secretHash),
    index("service_credentials_status_expiry_idx").on(table.status, table.expiresAt),
    index("service_credentials_rotated_from_idx").on(table.rotatedFromId),
    check("service_credentials_status_check", sql`${table.status} in ('ACTIVE', 'REVOKED')`),
    check("service_credentials_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("service_credentials_revocation_check", sql`(${table.status} = 'ACTIVE' and ${table.revokedAt} is null and ${table.revokedByAdminUserId} is null) or (${table.status} = 'REVOKED' and ${table.revokedAt} is not null and ${table.revokedByAdminUserId} is not null)`),
    check("service_credentials_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull().default("PROCESSING"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body_json", { mode: "json" }).$type<unknown>(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_scope_key_uq").on(table.scope, table.key),
    index("idempotency_keys_expiry_idx").on(table.expiresAt),
    check("idempotency_keys_state_check", sql`${table.state} in ('PROCESSING', 'COMPLETED')`),
    check("idempotency_keys_response_check", sql`(${table.state} = 'PROCESSING' and ${table.responseStatus} is null and ${table.responseBody} is null) or (${table.state} = 'COMPLETED' and ${table.responseStatus} between 200 and 499 and ${table.responseBody} is not null)`),
    check("idempotency_keys_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check("idempotency_keys_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const serviceRateLimits = sqliteTable(
  "service_rate_limits",
  {
    credentialId: text("credential_id").notNull().references(() => serviceCredentials.id, { onDelete: "cascade" }),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.credentialId, table.windowStartedAt] }),
    index("service_rate_limits_window_idx").on(table.windowStartedAt),
    check("service_rate_limits_count_check", sql`${table.requestCount} > 0`),
    check("service_rate_limits_timestamps_check", sql`${table.updatedAt} >= ${table.windowStartedAt}`),
  ],
);

export const billingWebhookEvents = sqliteTable(
  "billing_webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    normalizedPayload: text("normalized_payload_json", { mode: "json" }).$type<unknown>().notNull(),
    status: text("status").notNull().default("PROCESSING"),
    attemptCount: integer("attempt_count").notNull().default(1),
    maxAttempts: integer("max_attempts").notNull().default(5),
    occurredAt: timestamp("occurred_at").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    processingStartedAt: timestamp("processing_started_at").notNull(),
    processedAt: timestamp("processed_at"),
    nextAttemptAt: timestamp("next_attempt_at"),
    failureCode: text("failure_code"),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("billing_webhook_events_provider_event_uq").on(table.provider, table.providerEventId),
    index("billing_webhook_events_ready_idx").on(table.status, table.nextAttemptAt),
    index("billing_webhook_events_provider_occurred_idx").on(table.provider, table.occurredAt),
    check("billing_webhook_events_status_check", sql`${table.status} in ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')`),
    check("billing_webhook_events_attempt_check", sql`${table.attemptCount} > 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`),
    check("billing_webhook_events_outcome_check", sql`(${table.status} = 'PROCESSING' and ${table.processedAt} is null and ${table.nextAttemptAt} is null and ${table.failureCode} is null) or (${table.status} in ('PROCESSED', 'IGNORED') and ${table.processedAt} is not null and ${table.nextAttemptAt} is null and ${table.failureCode} is null) or (${table.status} = 'FAILED' and ${table.processedAt} is null and ${table.failureCode} is not null)`),
    check("billing_webhook_events_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt} and ${table.processingStartedAt} >= ${table.receivedAt}`),
  ],
);

export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.subjectHash, table.windowStartedAt] }),
    index("api_rate_limits_window_idx").on(table.windowStartedAt),
    check("api_rate_limits_count_check", sql`${table.requestCount} > 0`),
    check("api_rate_limits_subject_hash_check", sql`length(${table.subjectHash}) = 64`),
    check("api_rate_limits_timestamps_check", sql`${table.updatedAt} >= ${table.windowStartedAt}`),
  ],
);
