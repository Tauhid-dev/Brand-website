-- Generated from drizzle/meta/0014_snapshot.json by scripts/generate-postgres-baseline.mjs.
-- D1 keeps its forward-only lineage in drizzle/. PostgreSQL owns this independent baseline.

create table "admin_users" (
  "id" text primary key not null,
  "identity_provider" text not null,
  "external_subject" text not null,
  "email" text not null,
  "display_name" text not null,
  "status" text not null,
  "bootstrap" bigint not null default 0,
  "last_login_at" bigint,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "admin_users_status_check" check ("status" in ('ACTIVE', 'SUSPENDED')),
  constraint "admin_users_timestamps_check" check ("updated_at" >= "created_at")
);

create table "api_rate_limits" (
  "scope" text not null,
  "subject_hash" text not null,
  "window_started_at" bigint not null,
  "request_count" bigint not null default 1,
  "updated_at" bigint not null,
  constraint "api_rate_limits_scope_subject_hash_window_started_at_pk" primary key ("scope", "subject_hash", "window_started_at"),
  constraint "api_rate_limits_count_check" check ("request_count" > 0),
  constraint "api_rate_limits_subject_hash_check" check (length("subject_hash") = 64),
  constraint "api_rate_limits_timestamps_check" check ("updated_at" >= "window_started_at")
);

create table "audit_events" (
  "id" text primary key not null,
  "actor_type" text not null,
  "actor_id" text,
  "action" text not null,
  "entity_type" text not null,
  "entity_id" text,
  "before_json" text,
  "after_json" text,
  "request_id" text not null,
  "ip_address" text,
  "user_agent" text,
  "created_at" bigint not null,
  constraint "audit_events_actor_type_check" check ("actor_type" in ('ANONYMOUS', 'CUSTOMER', 'ADMIN', 'SERVICE', 'SYSTEM')),
  constraint "audit_events_actor_id_check" check (("actor_type" = 'ANONYMOUS' and "actor_id" is null) or ("actor_type" <> 'ANONYMOUS' and "actor_id" is not null))
);

create table "billing_webhook_events" (
  "id" text primary key not null,
  "provider" text not null,
  "provider_event_id" text not null,
  "event_type" text not null,
  "payload_hash" text not null,
  "normalized_payload_json" text not null,
  "status" text not null default 'PROCESSING',
  "attempt_count" bigint not null default 1,
  "max_attempts" bigint not null default 5,
  "occurred_at" bigint not null,
  "received_at" bigint not null,
  "processing_started_at" bigint not null,
  "processed_at" bigint,
  "next_attempt_at" bigint,
  "failure_code" text,
  "request_id" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "billing_webhook_events_status_check" check ("status" in ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')),
  constraint "billing_webhook_events_attempt_check" check ("attempt_count" > 0 and "max_attempts" > 0 and "attempt_count" <= "max_attempts"),
  constraint "billing_webhook_events_outcome_check" check (("status" = 'PROCESSING' and "processed_at" is null and "next_attempt_at" is null and "failure_code" is null) or ("status" in ('PROCESSED', 'IGNORED') and "processed_at" is not null and "next_attempt_at" is null and "failure_code" is null) or ("status" = 'FAILED' and "processed_at" is null and "failure_code" is not null)),
  constraint "billing_webhook_events_timestamps_check" check ("updated_at" >= "created_at" and "processing_started_at" >= "received_at")
);

create table "customers" (
  "id" text primary key not null,
  "external_reference" text not null,
  "business_name" text not null,
  "contact_name" text not null,
  "email" text not null,
  "phone" text,
  "industry" text,
  "website_url" text,
  "status" text not null,
  "creation_source" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customers_status_check" check ("status" in ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED')),
  constraint "customers_creation_source_check" check ("creation_source" in ('SELF_REGISTRATION', 'ADMIN', 'INVITATION', 'MIGRATION')),
  constraint "customers_timestamps_check" check ("updated_at" >= "created_at")
);

create table "discounts" (
  "id" text primary key not null,
  "code" text not null,
  "name" text not null,
  "description" text,
  "discount_type" text not null,
  "percent_off_basis_points" bigint,
  "amount_off_minor" bigint,
  "currency" text,
  "duration_type" text not null,
  "duration_months" bigint,
  "starts_at" bigint not null,
  "ends_at" bigint,
  "max_redemptions" bigint,
  "active" bigint not null default 1,
  "stackable" bigint not null default 0,
  "created_by" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "discounts_code_check" check ("code" = lower("code")),
  constraint "discounts_type_check" check ("discount_type" in ('PERCENTAGE', 'FIXED_AMOUNT')),
  constraint "discounts_value_check" check (("discount_type" = 'PERCENTAGE' and "percent_off_basis_points" between 1 and 10000 and "amount_off_minor" is null and "currency" is null) or ("discount_type" = 'FIXED_AMOUNT' and "percent_off_basis_points" is null and "amount_off_minor" > 0 and length("currency") = 3 and "currency" = upper("currency"))),
  constraint "discounts_duration_check" check (("duration_type" = 'REPEATING' and "duration_months" > 0) or ("duration_type" in ('ONCE', 'FOREVER') and "duration_months" is null)),
  constraint "discounts_range_check" check ("ends_at" is null or "ends_at" > "starts_at"),
  constraint "discounts_max_redemptions_check" check ("max_redemptions" is null or "max_redemptions" > 0),
  constraint "discounts_timestamps_check" check ("updated_at" >= "created_at")
);

create table "idempotency_keys" (
  "id" text primary key not null,
  "scope" text not null,
  "key" text not null,
  "request_hash" text not null,
  "state" text not null default 'PROCESSING',
  "response_status" bigint,
  "response_body_json" text,
  "expires_at" bigint not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "idempotency_keys_state_check" check ("state" in ('PROCESSING', 'COMPLETED')),
  constraint "idempotency_keys_response_check" check (("state" = 'PROCESSING' and "response_status" is null and "response_body_json" is null) or ("state" = 'COMPLETED' and "response_status" between 200 and 499 and "response_body_json" is not null)),
  constraint "idempotency_keys_expiry_check" check ("expires_at" > "created_at"),
  constraint "idempotency_keys_timestamps_check" check ("updated_at" >= "created_at")
);

create table "notification_templates" (
  "id" text primary key not null,
  "code" text not null,
  "channel" text not null,
  "version" bigint not null,
  "subject_template" text,
  "body_template" text not null,
  "required_service_notice" bigint not null default 0,
  "active" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "notification_templates_code_check" check ("code" = lower("code")),
  constraint "notification_templates_channel_check" check ("channel" in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  constraint "notification_templates_version_check" check ("version" > 0),
  constraint "notification_templates_subject_check" check ("channel" <> 'EMAIL' or "subject_template" is not null),
  constraint "notification_templates_timestamps_check" check ("updated_at" >= "created_at")
);

create table "offerings" (
  "id" text primary key not null,
  "code" text not null,
  "name" text not null,
  "description" text,
  "category" text not null,
  "active" bigint not null default 1,
  "display_order" bigint not null default 0,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "offerings_display_order_check" check ("display_order" >= 0),
  constraint "offerings_timestamps_check" check ("updated_at" >= "created_at")
);

create table "permissions" (
  "id" text primary key not null,
  "code" text not null,
  "name" text not null,
  "description" text not null,
  "created_at" bigint not null,
  constraint "permissions_code_check" check ("code" = upper("code"))
);

create table "plans" (
  "id" text primary key not null,
  "code" text not null,
  "name" text not null,
  "description" text,
  "active" bigint not null default 1,
  "featured" bigint not null default 0,
  "custom" bigint not null default 0,
  "display_order" bigint not null default 0,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "plans_display_order_check" check ("display_order" >= 0),
  constraint "plans_timestamps_check" check ("updated_at" >= "created_at")
);

create table "roles" (
  "id" text primary key not null,
  "code" text not null,
  "name" text not null,
  "description" text not null,
  "system" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "roles_code_check" check ("code" = upper("code")),
  constraint "roles_timestamps_check" check ("updated_at" >= "created_at")
);

create table "admin_user_roles" (
  "admin_user_id" text not null,
  "role_id" text not null,
  "assigned_by_admin_user_id" text,
  "created_at" bigint not null,
  constraint "admin_user_roles_admin_user_id_role_id_pk" primary key ("admin_user_id", "role_id"),
  constraint "admin_user_roles_admin_user_id_admin_users_id_fk" foreign key ("admin_user_id") references "admin_users" ("id") on update no action on delete cascade,
  constraint "admin_user_roles_role_id_roles_id_fk" foreign key ("role_id") references "roles" ("id") on update no action on delete restrict,
  constraint "admin_user_roles_assigned_by_admin_user_id_admin_users_id_fk" foreign key ("assigned_by_admin_user_id") references "admin_users" ("id") on update no action on delete restrict
);

create table "agent_links" (
  "id" text primary key not null,
  "customer_id" text not null,
  "agent_platform" text not null,
  "external_agent_id" text,
  "status" text not null,
  "last_synced_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "agent_links_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "agent_links_platform_check" check ("agent_platform" = lower("agent_platform")),
  constraint "agent_links_status_check" check ("status" in ('NOT_PROVISIONED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ERROR')),
  constraint "agent_links_external_check" check ("status" not in ('ACTIVE', 'SUSPENDED') or "external_agent_id" is not null),
  constraint "agent_links_version_check" check ("version" > 0),
  constraint "agent_links_timestamps_check" check ("updated_at" >= "created_at")
);

create table "billing_accounts" (
  "id" text primary key not null,
  "customer_id" text not null,
  "provider" text not null,
  "provider_customer_id" text not null,
  "status" text not null,
  "currency" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "billing_accounts_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "billing_accounts_status_check" check ("status" in ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  constraint "billing_accounts_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "billing_accounts_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_billing_profiles" (
  "id" text primary key not null,
  "customer_id" text not null,
  "contact_name" text not null,
  "contact_email" text not null,
  "contact_phone" text,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customer_billing_profiles_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "customer_billing_profiles_name_check" check (length(trim("contact_name")) between 1 and 200),
  constraint "customer_billing_profiles_email_check" check (length(trim("contact_email")) between 3 and 320),
  constraint "customer_billing_profiles_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_business_profiles" (
  "id" text primary key not null,
  "customer_id" text not null,
  "business_name" text not null,
  "trading_name" text,
  "abn" text,
  "website_url" text,
  "primary_email" text not null,
  "primary_phone" text,
  "industry" text,
  "timezone" text not null default 'Australia/Sydney',
  "country" text not null default 'AU',
  "state" text,
  "suburb" text,
  "postcode" text,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customer_business_profiles_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete cascade,
  constraint "customer_business_profiles_country_check" check ("country" = 'AU'),
  constraint "customer_business_profiles_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_integrations" (
  "id" text primary key not null,
  "customer_id" text not null,
  "integration_code" text not null,
  "category" text not null,
  "status" text not null,
  "last_checked_at" bigint,
  "last_successful_at" bigint,
  "error_code" text,
  "metadata_json" text not null default '{}',
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customer_integrations_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "customer_integrations_code_check" check ("integration_code" = lower("integration_code")),
  constraint "customer_integrations_status_check" check ("status" in ('NOT_CONNECTED', 'PENDING', 'HEALTHY', 'DEGRADED', 'ERROR', 'DISABLED')),
  constraint "customer_integrations_error_check" check (("status" in ('DEGRADED', 'ERROR') and "error_code" is not null) or ("status" not in ('DEGRADED', 'ERROR') and "error_code" is null)),
  constraint "customer_integrations_version_check" check ("version" > 0),
  constraint "customer_integrations_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_invitations" (
  "id" text primary key not null,
  "customer_id" text,
  "email" text not null,
  "token_hash" text not null,
  "status" text not null,
  "invited_by" text not null,
  "expires_at" bigint not null,
  "accepted_at" bigint,
  "created_at" bigint not null,
  constraint "customer_invitations_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete cascade,
  constraint "customer_invitations_status_check" check ("status" in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  constraint "customer_invitations_expiry_check" check ("expires_at" > "created_at"),
  constraint "customer_invitations_acceptance_check" check (("status" = 'ACCEPTED' and "accepted_at" is not null) or ("status" <> 'ACCEPTED' and "accepted_at" is null))
);

create table "customer_notes" (
  "id" text primary key not null,
  "customer_id" text not null,
  "body" text not null,
  "author_type" text not null,
  "author_id" text not null,
  "created_at" bigint not null,
  constraint "customer_notes_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete cascade,
  constraint "customer_notes_author_type_check" check ("author_type" in ('ADMIN', 'SYSTEM'))
);

create table "customer_price_overrides" (
  "id" text primary key not null,
  "customer_id" text not null,
  "plan_id" text not null,
  "currency" text not null,
  "billing_interval" text not null,
  "override_amount_minor" bigint not null,
  "override_setup_fee_minor" bigint not null default 0,
  "effective_from" bigint not null,
  "effective_to" bigint,
  "reason" text not null,
  "status" text not null,
  "created_by" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customer_price_overrides_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "customer_price_overrides_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "customer_price_overrides_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "customer_price_overrides_interval_check" check ("billing_interval" in ('MONTHLY', 'ANNUAL')),
  constraint "customer_price_overrides_amount_check" check ("override_amount_minor" >= 0 and "override_setup_fee_minor" >= 0),
  constraint "customer_price_overrides_status_check" check ("status" in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
  constraint "customer_price_overrides_range_check" check ("effective_to" is null or "effective_to" > "effective_from"),
  constraint "customer_price_overrides_timestamps_check" check ("updated_at" >= "created_at")
);

create table "notification_deliveries" (
  "id" text primary key not null,
  "template_id" text not null,
  "customer_id" text,
  "recipient_type" text not null,
  "recipient_id" text not null,
  "channel" text not null,
  "status" text not null,
  "template_variables_json" text not null default '{}',
  "idempotency_key" text not null,
  "scheduled_for" bigint not null,
  "attempt_count" bigint not null default 0,
  "max_attempts" bigint not null default 5,
  "next_attempt_at" bigint,
  "processing_started_at" bigint,
  "lease_expires_at" bigint,
  "provider_reference" text,
  "error_category" text,
  "sent_at" bigint,
  "cancelled_at" bigint,
  "read_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "notification_deliveries_template_id_notification_templates_id_fk" foreign key ("template_id") references "notification_templates" ("id") on update no action on delete restrict,
  constraint "notification_deliveries_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "notification_deliveries_recipient_check" check ("recipient_type" in ('CUSTOMER', 'ADMIN', 'SYSTEM')),
  constraint "notification_deliveries_channel_check" check ("channel" in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  constraint "notification_deliveries_status_check" check ("status" in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
  constraint "notification_deliveries_attempt_check" check ("attempt_count" >= 0 and "max_attempts" > 0 and "attempt_count" <= "max_attempts"),
  constraint "notification_deliveries_outcome_check" check (("status" = 'SENT' and "sent_at" is not null and "provider_reference" is not null and "error_category" is null and "cancelled_at" is null) or ("status" = 'FAILED' and "sent_at" is null and "error_category" is not null and "cancelled_at" is null) or ("status" in ('PENDING', 'PROCESSING') and "sent_at" is null and "error_category" is null and "cancelled_at" is null) or ("status" = 'CANCELLED' and "sent_at" is null and "error_category" is null and "cancelled_at" is not null)),
  constraint "notification_deliveries_lease_check" check (("status" = 'PROCESSING' and "processing_started_at" is not null and "lease_expires_at" is not null) or ("status" <> 'PROCESSING' and "processing_started_at" is null and "lease_expires_at" is null)),
  constraint "notification_deliveries_read_check" check ("read_at" is null or ("channel" = 'IN_APP' and "status" = 'SENT' and "read_at" >= "sent_at")),
  constraint "notification_deliveries_version_check" check ("version" > 0),
  constraint "notification_deliveries_timestamps_check" check ("updated_at" >= "created_at")
);

create table "notification_preferences" (
  "id" text primary key not null,
  "customer_id" text not null,
  "notification_code" text not null,
  "channel" text not null,
  "status" text not null,
  "updated_by" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "notification_preferences_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "notification_preferences_code_check" check ("notification_code" = lower("notification_code")),
  constraint "notification_preferences_channel_check" check ("channel" in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  constraint "notification_preferences_status_check" check ("status" in ('OPTED_IN', 'OPTED_OUT')),
  constraint "notification_preferences_timestamps_check" check ("updated_at" >= "created_at")
);

create table "onboarding_cases" (
  "id" text primary key not null,
  "customer_id" text not null,
  "status" text not null,
  "started_at" bigint,
  "ready_at" bigint,
  "completed_at" bigint,
  "cancelled_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "onboarding_cases_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "onboarding_cases_status_check" check ("status" in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'COMPLETED', 'CANCELLED')),
  constraint "onboarding_cases_version_check" check ("version" > 0),
  constraint "onboarding_cases_timestamps_check" check ("updated_at" >= "created_at"),
  constraint "onboarding_cases_lifecycle_check" check (
      ("status" = 'NOT_STARTED' and "started_at" is null and "ready_at" is null and "completed_at" is null and "cancelled_at" is null) or
      ("status" in ('IN_PROGRESS', 'BLOCKED') and "started_at" is not null and "ready_at" is null and "completed_at" is null and "cancelled_at" is null) or
      ("status" = 'READY' and "started_at" is not null and "ready_at" is not null and "completed_at" is null and "cancelled_at" is null) or
      ("status" = 'COMPLETED' and "started_at" is not null and "ready_at" is not null and "completed_at" is not null and "cancelled_at" is null) or
      ("status" = 'CANCELLED' and "completed_at" is null and "cancelled_at" is not null)
    )
);

create table "operational_queue_items" (
  "id" text primary key not null,
  "queue_type" text not null,
  "source_type" text not null,
  "source_id" text not null,
  "customer_id" text,
  "status" text not null,
  "priority" bigint not null default 50,
  "title" text not null,
  "available_at" bigint not null,
  "due_at" bigint,
  "assigned_to_admin_user_id" text,
  "claimed_at" bigint,
  "resolved_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "operational_queue_items_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "operational_queue_items_assigned_to_admin_user_id_admin_users_id_fk" foreign key ("assigned_to_admin_user_id") references "admin_users" ("id") on update no action on delete restrict,
  constraint "operational_queue_items_type_check" check ("queue_type" in ('CUSTOMER_ACTION', 'INTERNAL_ACTION', 'BILLING_ATTENTION', 'AGENT_PROVISIONING')),
  constraint "operational_queue_items_status_check" check ("status" in ('OPEN', 'CLAIMED', 'COMPLETED', 'DISMISSED')),
  constraint "operational_queue_items_priority_check" check ("priority" between 0 and 100),
  constraint "operational_queue_items_claim_check" check (("status" = 'CLAIMED' and "assigned_to_admin_user_id" is not null and "claimed_at" is not null and "resolved_at" is null) or ("status" = 'OPEN' and "assigned_to_admin_user_id" is null and "claimed_at" is null and "resolved_at" is null) or ("status" in ('COMPLETED', 'DISMISSED') and "resolved_at" is not null)),
  constraint "operational_queue_items_version_check" check ("version" > 0),
  constraint "operational_queue_items_timestamps_check" check ("updated_at" >= "created_at")
);

create table "plan_features" (
  "id" text primary key not null,
  "plan_id" text not null,
  "offering_id" text not null,
  "included" bigint not null default 1,
  "limit_value" bigint,
  "limit_unit" text,
  "configuration_json" text,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "plan_features_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete cascade,
  constraint "plan_features_offering_id_offerings_id_fk" foreign key ("offering_id") references "offerings" ("id") on update no action on delete cascade,
  constraint "plan_features_limit_check" check ("limit_value" is null or "limit_value" >= 0),
  constraint "plan_features_limit_unit_check" check (("limit_value" is null and "limit_unit" is null) or ("limit_value" is not null and "limit_unit" is not null)),
  constraint "plan_features_inclusion_check" check ("included" = 1 or "limit_value" is null),
  constraint "plan_features_timestamps_check" check ("updated_at" >= "created_at")
);

create table "plan_prices" (
  "id" text primary key not null,
  "plan_id" text not null,
  "currency" text not null,
  "billing_interval" text not null,
  "amount_minor" bigint not null,
  "setup_fee_minor" bigint not null default 0,
  "tax_behaviour" text not null,
  "effective_from" bigint not null,
  "effective_to" bigint,
  "active" bigint not null default 1,
  "created_by" text not null,
  "created_at" bigint not null,
  constraint "plan_prices_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "plan_prices_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "plan_prices_interval_check" check ("billing_interval" in ('MONTHLY', 'ANNUAL')),
  constraint "plan_prices_amount_check" check ("amount_minor" >= 0 and "setup_fee_minor" >= 0),
  constraint "plan_prices_tax_check" check ("tax_behaviour" in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')),
  constraint "plan_prices_range_check" check ("effective_to" is null or "effective_to" > "effective_from")
);

create table "price_quotes" (
  "id" text primary key not null,
  "customer_id" text not null,
  "plan_id" text not null,
  "billing_interval" text not null,
  "base_price_minor" bigint not null,
  "override_price_minor" bigint,
  "discount_total_minor" bigint not null default 0,
  "subtotal_minor" bigint not null,
  "tax_minor" bigint not null,
  "total_minor" bigint not null,
  "currency" text not null,
  "pricing_snapshot_json" text not null,
  "valid_until" bigint not null,
  "created_by" text not null,
  "created_at" bigint not null,
  constraint "price_quotes_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "price_quotes_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "price_quotes_interval_check" check ("billing_interval" in ('MONTHLY', 'ANNUAL')),
  constraint "price_quotes_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "price_quotes_amounts_check" check ("base_price_minor" >= 0 and ("override_price_minor" is null or "override_price_minor" >= 0) and "discount_total_minor" >= 0 and "subtotal_minor" >= 0 and "tax_minor" >= 0 and "total_minor" = "subtotal_minor" + "tax_minor"),
  constraint "price_quotes_validity_check" check ("valid_until" > "created_at")
);

create table "promotion_codes" (
  "id" text primary key not null,
  "discount_id" text not null,
  "code" text not null,
  "active" bigint not null default 1,
  "customer_id" text,
  "plan_id" text,
  "starts_at" bigint not null,
  "expires_at" bigint,
  "max_redemptions" bigint,
  "redemption_count" bigint not null default 0,
  "first_purchase_only" bigint not null default 0,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "promotion_codes_discount_id_discounts_id_fk" foreign key ("discount_id") references "discounts" ("id") on update no action on delete restrict,
  constraint "promotion_codes_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "promotion_codes_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "promotion_codes_normalised_check" check ("code" = upper("code") and length("code") between 3 and 64),
  constraint "promotion_codes_range_check" check ("expires_at" is null or "expires_at" > "starts_at"),
  constraint "promotion_codes_redemption_check" check ("redemption_count" >= 0 and ("max_redemptions" is null or ("max_redemptions" > 0 and "redemption_count" <= "max_redemptions"))),
  constraint "promotion_codes_timestamps_check" check ("updated_at" >= "created_at")
);

create table "role_permissions" (
  "role_id" text not null,
  "permission_id" text not null,
  "created_at" bigint not null,
  constraint "role_permissions_role_id_permission_id_pk" primary key ("role_id", "permission_id"),
  constraint "role_permissions_role_id_roles_id_fk" foreign key ("role_id") references "roles" ("id") on update no action on delete cascade,
  constraint "role_permissions_permission_id_permissions_id_fk" foreign key ("permission_id") references "permissions" ("id") on update no action on delete restrict
);

create table "service_credentials" (
  "id" text primary key not null,
  "name" text not null,
  "secret_hash" text not null,
  "scopes_json" text not null,
  "status" text not null default 'ACTIVE',
  "expires_at" bigint not null,
  "rotated_from_id" text,
  "created_by_admin_user_id" text not null,
  "last_used_at" bigint,
  "revoked_at" bigint,
  "revoked_by_admin_user_id" text,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "service_credentials_created_by_admin_user_id_admin_users_id_fk" foreign key ("created_by_admin_user_id") references "admin_users" ("id") on update no action on delete restrict,
  constraint "service_credentials_revoked_by_admin_user_id_admin_users_id_fk" foreign key ("revoked_by_admin_user_id") references "admin_users" ("id") on update no action on delete restrict,
  constraint "service_credentials_status_check" check ("status" in ('ACTIVE', 'REVOKED')),
  constraint "service_credentials_expiry_check" check ("expires_at" > "created_at"),
  constraint "service_credentials_revocation_check" check (("status" = 'ACTIVE' and "revoked_at" is null and "revoked_by_admin_user_id" is null) or ("status" = 'REVOKED' and "revoked_at" is not null and "revoked_by_admin_user_id" is not null)),
  constraint "service_credentials_timestamps_check" check ("updated_at" >= "created_at")
);

create table "subscriptions" (
  "id" text primary key not null,
  "customer_id" text not null,
  "plan_id" text not null,
  "status" text not null,
  "billing_interval" text not null,
  "currency" text not null,
  "started_at" bigint,
  "current_period_start" bigint,
  "current_period_end" bigint,
  "grace_period_ends_at" bigint,
  "service_extended_until" bigint,
  "cancel_at" bigint,
  "cancelled_at" bigint,
  "trial_ends_at" bigint,
  "external_billing_provider" text,
  "external_customer_id" text,
  "external_subscription_id" text,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "subscriptions_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "subscriptions_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "subscriptions_status_check" check ("status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED')),
  constraint "subscriptions_interval_check" check ("billing_interval" in ('MONTHLY', 'ANNUAL')),
  constraint "subscriptions_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "subscriptions_period_check" check (("current_period_start" is null and "current_period_end" is null) or ("current_period_start" is not null and "current_period_end" > "current_period_start")),
  constraint "subscriptions_trial_check" check ("status" <> 'TRIAL' or ("trial_ends_at" is not null and "trial_ends_at" > "created_at")),
  constraint "subscriptions_cancellation_check" check (("status" = 'CANCEL_AT_PERIOD_END' and "cancel_at" = "current_period_end" and "cancelled_at" is null) or ("status" = 'CANCELLED' and "cancelled_at" is not null) or ("status" not in ('CANCEL_AT_PERIOD_END', 'CANCELLED') and "cancel_at" is null and "cancelled_at" is null)),
  constraint "subscriptions_grace_check" check ("grace_period_ends_at" is null or "grace_period_ends_at" > "updated_at"),
  constraint "subscriptions_extension_check" check ("service_extended_until" is null or "service_extended_until" > "updated_at"),
  constraint "subscriptions_external_check" check (("external_billing_provider" is null and "external_customer_id" is null and "external_subscription_id" is null) or ("external_billing_provider" is not null and "external_customer_id" is not null)),
  constraint "subscriptions_version_check" check ("version" > 0),
  constraint "subscriptions_timestamps_check" check ("updated_at" >= "created_at")
);

create table "system_maintenance_runs" (
  "id" text primary key not null,
  "operation" text not null,
  "status" text not null,
  "requested_by_admin_user_id" text not null,
  "policy_snapshot_json" text not null,
  "summary_json" text,
  "failure_code" text,
  "started_at" bigint not null,
  "completed_at" bigint,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "system_maintenance_runs_requested_by_admin_user_id_admin_users_id_fk" foreign key ("requested_by_admin_user_id") references "admin_users" ("id") on update no action on delete restrict,
  constraint "system_maintenance_runs_operation_check" check ("operation" = 'RETENTION_AND_RECOVERY'),
  constraint "system_maintenance_runs_status_check" check ("status" in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  constraint "system_maintenance_runs_outcome_check" check (("status" = 'IN_PROGRESS' and "completed_at" is null and "summary_json" is null and "failure_code" is null) or ("status" = 'SUCCEEDED' and "completed_at" is not null and "summary_json" is not null and "failure_code" is null) or ("status" = 'FAILED' and "completed_at" is not null and "summary_json" is null and "failure_code" is not null)),
  constraint "system_maintenance_runs_timestamps_check" check ("updated_at" >= "created_at" and ("completed_at" is null or "completed_at" >= "started_at"))
);

create table "agent_provisioning_jobs" (
  "id" text primary key not null,
  "agent_link_id" text not null,
  "customer_id" text not null,
  "operation" text not null,
  "status" text not null,
  "idempotency_key" text not null,
  "attempt_count" bigint not null default 0,
  "max_attempts" bigint not null default 5,
  "next_attempt_at" bigint,
  "processing_started_at" bigint,
  "lease_expires_at" bigint,
  "error_category" text,
  "requested_at" bigint not null,
  "started_at" bigint,
  "completed_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "agent_provisioning_jobs_agent_link_id_agent_links_id_fk" foreign key ("agent_link_id") references "agent_links" ("id") on update no action on delete restrict,
  constraint "agent_provisioning_jobs_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "agent_provisioning_jobs_operation_check" check ("operation" in ('PROVISION', 'UPDATE', 'SUSPEND', 'RESUME')),
  constraint "agent_provisioning_jobs_status_check" check ("status" in ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  constraint "agent_provisioning_jobs_attempt_check" check ("attempt_count" >= 0 and "max_attempts" > 0 and "attempt_count" <= "max_attempts"),
  constraint "agent_provisioning_jobs_outcome_check" check (("status" = 'SUCCEEDED' and "completed_at" is not null and "error_category" is null) or ("status" = 'FAILED' and "completed_at" is not null and "error_category" is not null) or ("status" in ('PENDING', 'IN_PROGRESS', 'CANCELLED') and "completed_at" is null and "error_category" is null)),
  constraint "agent_provisioning_jobs_lease_check" check (("status" = 'IN_PROGRESS' and "processing_started_at" is not null and "lease_expires_at" is not null) or ("status" <> 'IN_PROGRESS' and "processing_started_at" is null and "lease_expires_at" is null)),
  constraint "agent_provisioning_jobs_version_check" check ("version" > 0),
  constraint "agent_provisioning_jobs_timestamps_check" check ("updated_at" >= "created_at")
);

create table "billing_checkout_sessions" (
  "id" text primary key not null,
  "customer_id" text not null,
  "subscription_id" text not null,
  "provider" text not null,
  "provider_session_id" text not null,
  "idempotency_key" text not null,
  "status" text not null default 'OPEN',
  "expires_at" bigint not null,
  "completed_at" bigint,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "billing_checkout_sessions_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "billing_checkout_sessions_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "billing_checkout_sessions_status_check" check ("status" in ('OPEN', 'COMPLETED', 'EXPIRED')),
  constraint "billing_checkout_sessions_outcome_check" check (("status" = 'COMPLETED' and "completed_at" is not null) or ("status" <> 'COMPLETED' and "completed_at" is null)),
  constraint "billing_checkout_sessions_expiry_check" check ("expires_at" > "created_at"),
  constraint "billing_checkout_sessions_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_discounts" (
  "id" text primary key not null,
  "customer_id" text not null,
  "discount_id" text not null,
  "subscription_id" text,
  "promotion_code_id" text,
  "source" text not null,
  "effective_from" bigint not null,
  "effective_to" bigint,
  "status" text not null,
  "applied_by" text not null,
  "reason" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "customer_discounts_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "customer_discounts_discount_id_discounts_id_fk" foreign key ("discount_id") references "discounts" ("id") on update no action on delete restrict,
  constraint "customer_discounts_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "customer_discounts_promotion_code_id_promotion_codes_id_fk" foreign key ("promotion_code_id") references "promotion_codes" ("id") on update no action on delete restrict,
  constraint "customer_discounts_source_check" check ("source" in ('ADMIN', 'PROMOTION_CODE', 'SALES', 'MIGRATION', 'SYSTEM')),
  constraint "customer_discounts_status_check" check ("status" in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
  constraint "customer_discounts_range_check" check ("effective_to" is null or "effective_to" > "effective_from"),
  constraint "customer_discounts_timestamps_check" check ("updated_at" >= "created_at")
);

create table "customer_identities" (
  "id" text primary key not null,
  "customer_id" text not null,
  "provider" text not null,
  "external_subject" text not null,
  "email" text not null,
  "accepted_invitation_id" text,
  "created_at" bigint not null,
  constraint "customer_identities_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete cascade,
  constraint "customer_identities_accepted_invitation_id_customer_invitations_id_fk" foreign key ("accepted_invitation_id") references "customer_invitations" ("id") on update no action on delete restrict
);

create table "invoices" (
  "id" text primary key not null,
  "customer_id" text not null,
  "subscription_id" text,
  "billing_account_id" text,
  "invoice_number" text not null,
  "provider_invoice_id" text,
  "status" text not null,
  "currency" text not null,
  "subtotal_minor" bigint not null,
  "tax_minor" bigint not null,
  "total_minor" bigint not null,
  "amount_due_minor" bigint not null,
  "issued_at" bigint,
  "due_at" bigint,
  "paid_at" bigint,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "invoices_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "invoices_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "invoices_billing_account_id_billing_accounts_id_fk" foreign key ("billing_account_id") references "billing_accounts" ("id") on update no action on delete restrict,
  constraint "invoices_status_check" check ("status" in ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')),
  constraint "invoices_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "invoices_amount_check" check ("subtotal_minor" >= 0 and "tax_minor" >= 0 and "total_minor" = "subtotal_minor" + "tax_minor" and "amount_due_minor" >= 0 and "amount_due_minor" <= "total_minor"),
  constraint "invoices_dates_check" check (("due_at" is null or "issued_at" is not null) and ("due_at" is null or "due_at" >= "issued_at") and (("status" = 'PAID' and "paid_at" is not null) or ("status" <> 'PAID' and "paid_at" is null))),
  constraint "invoices_timestamps_check" check ("updated_at" >= "created_at")
);

create table "notification_delivery_attempts" (
  "id" text primary key not null,
  "delivery_id" text not null,
  "attempt_number" bigint not null,
  "provider" text not null,
  "status" text not null,
  "provider_reference" text,
  "error_category" text,
  "started_at" bigint not null,
  "completed_at" bigint,
  "created_at" bigint not null,
  constraint "notification_delivery_attempts_delivery_id_notification_deliveries_id_fk" foreign key ("delivery_id") references "notification_deliveries" ("id") on update no action on delete restrict,
  constraint "notification_delivery_attempts_number_check" check ("attempt_number" > 0),
  constraint "notification_delivery_attempts_status_check" check ("status" in ('PROCESSING', 'SENT', 'FAILED')),
  constraint "notification_delivery_attempts_outcome_check" check (("status" = 'PROCESSING' and "completed_at" is null and "provider_reference" is null and "error_category" is null) or ("status" = 'SENT' and "completed_at" is not null and "provider_reference" is not null and "error_category" is null) or ("status" = 'FAILED' and "completed_at" is not null and "provider_reference" is null and "error_category" is not null))
);

create table "onboarding_tasks" (
  "id" text primary key not null,
  "onboarding_case_id" text not null,
  "code" text not null,
  "title" text not null,
  "description" text,
  "owner_type" text not null,
  "status" text not null,
  "required" bigint not null default 1,
  "due_at" bigint,
  "blocked_reason" text,
  "sort_order" bigint not null default 0,
  "completed_at" bigint,
  "version" bigint not null default 1,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "onboarding_tasks_onboarding_case_id_onboarding_cases_id_fk" foreign key ("onboarding_case_id") references "onboarding_cases" ("id") on update no action on delete cascade,
  constraint "onboarding_tasks_code_check" check ("code" = lower("code")),
  constraint "onboarding_tasks_owner_check" check ("owner_type" in ('CUSTOMER', 'INTERNAL')),
  constraint "onboarding_tasks_status_check" check ("status" in ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED', 'CANCELLED')),
  constraint "onboarding_tasks_order_check" check ("sort_order" >= 0),
  constraint "onboarding_tasks_version_check" check ("version" > 0),
  constraint "onboarding_tasks_completion_check" check (("status" = 'DONE' and "completed_at" is not null) or ("status" <> 'DONE' and "completed_at" is null)),
  constraint "onboarding_tasks_blocked_check" check (("status" = 'BLOCKED' and "blocked_reason" is not null) or ("status" <> 'BLOCKED' and "blocked_reason" is null)),
  constraint "onboarding_tasks_timestamps_check" check ("updated_at" >= "created_at")
);

create table "service_rate_limits" (
  "credential_id" text not null,
  "window_started_at" bigint not null,
  "request_count" bigint not null default 1,
  "updated_at" bigint not null,
  constraint "service_rate_limits_credential_id_window_started_at_pk" primary key ("credential_id", "window_started_at"),
  constraint "service_rate_limits_credential_id_service_credentials_id_fk" foreign key ("credential_id") references "service_credentials" ("id") on update no action on delete cascade,
  constraint "service_rate_limits_count_check" check ("request_count" > 0),
  constraint "service_rate_limits_timestamps_check" check ("updated_at" >= "window_started_at")
);

create table "subscription_entitlements" (
  "id" text primary key not null,
  "subscription_id" text not null,
  "offering_code" text not null,
  "enabled" bigint not null,
  "limit_value" bigint,
  "limit_unit" text,
  "effective_from" bigint not null,
  "effective_to" bigint,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "subscription_entitlements_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "subscription_entitlements_code_check" check ("offering_code" = lower("offering_code")),
  constraint "subscription_entitlements_limit_check" check (("limit_value" is null and "limit_unit" is null) or ("limit_value" >= 0 and "limit_unit" is not null)),
  constraint "subscription_entitlements_range_check" check ("effective_to" is null or "effective_to" > "effective_from"),
  constraint "subscription_entitlements_timestamps_check" check ("updated_at" >= "created_at")
);

create table "subscription_prices" (
  "id" text primary key not null,
  "subscription_id" text not null,
  "base_amount_minor" bigint not null,
  "effective_amount_minor" bigint not null,
  "setup_fee_minor" bigint not null default 0,
  "discount_total_minor" bigint not null default 0,
  "currency" text not null,
  "tax_behaviour" text not null,
  "effective_from" bigint not null,
  "effective_to" bigint,
  "pricing_source" text not null,
  "pricing_snapshot_json" text not null,
  "created_at" bigint not null,
  constraint "subscription_prices_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "subscription_prices_amount_check" check ("base_amount_minor" >= 0 and "effective_amount_minor" >= 0 and "setup_fee_minor" >= 0 and "discount_total_minor" >= 0),
  constraint "subscription_prices_currency_check" check (length("currency") = 3 and "currency" = upper("currency")),
  constraint "subscription_prices_tax_check" check ("tax_behaviour" in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')),
  constraint "subscription_prices_source_check" check ("pricing_source" in ('QUOTE', 'RESOLVED', 'MANUAL', 'RENEWAL')),
  constraint "subscription_prices_range_check" check ("effective_to" is null or "effective_to" > "effective_from")
);

create table "agent_provisioning_attempts" (
  "id" text primary key not null,
  "job_id" text not null,
  "attempt_number" bigint not null,
  "provider" text not null,
  "status" text not null,
  "provider_reference" text,
  "error_category" text,
  "retryable" bigint not null default 0,
  "started_at" bigint not null,
  "completed_at" bigint,
  "created_at" bigint not null,
  constraint "agent_provisioning_attempts_job_id_agent_provisioning_jobs_id_fk" foreign key ("job_id") references "agent_provisioning_jobs" ("id") on update no action on delete restrict,
  constraint "agent_provisioning_attempts_number_check" check ("attempt_number" > 0),
  constraint "agent_provisioning_attempts_status_check" check ("status" in ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  constraint "agent_provisioning_attempts_outcome_check" check (("status" = 'PROCESSING' and "completed_at" is null and "provider_reference" is null and "error_category" is null and "retryable" = 0) or ("status" = 'SUCCEEDED' and "completed_at" is not null and "error_category" is null and "retryable" = 0) or ("status" = 'FAILED' and "completed_at" is not null and "provider_reference" is null and "error_category" is not null))
);

create table "billing_notes" (
  "id" text primary key not null,
  "customer_id" text not null,
  "subscription_id" text,
  "invoice_id" text,
  "body" text not null,
  "author_admin_user_id" text not null,
  "created_at" bigint not null,
  constraint "billing_notes_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "billing_notes_subscription_id_subscriptions_id_fk" foreign key ("subscription_id") references "subscriptions" ("id") on update no action on delete restrict,
  constraint "billing_notes_invoice_id_invoices_id_fk" foreign key ("invoice_id") references "invoices" ("id") on update no action on delete restrict,
  constraint "billing_notes_author_admin_user_id_admin_users_id_fk" foreign key ("author_admin_user_id") references "admin_users" ("id") on update no action on delete restrict,
  constraint "billing_notes_body_check" check (length(trim("body")) between 1 and 4000)
);

create table "billing_provider_price_references" (
  "id" text primary key not null,
  "provider" text not null,
  "subscription_price_id" text not null,
  "provider_product_id" text not null,
  "provider_price_id" text not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "billing_provider_price_references_subscription_price_id_subscription_prices_id_fk" foreign key ("subscription_price_id") references "subscription_prices" ("id") on update no action on delete restrict,
  constraint "billing_provider_prices_provider_check" check ("provider" = lower("provider") and length(trim("provider")) between 1 and 80),
  constraint "billing_provider_prices_timestamps_check" check ("updated_at" >= "created_at")
);

create table "discount_redemptions" (
  "id" text primary key not null,
  "discount_id" text not null,
  "promotion_code_id" text,
  "customer_discount_id" text not null,
  "customer_id" text not null,
  "plan_id" text not null,
  "redemption_type" text not null,
  "idempotency_key" text not null,
  "amount_discounted_minor" bigint not null default 0,
  "currency" text not null,
  "redeemed_at" bigint not null,
  constraint "discount_redemptions_discount_id_discounts_id_fk" foreign key ("discount_id") references "discounts" ("id") on update no action on delete restrict,
  constraint "discount_redemptions_promotion_code_id_promotion_codes_id_fk" foreign key ("promotion_code_id") references "promotion_codes" ("id") on update no action on delete restrict,
  constraint "discount_redemptions_customer_discount_id_customer_discounts_id_fk" foreign key ("customer_discount_id") references "customer_discounts" ("id") on update no action on delete restrict,
  constraint "discount_redemptions_customer_id_customers_id_fk" foreign key ("customer_id") references "customers" ("id") on update no action on delete restrict,
  constraint "discount_redemptions_plan_id_plans_id_fk" foreign key ("plan_id") references "plans" ("id") on update no action on delete restrict,
  constraint "discount_redemptions_type_check" check ("redemption_type" in ('PROMOTION_CLAIM', 'CHARGE_APPLICATION')),
  constraint "discount_redemptions_amount_check" check ("amount_discounted_minor" >= 0 and length("currency") = 3 and "currency" = upper("currency")),
  constraint "discount_redemptions_claim_check" check (("redemption_type" = 'PROMOTION_CLAIM' and "promotion_code_id" is not null and "amount_discounted_minor" = 0) or ("redemption_type" = 'CHARGE_APPLICATION' and "amount_discounted_minor" > 0))
);

create table "invoice_lines" (
  "id" text primary key not null,
  "invoice_id" text not null,
  "description" text not null,
  "quantity" bigint not null,
  "unit_amount_minor" bigint not null,
  "subtotal_minor" bigint not null,
  "tax_minor" bigint not null,
  "total_minor" bigint not null,
  "created_at" bigint not null,
  constraint "invoice_lines_invoice_id_invoices_id_fk" foreign key ("invoice_id") references "invoices" ("id") on update no action on delete restrict,
  constraint "invoice_lines_amount_check" check ("quantity" > 0 and "unit_amount_minor" >= 0 and "subtotal_minor" = "quantity" * "unit_amount_minor" and "tax_minor" >= 0 and "total_minor" = "subtotal_minor" + "tax_minor")
);

create table "onboarding_task_dependencies" (
  "task_id" text not null,
  "depends_on_task_id" text not null,
  "created_at" bigint not null,
  constraint "onboarding_task_dependencies_task_id_depends_on_task_id_pk" primary key ("task_id", "depends_on_task_id"),
  constraint "onboarding_task_dependencies_task_id_onboarding_tasks_id_fk" foreign key ("task_id") references "onboarding_tasks" ("id") on update no action on delete cascade,
  constraint "onboarding_task_dependencies_depends_on_task_id_onboarding_tasks_id_fk" foreign key ("depends_on_task_id") references "onboarding_tasks" ("id") on update no action on delete cascade,
  constraint "onboarding_task_dependencies_not_self_check" check ("task_id" <> "depends_on_task_id")
);

create table "payment_reminders" (
  "id" text primary key not null,
  "invoice_id" text not null,
  "stage" text not null,
  "status" text not null,
  "idempotency_key" text not null,
  "scheduled_for" bigint not null,
  "sent_at" bigint,
  "failure_code" text,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "payment_reminders_invoice_id_invoices_id_fk" foreign key ("invoice_id") references "invoices" ("id") on update no action on delete restrict,
  constraint "payment_reminders_stage_check" check ("stage" in ('BEFORE_DUE', 'DUE', 'OVERDUE_1', 'OVERDUE_2', 'FINAL')),
  constraint "payment_reminders_status_check" check ("status" in ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED')),
  constraint "payment_reminders_outcome_check" check (("status" = 'SENT' and "sent_at" is not null and "failure_code" is null) or ("status" = 'FAILED' and "sent_at" is null and "failure_code" is not null) or ("status" in ('SCHEDULED', 'CANCELLED') and "sent_at" is null and "failure_code" is null)),
  constraint "payment_reminders_timestamps_check" check ("updated_at" >= "created_at")
);

create unique index "admin_users_provider_subject_uq" on "admin_users" ("identity_provider", "external_subject");
create unique index "admin_users_email_uq" on "admin_users" ("email");
create unique index "admin_users_bootstrap_uq" on "admin_users" ("bootstrap") where "bootstrap" = 1;
create index "admin_users_status_idx" on "admin_users" ("status");
create index "api_rate_limits_window_idx" on "api_rate_limits" ("window_started_at");
create index "audit_events_entity_created_idx" on "audit_events" ("entity_type", "entity_id", "created_at");
create index "audit_events_action_created_idx" on "audit_events" ("action", "created_at");
create index "audit_events_actor_created_idx" on "audit_events" ("actor_type", "actor_id", "created_at");
create index "audit_events_created_at_idx" on "audit_events" ("created_at");
create index "audit_events_created_id_idx" on "audit_events" ("created_at", "id");
create index "audit_events_request_idx" on "audit_events" ("request_id");
create unique index "billing_webhook_events_provider_event_uq" on "billing_webhook_events" ("provider", "provider_event_id");
create index "billing_webhook_events_ready_idx" on "billing_webhook_events" ("status", "next_attempt_at");
create index "billing_webhook_events_provider_occurred_idx" on "billing_webhook_events" ("provider", "occurred_at");
create unique index "customers_external_reference_uq" on "customers" ("external_reference");
create unique index "customers_email_uq" on "customers" ("email");
create index "customers_status_idx" on "customers" ("status");
create index "customers_created_id_idx" on "customers" ("created_at", "id");
create index "customers_status_created_id_idx" on "customers" ("status", "created_at", "id");
create unique index "discounts_code_uq" on "discounts" ("code");
create index "discounts_effective_lookup_idx" on "discounts" ("active", "starts_at", "ends_at");
create index "discounts_active_created_id_idx" on "discounts" ("active", "created_at", "id");
create unique index "idempotency_keys_scope_key_uq" on "idempotency_keys" ("scope", "key");
create index "idempotency_keys_expiry_idx" on "idempotency_keys" ("expires_at");
create unique index "notification_templates_code_channel_version_uq" on "notification_templates" ("code", "channel", "version");
create unique index "notification_templates_active_code_channel_uq" on "notification_templates" ("code", "channel") where "active" = 1;
create unique index "offerings_code_uq" on "offerings" ("code");
create index "offerings_active_order_idx" on "offerings" ("active", "display_order");
create unique index "permissions_code_uq" on "permissions" ("code");
create unique index "plans_code_uq" on "plans" ("code");
create index "plans_active_order_idx" on "plans" ("active", "display_order");
create unique index "roles_code_uq" on "roles" ("code");
create index "admin_user_roles_role_idx" on "admin_user_roles" ("role_id");
create unique index "agent_links_customer_platform_uq" on "agent_links" ("customer_id", "agent_platform");
create unique index "agent_links_platform_external_uq" on "agent_links" ("agent_platform", "external_agent_id") where "external_agent_id" is not null;
create index "agent_links_status_idx" on "agent_links" ("status");
create unique index "billing_accounts_customer_provider_uq" on "billing_accounts" ("customer_id", "provider");
create unique index "billing_accounts_provider_reference_uq" on "billing_accounts" ("provider", "provider_customer_id");
create index "billing_accounts_customer_status_idx" on "billing_accounts" ("customer_id", "status");
create unique index "customer_billing_profiles_customer_uq" on "customer_billing_profiles" ("customer_id");
create unique index "customer_business_profiles_customer_uq" on "customer_business_profiles" ("customer_id");
create unique index "customer_integrations_customer_code_uq" on "customer_integrations" ("customer_id", "integration_code");
create index "customer_integrations_customer_status_idx" on "customer_integrations" ("customer_id", "status");
create index "customer_integrations_category_status_idx" on "customer_integrations" ("category", "status");
create unique index "customer_invitations_token_hash_uq" on "customer_invitations" ("token_hash");
create index "customer_invitations_email_status_idx" on "customer_invitations" ("email", "status");
create index "customer_invitations_customer_idx" on "customer_invitations" ("customer_id");
create index "customer_notes_customer_created_idx" on "customer_notes" ("customer_id", "created_at");
create unique index "customer_price_overrides_scope_start_uq" on "customer_price_overrides" ("customer_id", "plan_id", "billing_interval", "effective_from");
create index "customer_price_overrides_effective_lookup_idx" on "customer_price_overrides" ("customer_id", "plan_id", "billing_interval", "status", "effective_from", "effective_to");
create index "customer_price_overrides_plan_idx" on "customer_price_overrides" ("plan_id");
create unique index "notification_deliveries_idempotency_uq" on "notification_deliveries" ("idempotency_key");
create index "notification_deliveries_retry_idx" on "notification_deliveries" ("status", "next_attempt_at", "scheduled_for");
create index "notification_deliveries_lease_idx" on "notification_deliveries" ("status", "lease_expires_at");
create index "notification_deliveries_customer_created_idx" on "notification_deliveries" ("customer_id", "created_at");
create index "notification_deliveries_recipient_status_idx" on "notification_deliveries" ("recipient_type", "recipient_id", "status");
create index "notification_deliveries_created_id_idx" on "notification_deliveries" ("created_at", "id");
create index "notification_deliveries_status_created_id_idx" on "notification_deliveries" ("status", "created_at", "id");
create unique index "notification_preferences_customer_code_channel_uq" on "notification_preferences" ("customer_id", "notification_code", "channel");
create index "notification_preferences_customer_idx" on "notification_preferences" ("customer_id");
create unique index "onboarding_cases_current_customer_uq" on "onboarding_cases" ("customer_id") where "status" in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY');
create index "onboarding_cases_customer_status_idx" on "onboarding_cases" ("customer_id", "status");
create index "onboarding_cases_status_updated_idx" on "onboarding_cases" ("status", "updated_at");
create unique index "operational_queue_items_open_source_uq" on "operational_queue_items" ("queue_type", "source_type", "source_id") where "status" in ('OPEN', 'CLAIMED');
create index "operational_queue_items_work_idx" on "operational_queue_items" ("queue_type", "status", "priority", "available_at");
create index "operational_queue_items_customer_status_idx" on "operational_queue_items" ("customer_id", "status");
create index "operational_queue_items_assignee_status_idx" on "operational_queue_items" ("assigned_to_admin_user_id", "status");
create unique index "plan_features_plan_offering_uq" on "plan_features" ("plan_id", "offering_id");
create index "plan_features_offering_idx" on "plan_features" ("offering_id");
create unique index "plan_prices_scope_start_uq" on "plan_prices" ("plan_id", "billing_interval", "effective_from");
create index "plan_prices_effective_lookup_idx" on "plan_prices" ("plan_id", "billing_interval", "active", "effective_from", "effective_to");
create index "price_quotes_customer_created_idx" on "price_quotes" ("customer_id", "created_at");
create index "price_quotes_plan_created_idx" on "price_quotes" ("plan_id", "created_at");
create unique index "promotion_codes_code_uq" on "promotion_codes" ("code");
create index "promotion_codes_discount_idx" on "promotion_codes" ("discount_id");
create index "promotion_codes_effective_lookup_idx" on "promotion_codes" ("active", "starts_at", "expires_at");
create index "promotion_codes_active_created_id_idx" on "promotion_codes" ("active", "created_at", "id");
create index "role_permissions_permission_idx" on "role_permissions" ("permission_id");
create unique index "service_credentials_secret_hash_uq" on "service_credentials" ("secret_hash");
create index "service_credentials_status_expiry_idx" on "service_credentials" ("status", "expires_at");
create index "service_credentials_rotated_from_idx" on "service_credentials" ("rotated_from_id");
create unique index "subscriptions_current_customer_uq" on "subscriptions" ("customer_id") where "status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END');
create unique index "subscriptions_provider_reference_uq" on "subscriptions" ("external_billing_provider", "external_subscription_id");
create index "subscriptions_customer_status_idx" on "subscriptions" ("customer_id", "status");
create index "subscriptions_status_period_idx" on "subscriptions" ("status", "current_period_end");
create index "subscriptions_created_id_idx" on "subscriptions" ("created_at", "id");
create index "subscriptions_status_created_id_idx" on "subscriptions" ("status", "created_at", "id");
create unique index "system_maintenance_runs_active_operation_uq" on "system_maintenance_runs" ("operation") where "status" = 'IN_PROGRESS';
create index "system_maintenance_runs_status_created_idx" on "system_maintenance_runs" ("status", "created_at");
create unique index "agent_provisioning_jobs_idempotency_uq" on "agent_provisioning_jobs" ("idempotency_key");
create index "agent_provisioning_jobs_link_status_idx" on "agent_provisioning_jobs" ("agent_link_id", "status", "next_attempt_at");
create index "agent_provisioning_jobs_customer_status_idx" on "agent_provisioning_jobs" ("customer_id", "status");
create index "agent_provisioning_jobs_lease_idx" on "agent_provisioning_jobs" ("status", "lease_expires_at");
create unique index "billing_checkout_sessions_provider_reference_uq" on "billing_checkout_sessions" ("provider", "provider_session_id");
create unique index "billing_checkout_sessions_idempotency_uq" on "billing_checkout_sessions" ("customer_id", "idempotency_key");
create index "billing_checkout_sessions_subscription_status_idx" on "billing_checkout_sessions" ("subscription_id", "status");
create index "customer_discounts_effective_lookup_idx" on "customer_discounts" ("customer_id", "status", "effective_from", "effective_to");
create index "customer_discounts_discount_idx" on "customer_discounts" ("discount_id");
create index "customer_discounts_subscription_idx" on "customer_discounts" ("subscription_id");
create index "customer_discounts_promotion_idx" on "customer_discounts" ("promotion_code_id");
create unique index "customer_identities_provider_subject_uq" on "customer_identities" ("provider", "external_subject");
create unique index "customer_identities_invitation_uq" on "customer_identities" ("accepted_invitation_id");
create index "customer_identities_customer_idx" on "customer_identities" ("customer_id");
create index "customer_identities_email_idx" on "customer_identities" ("email");
create unique index "invoices_number_uq" on "invoices" ("invoice_number");
create unique index "invoices_provider_reference_uq" on "invoices" ("provider_invoice_id");
create index "invoices_customer_created_idx" on "invoices" ("customer_id", "created_at");
create index "invoices_subscription_created_idx" on "invoices" ("subscription_id", "created_at");
create index "invoices_status_due_idx" on "invoices" ("status", "due_at");
create index "invoices_created_id_idx" on "invoices" ("created_at", "id");
create index "invoices_status_created_id_idx" on "invoices" ("status", "created_at", "id");
create unique index "notification_delivery_attempts_delivery_number_uq" on "notification_delivery_attempts" ("delivery_id", "attempt_number");
create index "notification_delivery_attempts_delivery_created_idx" on "notification_delivery_attempts" ("delivery_id", "created_at");
create index "notification_delivery_attempts_status_created_idx" on "notification_delivery_attempts" ("status", "created_at");
create unique index "onboarding_tasks_case_code_uq" on "onboarding_tasks" ("onboarding_case_id", "code");
create index "onboarding_tasks_case_owner_status_idx" on "onboarding_tasks" ("onboarding_case_id", "owner_type", "status");
create index "onboarding_tasks_status_due_idx" on "onboarding_tasks" ("status", "due_at");
create index "service_rate_limits_window_idx" on "service_rate_limits" ("window_started_at");
create unique index "subscription_entitlements_scope_start_uq" on "subscription_entitlements" ("subscription_id", "offering_code", "effective_from");
create index "subscription_entitlements_effective_lookup_idx" on "subscription_entitlements" ("subscription_id", "effective_from", "effective_to");
create unique index "subscription_prices_scope_start_uq" on "subscription_prices" ("subscription_id", "effective_from");
create index "subscription_prices_effective_lookup_idx" on "subscription_prices" ("subscription_id", "effective_from", "effective_to");
create unique index "agent_provisioning_attempts_job_number_uq" on "agent_provisioning_attempts" ("job_id", "attempt_number");
create index "agent_provisioning_attempts_job_created_idx" on "agent_provisioning_attempts" ("job_id", "created_at");
create index "agent_provisioning_attempts_status_created_idx" on "agent_provisioning_attempts" ("status", "created_at");
create index "billing_notes_customer_created_idx" on "billing_notes" ("customer_id", "created_at");
create index "billing_notes_subscription_idx" on "billing_notes" ("subscription_id");
create index "billing_notes_invoice_idx" on "billing_notes" ("invoice_id");
create unique index "billing_provider_prices_scope_uq" on "billing_provider_price_references" ("provider", "subscription_price_id");
create unique index "billing_provider_prices_reference_uq" on "billing_provider_price_references" ("provider", "provider_price_id");
create unique index "discount_redemptions_idempotency_uq" on "discount_redemptions" ("idempotency_key");
create index "discount_redemptions_promotion_idx" on "discount_redemptions" ("promotion_code_id", "redeemed_at");
create index "discount_redemptions_discount_idx" on "discount_redemptions" ("discount_id", "redeemed_at");
create index "discount_redemptions_customer_idx" on "discount_redemptions" ("customer_id", "redeemed_at");
create index "invoice_lines_invoice_idx" on "invoice_lines" ("invoice_id");
create index "onboarding_task_dependencies_dependency_idx" on "onboarding_task_dependencies" ("depends_on_task_id");
create unique index "payment_reminders_idempotency_uq" on "payment_reminders" ("idempotency_key");
create unique index "payment_reminders_invoice_stage_uq" on "payment_reminders" ("invoice_id", "stage");
create index "payment_reminders_status_schedule_idx" on "payment_reminders" ("status", "scheduled_for");

-- System vocabulary and notification templates copied from the D1 lineage.
INSERT INTO "roles" ("id", "code", "name", "description", "system", "created_at", "updated_at") VALUES
	('role_super_admin', 'SUPER_ADMIN', 'Super administrator', 'Full platform administration including administrator access management.', 1, 1787530000000, 1787530000000),
	('role_admin', 'ADMIN', 'Administrator', 'Broad operational administration excluding administrator access management.', 1, 1787530000000, 1787530000000),
	('role_sales', 'SALES', 'Sales', 'Customer, commercial pricing, discount and subscription sales operations.', 1, 1787530000000, 1787530000000),
	('role_support', 'SUPPORT', 'Support', 'Customer support, subscription visibility and agent-link operations.', 1, 1787530000000, 1787530000000),
	('role_read_only', 'READ_ONLY', 'Read only', 'Read-only commercial and audit visibility.', 1, 1787530000000, 1787530000000);
INSERT INTO "permissions" ("id", "code", "name", "description", "created_at") VALUES
	('permission_customer_read', 'CUSTOMER_READ', 'Read customers', 'View customer records and account state.', 1787530000000),
	('permission_customer_write', 'CUSTOMER_WRITE', 'Manage customers', 'Create and change customer records.', 1787530000000),
	('permission_catalog_read', 'CATALOG_READ', 'Read catalogue', 'View offerings, plans and plan features.', 1787530000000),
	('permission_catalog_write', 'CATALOG_WRITE', 'Manage catalogue', 'Create and change offerings, plans and plan features.', 1787530000000),
	('permission_price_read', 'PRICE_READ', 'Read pricing', 'View public and customer-specific pricing.', 1787530000000),
	('permission_price_write', 'PRICE_WRITE', 'Manage pricing', 'Publish price versions and customer overrides.', 1787530000000),
	('permission_discount_read', 'DISCOUNT_READ', 'Read discounts', 'View discounts and promotion codes.', 1787530000000),
	('permission_discount_write', 'DISCOUNT_WRITE', 'Manage discounts', 'Create and apply discounts and promotion codes.', 1787530000000),
	('permission_subscription_read', 'SUBSCRIPTION_READ', 'Read subscriptions', 'View subscriptions and entitlements.', 1787530000000),
	('permission_subscription_write', 'SUBSCRIPTION_WRITE', 'Manage subscriptions', 'Create and transition subscriptions and entitlements.', 1787530000000),
	('permission_billing_read', 'BILLING_READ', 'Read billing', 'View billing accounts, invoices and reminders.', 1787530000000),
	('permission_billing_write', 'BILLING_WRITE', 'Manage billing', 'Create and transition billing records and reminders.', 1787530000000),
	('permission_agent_link_read', 'AGENT_LINK_READ', 'Read agent links', 'View customer agent provisioning links.', 1787530000000),
	('permission_agent_link_write', 'AGENT_LINK_WRITE', 'Manage agent links', 'Create and transition customer agent links.', 1787530000000),
	('permission_admin_user_manage', 'ADMIN_USER_MANAGE', 'Manage administrators', 'Provision administrators and manage their roles and status.', 1787530000000),
	('permission_audit_read', 'AUDIT_READ', 'Read audit history', 'View immutable commercial and security audit events.', 1787530000000);
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT "roles"."id", "permissions"."id", 1787530000000
FROM "roles" CROSS JOIN "permissions"
WHERE "roles"."code" = 'SUPER_ADMIN'
	OR ("roles"."code" = 'ADMIN' AND "permissions"."code" <> 'ADMIN_USER_MANAGE')
	OR ("roles"."code" = 'SALES' AND "permissions"."code" IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'CATALOG_READ', 'PRICE_READ', 'PRICE_WRITE', 'DISCOUNT_READ', 'DISCOUNT_WRITE', 'SUBSCRIPTION_READ', 'SUBSCRIPTION_WRITE', 'BILLING_READ'))
	OR ("roles"."code" = 'SUPPORT' AND "permissions"."code" IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'CATALOG_READ', 'PRICE_READ', 'DISCOUNT_READ', 'SUBSCRIPTION_READ', 'BILLING_READ', 'AGENT_LINK_READ', 'AGENT_LINK_WRITE'))
	OR ("roles"."code" = 'READ_ONLY' AND "permissions"."code" IN ('CUSTOMER_READ', 'CATALOG_READ', 'PRICE_READ', 'DISCOUNT_READ', 'SUBSCRIPTION_READ', 'BILLING_READ', 'AGENT_LINK_READ', 'AUDIT_READ'));
INSERT INTO "notification_templates" ("id","code","channel","version","subject_template","body_template","required_service_notice","active","created_at","updated_at") VALUES
('12000000-0000-4000-8000-000000000001','welcome','EMAIL',1,'Welcome to Zuno Pixel','Hi {{name}}, welcome to Zuno Pixel. We are ready to help {{business}} get started.',0,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000002','customer_action_required','EMAIL',1,'Action required: {{task}}','Hi {{name}}, please complete {{task}}. Due date: {{due_date}}.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000003','customer_action_required','IN_APP',1,NULL,'Action required: {{task}}. Due date: {{due_date}}.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000004','onboarding_reminder','EMAIL',1,'Your Zuno Pixel onboarding','Hi {{name}}, your onboarding is currently {{status}}. We are here if you need help.',0,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000005','payment_reminder','EMAIL',1,'Payment reminder for {{invoice}}','Hi {{name}}, {{invoice}} has {{amount}} outstanding. Reminder stage: {{stage}}.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000006','payment_overdue','EMAIL',1,'Payment overdue for {{invoice}}','Hi {{name}}, {{invoice}} for {{amount}} was due on {{due_date}}. Please contact us if you need help.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000007','subscription_activated','EMAIL',1,'Your Zuno Pixel subscription is active','Hi {{name}}, your Zuno Pixel subscription is now active.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000008','subscription_suspended','EMAIL',1,'Your Zuno Pixel subscription is suspended','Hi {{name}}, your Zuno Pixel subscription has been suspended. Contact us for assistance.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000009','subscription_resumed','EMAIL',1,'Your Zuno Pixel subscription has resumed','Hi {{name}}, your Zuno Pixel subscription and service access have resumed.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000010','subscription_cancelled','EMAIL',1,'Your Zuno Pixel subscription is cancelled','Hi {{name}}, your Zuno Pixel subscription has been cancelled. Your account history remains available.',1,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000011','discount_expiring','EMAIL',1,'Your Zuno Pixel discount is ending','Hi {{name}}, your discount is scheduled to end on {{expiry_date}}.',0,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000012','agent_ready','EMAIL',1,'Your Zuno Pixel agent is ready','Hi {{name}}, your {{platform}} agent is ready.',0,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000013','agent_ready','IN_APP',1,NULL,'Your {{platform}} agent is ready.',0,1,1787577001094,1787577001094),
('12000000-0000-4000-8000-000000000014','integration_action_required','EMAIL',1,'Action required for {{integration}}','Hi {{name}}, your {{integration}} integration is {{status}} and needs attention.',1,1,1787577001094,1787577001094);
INSERT INTO "permissions" ("id","code","name","description","created_at") VALUES
('permission_operations_read','OPERATIONS_READ','Read operations','View operational work queues and notification delivery state.',1787577001094),
('permission_operations_write','OPERATIONS_WRITE','Manage operations','Reconcile, claim and resolve operational work and notification requests.',1787577001094);
INSERT INTO "role_permissions" ("role_id","permission_id","created_at")
SELECT "roles"."id","permissions"."id",1787577001094
FROM "roles" CROSS JOIN "permissions"
WHERE "permissions"."code" IN ('OPERATIONS_READ','OPERATIONS_WRITE')
AND (
  "roles"."code" IN ('SUPER_ADMIN','ADMIN','SALES','SUPPORT')
  OR ("roles"."code" = 'READ_ONLY' AND "permissions"."code" = 'OPERATIONS_READ')
);

-- PostgreSQL equivalents for the cross-row and immutable-history guarantees
-- that SQLite implements with D1 triggers.

create or replace function zuno_prevent_change() returns trigger language plpgsql as $$
begin
  raise exception '%', TG_ARGV[0] using errcode = 'integrity_constraint_violation';
end;
$$;

create or replace function zuno_require_version_step() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then
    raise exception '%', TG_ARGV[0] using errcode = 'serialization_failure';
  end if;
  return new;
end;
$$;

create trigger audit_events_immutable_update before update on audit_events for each row execute function zuno_prevent_change('AUDIT_EVENTS_IMMUTABLE');
create trigger audit_events_immutable_delete before delete on audit_events for each row execute function zuno_prevent_change('AUDIT_EVENTS_IMMUTABLE');
create trigger price_quotes_immutable_update before update on price_quotes for each row execute function zuno_prevent_change('PRICE_QUOTE_IMMUTABLE');
create trigger price_quotes_immutable_delete before delete on price_quotes for each row execute function zuno_prevent_change('PRICE_QUOTE_IMMUTABLE');
create trigger discount_redemptions_immutable_update before update on discount_redemptions for each row execute function zuno_prevent_change('DISCOUNT_REDEMPTION_IMMUTABLE');
create trigger discount_redemptions_immutable_delete before delete on discount_redemptions for each row execute function zuno_prevent_change('DISCOUNT_REDEMPTION_IMMUTABLE');
create trigger invoice_lines_immutable_update before update on invoice_lines for each row execute function zuno_prevent_change('INVOICE_LINES_IMMUTABLE');
create trigger invoice_lines_immutable_delete before delete on invoice_lines for each row execute function zuno_prevent_change('INVOICE_LINES_IMMUTABLE');
create trigger notification_attempts_immutable_delete before delete on notification_delivery_attempts for each row execute function zuno_prevent_change('NOTIFICATION_ATTEMPT_IMMUTABLE');
create trigger agent_attempts_immutable_delete before delete on agent_provisioning_attempts for each row execute function zuno_prevent_change('AGENT_ATTEMPT_IMMUTABLE');

create trigger subscriptions_version before update on subscriptions for each row execute function zuno_require_version_step('SUBSCRIPTION_VERSION_CONFLICT');
create trigger onboarding_cases_version before update on onboarding_cases for each row execute function zuno_require_version_step('ONBOARDING_VERSION_CONFLICT');
create trigger onboarding_tasks_version before update on onboarding_tasks for each row execute function zuno_require_version_step('ONBOARDING_TASK_VERSION_CONFLICT');
create trigger customer_integrations_version before update on customer_integrations for each row execute function zuno_require_version_step('INTEGRATION_VERSION_CONFLICT');
create trigger agent_links_version before update on agent_links for each row execute function zuno_require_version_step('AGENT_LINK_VERSION_CONFLICT');
create trigger agent_jobs_version before update on agent_provisioning_jobs for each row execute function zuno_require_version_step('AGENT_JOB_VERSION_CONFLICT');
create trigger queue_items_version before update on operational_queue_items for each row execute function zuno_require_version_step('QUEUE_VERSION_CONFLICT');
create trigger notification_deliveries_version before update on notification_deliveries for each row execute function zuno_require_version_step('NOTIFICATION_VERSION_CONFLICT');

create or replace function zuno_plan_price_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from plan_prices p where p.id <> new.id and p.plan_id = new.plan_id and p.billing_interval = new.billing_interval and p.active = 1 and new.active = 1 and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'PRICE_VERSION_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger plan_prices_no_overlap before insert or update of effective_to, active on plan_prices for each row execute function zuno_plan_price_no_overlap();

create or replace function zuno_override_no_overlap() returns trigger language plpgsql as $$
begin
  if new.status in ('SCHEDULED','ACTIVE') and exists (select 1 from customer_price_overrides p where p.id <> new.id and p.customer_id = new.customer_id and p.plan_id = new.plan_id and p.billing_interval = new.billing_interval and p.status in ('SCHEDULED','ACTIVE') and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'PRICE_OVERRIDE_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger customer_price_overrides_no_overlap before insert or update of effective_to, status on customer_price_overrides for each row execute function zuno_override_no_overlap();

create or replace function zuno_subscription_price_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from subscription_prices p where p.id <> new.id and p.subscription_id = new.subscription_id and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'SUBSCRIPTION_PRICE_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger subscription_prices_no_overlap before insert or update of effective_to on subscription_prices for each row execute function zuno_subscription_price_no_overlap();

create or replace function zuno_entitlement_no_overlap() returns trigger language plpgsql as $$
begin
  if exists (select 1 from subscription_entitlements p where p.id <> new.id and p.subscription_id = new.subscription_id and p.offering_code = new.offering_code and p.effective_from < coalesce(new.effective_to, 9223372036854775807) and new.effective_from < coalesce(p.effective_to, 9223372036854775807)) then
    raise exception 'ENTITLEMENT_VERSION_CONFLICT' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger subscription_entitlements_no_overlap before insert or update of effective_to on subscription_entitlements for each row execute function zuno_entitlement_no_overlap();
