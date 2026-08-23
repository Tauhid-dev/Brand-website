import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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

export const customerIdentities = sqliteTable(
  "customer_identities",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalSubject: text("external_subject").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_identities_provider_subject_uq").on(table.provider, table.externalSubject),
    index("customer_identities_customer_idx").on(table.customerId),
    index("customer_identities_email_idx").on(table.email),
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
