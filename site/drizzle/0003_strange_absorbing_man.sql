CREATE TABLE `billing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_id` text NOT NULL,
	`status` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "billing_accounts_status_check" CHECK("billing_accounts"."status" in ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
	CONSTRAINT "billing_accounts_currency_check" CHECK(length("billing_accounts"."currency") = 3 and "billing_accounts"."currency" = upper("billing_accounts"."currency")),
	CONSTRAINT "billing_accounts_timestamps_check" CHECK("billing_accounts"."updated_at" >= "billing_accounts"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_customer_provider_uq` ON `billing_accounts` (`customer_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_provider_reference_uq` ON `billing_accounts` (`provider`,`provider_customer_id`);--> statement-breakpoint
CREATE INDEX `billing_accounts_customer_status_idx` ON `billing_accounts` (`customer_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_amount_minor` integer NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoice_lines_amount_check" CHECK("invoice_lines"."quantity" > 0 and "invoice_lines"."unit_amount_minor" >= 0 and "invoice_lines"."subtotal_minor" = "invoice_lines"."quantity" * "invoice_lines"."unit_amount_minor" and "invoice_lines"."tax_minor" >= 0 and "invoice_lines"."total_minor" = "invoice_lines"."subtotal_minor" + "invoice_lines"."tax_minor")
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text,
	`billing_account_id` text,
	`invoice_number` text NOT NULL,
	`provider_invoice_id` text,
	`status` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`amount_due_minor` integer NOT NULL,
	`issued_at` integer,
	`due_at` integer,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`billing_account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_status_check" CHECK("invoices"."status" in ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')),
	CONSTRAINT "invoices_currency_check" CHECK(length("invoices"."currency") = 3 and "invoices"."currency" = upper("invoices"."currency")),
	CONSTRAINT "invoices_amount_check" CHECK("invoices"."subtotal_minor" >= 0 and "invoices"."tax_minor" >= 0 and "invoices"."total_minor" = "invoices"."subtotal_minor" + "invoices"."tax_minor" and "invoices"."amount_due_minor" >= 0 and "invoices"."amount_due_minor" <= "invoices"."total_minor"),
	CONSTRAINT "invoices_dates_check" CHECK(("invoices"."due_at" is null or "invoices"."issued_at" is not null) and ("invoices"."due_at" is null or "invoices"."due_at" >= "invoices"."issued_at") and (("invoices"."status" = 'PAID' and "invoices"."paid_at" is not null) or ("invoices"."status" <> 'PAID' and "invoices"."paid_at" is null))),
	CONSTRAINT "invoices_timestamps_check" CHECK("invoices"."updated_at" >= "invoices"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_uq` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_provider_reference_uq` ON `invoices` (`provider_invoice_id`);--> statement-breakpoint
CREATE INDEX `invoices_customer_created_idx` ON `invoices` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoices_subscription_created_idx` ON `invoices` (`subscription_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoices_status_due_idx` ON `invoices` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `payment_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`sent_at` integer,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_reminders_stage_check" CHECK("payment_reminders"."stage" in ('BEFORE_DUE', 'DUE', 'OVERDUE_1', 'OVERDUE_2', 'FINAL')),
	CONSTRAINT "payment_reminders_status_check" CHECK("payment_reminders"."status" in ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED')),
	CONSTRAINT "payment_reminders_outcome_check" CHECK(("payment_reminders"."status" = 'SENT' and "payment_reminders"."sent_at" is not null and "payment_reminders"."failure_code" is null) or ("payment_reminders"."status" = 'FAILED' and "payment_reminders"."sent_at" is null and "payment_reminders"."failure_code" is not null) or ("payment_reminders"."status" in ('SCHEDULED', 'CANCELLED') and "payment_reminders"."sent_at" is null and "payment_reminders"."failure_code" is null)),
	CONSTRAINT "payment_reminders_timestamps_check" CHECK("payment_reminders"."updated_at" >= "payment_reminders"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reminders_idempotency_uq` ON `payment_reminders` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reminders_invoice_stage_uq` ON `payment_reminders` (`invoice_id`,`stage`);--> statement-breakpoint
CREATE INDEX `payment_reminders_status_schedule_idx` ON `payment_reminders` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `subscription_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`offering_code` text NOT NULL,
	`enabled` integer NOT NULL,
	`limit_value` integer,
	`limit_unit` text,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_entitlements_code_check" CHECK("subscription_entitlements"."offering_code" = lower("subscription_entitlements"."offering_code")),
	CONSTRAINT "subscription_entitlements_limit_check" CHECK(("subscription_entitlements"."limit_value" is null and "subscription_entitlements"."limit_unit" is null) or ("subscription_entitlements"."limit_value" >= 0 and "subscription_entitlements"."limit_unit" is not null)),
	CONSTRAINT "subscription_entitlements_range_check" CHECK("subscription_entitlements"."effective_to" is null or "subscription_entitlements"."effective_to" > "subscription_entitlements"."effective_from"),
	CONSTRAINT "subscription_entitlements_timestamps_check" CHECK("subscription_entitlements"."updated_at" >= "subscription_entitlements"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_entitlements_scope_start_uq` ON `subscription_entitlements` (`subscription_id`,`offering_code`,`effective_from`);--> statement-breakpoint
CREATE INDEX `subscription_entitlements_effective_lookup_idx` ON `subscription_entitlements` (`subscription_id`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `subscription_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`effective_amount_minor` integer NOT NULL,
	`setup_fee_minor` integer DEFAULT 0 NOT NULL,
	`discount_total_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`tax_behaviour` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`pricing_source` text NOT NULL,
	`pricing_snapshot_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_prices_amount_check" CHECK("subscription_prices"."base_amount_minor" >= 0 and "subscription_prices"."effective_amount_minor" >= 0 and "subscription_prices"."setup_fee_minor" >= 0 and "subscription_prices"."discount_total_minor" >= 0),
	CONSTRAINT "subscription_prices_currency_check" CHECK(length("subscription_prices"."currency") = 3 and "subscription_prices"."currency" = upper("subscription_prices"."currency")),
	CONSTRAINT "subscription_prices_tax_check" CHECK("subscription_prices"."tax_behaviour" in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')),
	CONSTRAINT "subscription_prices_source_check" CHECK("subscription_prices"."pricing_source" in ('QUOTE', 'RESOLVED', 'MANUAL', 'RENEWAL')),
	CONSTRAINT "subscription_prices_range_check" CHECK("subscription_prices"."effective_to" is null or "subscription_prices"."effective_to" > "subscription_prices"."effective_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_prices_scope_start_uq` ON `subscription_prices` (`subscription_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `subscription_prices_effective_lookup_idx` ON `subscription_prices` (`subscription_id`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`billing_interval` text NOT NULL,
	`currency` text NOT NULL,
	`started_at` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at` integer,
	`cancelled_at` integer,
	`trial_ends_at` integer,
	`external_billing_provider` text,
	`external_customer_id` text,
	`external_subscription_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscriptions_status_check" CHECK("subscriptions"."status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "subscriptions_interval_check" CHECK("subscriptions"."billing_interval" in ('MONTHLY', 'ANNUAL')),
	CONSTRAINT "subscriptions_currency_check" CHECK(length("subscriptions"."currency") = 3 and "subscriptions"."currency" = upper("subscriptions"."currency")),
	CONSTRAINT "subscriptions_period_check" CHECK(("subscriptions"."current_period_start" is null and "subscriptions"."current_period_end" is null) or ("subscriptions"."current_period_start" is not null and "subscriptions"."current_period_end" > "subscriptions"."current_period_start")),
	CONSTRAINT "subscriptions_trial_check" CHECK("subscriptions"."status" <> 'TRIAL' or ("subscriptions"."trial_ends_at" is not null and "subscriptions"."trial_ends_at" > "subscriptions"."created_at")),
	CONSTRAINT "subscriptions_cancellation_check" CHECK(("subscriptions"."status" = 'CANCELLED' and "subscriptions"."cancelled_at" is not null) or ("subscriptions"."status" <> 'CANCELLED' and "subscriptions"."cancelled_at" is null)),
	CONSTRAINT "subscriptions_external_check" CHECK(("subscriptions"."external_billing_provider" is null and "subscriptions"."external_customer_id" is null and "subscriptions"."external_subscription_id" is null) or ("subscriptions"."external_billing_provider" is not null and "subscriptions"."external_customer_id" is not null)),
	CONSTRAINT "subscriptions_version_check" CHECK("subscriptions"."version" > 0),
	CONSTRAINT "subscriptions_timestamps_check" CHECK("subscriptions"."updated_at" >= "subscriptions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_current_customer_uq` ON `subscriptions` (`customer_id`) WHERE "subscriptions"."status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_reference_uq` ON `subscriptions` (`external_billing_provider`,`external_subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_status_idx` ON `subscriptions` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_period_idx` ON `subscriptions` (`status`,`current_period_end`);--> statement-breakpoint
ALTER TABLE `customer_discounts` ADD `subscription_id` text REFERENCES subscriptions(id);--> statement-breakpoint
CREATE INDEX `customer_discounts_subscription_idx` ON `customer_discounts` (`subscription_id`);
--> statement-breakpoint
DROP TRIGGER `customer_discounts_no_overlap_insert`;
--> statement-breakpoint
CREATE TRIGGER `customer_discounts_no_overlap_insert`
BEFORE INSERT ON `customer_discounts`
WHEN NEW.`status` IN ('SCHEDULED', 'ACTIVE') AND EXISTS (
	SELECT 1 FROM `customer_discounts` existing
	WHERE existing.`customer_id` = NEW.`customer_id`
		AND existing.`discount_id` = NEW.`discount_id`
		AND existing.`status` IN ('SCHEDULED', 'ACTIVE')
		AND (existing.`subscription_id` IS NULL OR NEW.`subscription_id` IS NULL OR existing.`subscription_id` = NEW.`subscription_id`)
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN SELECT RAISE(ABORT, 'CUSTOMER_DISCOUNT_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER `customer_discounts_validate_subscription`
BEFORE INSERT ON `customer_discounts`
WHEN NEW.`subscription_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `subscriptions` subscription
	WHERE subscription.`id` = NEW.`subscription_id` AND subscription.`customer_id` = NEW.`customer_id`
)
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_DISCOUNT_CUSTOMER_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_validate_subscription_scope`
BEFORE INSERT ON `discount_redemptions`
WHEN EXISTS (
	SELECT 1 FROM `customer_discounts` assignment
	JOIN `subscriptions` subscription ON subscription.`id` = assignment.`subscription_id`
	WHERE assignment.`id` = NEW.`customer_discount_id`
		AND (subscription.`customer_id` <> NEW.`customer_id` OR subscription.`plan_id` <> NEW.`plan_id`)
)
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_DISCOUNT_SCOPE_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `subscriptions_validate_update`
BEFORE UPDATE ON `subscriptions`
BEGIN
	SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'SUBSCRIPTION_VERSION_CONFLICT') END;
	SELECT CASE WHEN NEW.`customer_id` <> OLD.`customer_id`
		OR NEW.`billing_interval` <> OLD.`billing_interval`
		OR NEW.`currency` <> OLD.`currency`
		OR NEW.`created_at` <> OLD.`created_at`
	THEN RAISE(ABORT, 'SUBSCRIPTION_TERMS_IMMUTABLE') END;
	SELECT CASE WHEN NOT (
		(OLD.`status` = 'PENDING' AND NEW.`status` IN ('TRIAL', 'ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'TRIAL' AND NEW.`status` IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'ACTIVE' AND NEW.`status` IN ('PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'PAST_DUE' AND NEW.`status` IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'SUSPENDED' AND NEW.`status` IN ('ACTIVE', 'CANCELLED', 'EXPIRED'))
	) THEN RAISE(ABORT, 'INVALID_SUBSCRIPTION_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER `subscriptions_no_delete`
BEFORE DELETE ON `subscriptions`
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_prices_no_overlap_insert`
BEFORE INSERT ON `subscription_prices`
WHEN EXISTS (
	SELECT 1 FROM `subscription_prices` existing
	WHERE existing.`subscription_id` = NEW.`subscription_id`
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_PRICE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_prices_immutable_terms`
BEFORE UPDATE ON `subscription_prices`
WHEN NEW.`subscription_id` <> OLD.`subscription_id`
	OR NEW.`base_amount_minor` <> OLD.`base_amount_minor`
	OR NEW.`effective_amount_minor` <> OLD.`effective_amount_minor`
	OR NEW.`setup_fee_minor` <> OLD.`setup_fee_minor`
	OR NEW.`discount_total_minor` <> OLD.`discount_total_minor`
	OR NEW.`currency` <> OLD.`currency`
	OR NEW.`tax_behaviour` <> OLD.`tax_behaviour`
	OR NEW.`effective_from` <> OLD.`effective_from`
	OR NEW.`pricing_source` <> OLD.`pricing_source`
	OR NEW.`pricing_snapshot_json` <> OLD.`pricing_snapshot_json`
	OR NEW.`created_at` <> OLD.`created_at`
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_PRICE_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_prices_no_delete`
BEFORE DELETE ON `subscription_prices`
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_PRICE_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_entitlements_no_overlap_insert`
BEFORE INSERT ON `subscription_entitlements`
WHEN EXISTS (
	SELECT 1 FROM `subscription_entitlements` existing
	WHERE existing.`subscription_id` = NEW.`subscription_id`
		AND existing.`offering_code` = NEW.`offering_code`
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN SELECT RAISE(ABORT, 'ENTITLEMENT_VERSION_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_entitlements_immutable_terms`
BEFORE UPDATE ON `subscription_entitlements`
WHEN NEW.`subscription_id` <> OLD.`subscription_id`
	OR NEW.`offering_code` <> OLD.`offering_code`
	OR NEW.`enabled` <> OLD.`enabled`
	OR COALESCE(NEW.`limit_value`, -1) <> COALESCE(OLD.`limit_value`, -1)
	OR COALESCE(NEW.`limit_unit`, '') <> COALESCE(OLD.`limit_unit`, '')
	OR NEW.`effective_from` <> OLD.`effective_from`
	OR NEW.`created_at` <> OLD.`created_at`
BEGIN SELECT RAISE(ABORT, 'ENTITLEMENT_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `subscription_entitlements_no_delete`
BEFORE DELETE ON `subscription_entitlements`
BEGIN SELECT RAISE(ABORT, 'ENTITLEMENT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `invoice_lines_draft_only`
BEFORE INSERT ON `invoice_lines`
WHEN NOT EXISTS (SELECT 1 FROM `invoices` invoice WHERE invoice.`id` = NEW.`invoice_id` AND invoice.`status` = 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'INVOICE_LINES_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER `invoices_validate_scope`
BEFORE INSERT ON `invoices`
WHEN (NEW.`subscription_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `subscriptions` subscription
	WHERE subscription.`id` = NEW.`subscription_id` AND subscription.`customer_id` = NEW.`customer_id`
)) OR (NEW.`billing_account_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `billing_accounts` account
	WHERE account.`id` = NEW.`billing_account_id` AND account.`customer_id` = NEW.`customer_id`
))
BEGIN SELECT RAISE(ABORT, 'INVOICE_CUSTOMER_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `invoice_lines_no_update`
BEFORE UPDATE ON `invoice_lines`
BEGIN SELECT RAISE(ABORT, 'INVOICE_LINES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `invoice_lines_no_delete`
BEFORE DELETE ON `invoice_lines`
BEGIN SELECT RAISE(ABORT, 'INVOICE_LINES_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `invoices_validate_update`
BEFORE UPDATE ON `invoices`
BEGIN
	SELECT CASE WHEN NEW.`customer_id` <> OLD.`customer_id`
		OR COALESCE(NEW.`subscription_id`, '') <> COALESCE(OLD.`subscription_id`, '')
		OR COALESCE(NEW.`billing_account_id`, '') <> COALESCE(OLD.`billing_account_id`, '')
		OR NEW.`invoice_number` <> OLD.`invoice_number`
		OR COALESCE(NEW.`provider_invoice_id`, '') <> COALESCE(OLD.`provider_invoice_id`, '')
		OR NEW.`currency` <> OLD.`currency`
		OR NEW.`subtotal_minor` <> OLD.`subtotal_minor`
		OR NEW.`tax_minor` <> OLD.`tax_minor`
		OR NEW.`total_minor` <> OLD.`total_minor`
		OR NEW.`created_at` <> OLD.`created_at`
	THEN RAISE(ABORT, 'INVOICE_TERMS_IMMUTABLE') END;
	SELECT CASE WHEN NOT (
		(OLD.`status` = 'DRAFT' AND NEW.`status` IN ('OPEN', 'VOID')) OR
		(OLD.`status` = 'OPEN' AND NEW.`status` IN ('PAID', 'VOID', 'UNCOLLECTIBLE'))
	) THEN RAISE(ABORT, 'INVALID_INVOICE_TRANSITION') END;
	SELECT CASE WHEN NEW.`status` = 'OPEN' AND (
		NEW.`issued_at` IS NULL OR NEW.`due_at` IS NULL OR
		(SELECT COALESCE(SUM(line.`subtotal_minor`), -1) FROM `invoice_lines` line WHERE line.`invoice_id` = NEW.`id`) <> NEW.`subtotal_minor` OR
		(SELECT COALESCE(SUM(line.`tax_minor`), -1) FROM `invoice_lines` line WHERE line.`invoice_id` = NEW.`id`) <> NEW.`tax_minor`
	) THEN RAISE(ABORT, 'INVOICE_LINES_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER `invoices_no_delete`
BEFORE DELETE ON `invoices`
BEGIN SELECT RAISE(ABORT, 'INVOICE_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `payment_reminders_validate_update`
BEFORE UPDATE ON `payment_reminders`
BEGIN
	SELECT CASE WHEN NEW.`invoice_id` <> OLD.`invoice_id`
		OR NEW.`stage` <> OLD.`stage`
		OR NEW.`idempotency_key` <> OLD.`idempotency_key`
		OR NEW.`scheduled_for` <> OLD.`scheduled_for`
		OR NEW.`created_at` <> OLD.`created_at`
	THEN RAISE(ABORT, 'PAYMENT_REMINDER_TERMS_IMMUTABLE') END;
	SELECT CASE WHEN OLD.`status` <> 'SCHEDULED' OR NEW.`status` NOT IN ('SENT', 'FAILED', 'CANCELLED')
	THEN RAISE(ABORT, 'INVALID_PAYMENT_REMINDER_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER `payment_reminders_no_delete`
BEFORE DELETE ON `payment_reminders`
BEGIN SELECT RAISE(ABORT, 'PAYMENT_REMINDER_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
PRAGMA optimize;
