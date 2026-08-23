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
