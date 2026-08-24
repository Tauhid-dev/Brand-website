CREATE TABLE `billing_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text,
	`invoice_id` text,
	`body` text NOT NULL,
	`author_admin_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "billing_notes_body_check" CHECK(length(trim("billing_notes"."body")) between 1 and 4000)
);
--> statement-breakpoint
CREATE INDEX `billing_notes_customer_created_idx` ON `billing_notes` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `billing_notes_subscription_idx` ON `billing_notes` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `billing_notes_invoice_idx` ON `billing_notes` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `customer_billing_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "customer_billing_profiles_name_check" CHECK(length(trim("customer_billing_profiles"."contact_name")) between 1 and 200),
	CONSTRAINT "customer_billing_profiles_email_check" CHECK(length(trim("customer_billing_profiles"."contact_email")) between 3 and 320),
	CONSTRAINT "customer_billing_profiles_timestamps_check" CHECK("customer_billing_profiles"."updated_at" >= "customer_billing_profiles"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_billing_profiles_customer_uq` ON `customer_billing_profiles` (`customer_id`);--> statement-breakpoint
DROP TRIGGER `customer_discounts_validate_subscription`;--> statement-breakpoint
DROP TRIGGER `discount_redemptions_validate_subscription_scope`;--> statement-breakpoint
DROP TRIGGER `subscriptions_validate_update`;--> statement-breakpoint
DROP TRIGGER `subscriptions_no_delete`;--> statement-breakpoint
DROP TRIGGER `invoices_validate_scope`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`billing_interval` text NOT NULL,
	`currency` text NOT NULL,
	`started_at` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`grace_period_ends_at` integer,
	`service_extended_until` integer,
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
	CONSTRAINT "subscriptions_status_check" CHECK("__new_subscriptions"."status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "subscriptions_interval_check" CHECK("__new_subscriptions"."billing_interval" in ('MONTHLY', 'ANNUAL')),
	CONSTRAINT "subscriptions_currency_check" CHECK(length("__new_subscriptions"."currency") = 3 and "__new_subscriptions"."currency" = upper("__new_subscriptions"."currency")),
	CONSTRAINT "subscriptions_period_check" CHECK(("__new_subscriptions"."current_period_start" is null and "__new_subscriptions"."current_period_end" is null) or ("__new_subscriptions"."current_period_start" is not null and "__new_subscriptions"."current_period_end" > "__new_subscriptions"."current_period_start")),
	CONSTRAINT "subscriptions_trial_check" CHECK("__new_subscriptions"."status" <> 'TRIAL' or ("__new_subscriptions"."trial_ends_at" is not null and "__new_subscriptions"."trial_ends_at" > "__new_subscriptions"."created_at")),
	CONSTRAINT "subscriptions_cancellation_check" CHECK(("__new_subscriptions"."status" = 'CANCEL_AT_PERIOD_END' and "__new_subscriptions"."cancel_at" = "__new_subscriptions"."current_period_end" and "__new_subscriptions"."cancelled_at" is null) or ("__new_subscriptions"."status" = 'CANCELLED' and "__new_subscriptions"."cancelled_at" is not null) or ("__new_subscriptions"."status" not in ('CANCEL_AT_PERIOD_END', 'CANCELLED') and "__new_subscriptions"."cancel_at" is null and "__new_subscriptions"."cancelled_at" is null)),
	CONSTRAINT "subscriptions_grace_check" CHECK("__new_subscriptions"."grace_period_ends_at" is null or "__new_subscriptions"."grace_period_ends_at" > "__new_subscriptions"."updated_at"),
	CONSTRAINT "subscriptions_extension_check" CHECK("__new_subscriptions"."service_extended_until" is null or "__new_subscriptions"."service_extended_until" > "__new_subscriptions"."updated_at"),
	CONSTRAINT "subscriptions_external_check" CHECK(("__new_subscriptions"."external_billing_provider" is null and "__new_subscriptions"."external_customer_id" is null and "__new_subscriptions"."external_subscription_id" is null) or ("__new_subscriptions"."external_billing_provider" is not null and "__new_subscriptions"."external_customer_id" is not null)),
	CONSTRAINT "subscriptions_version_check" CHECK("__new_subscriptions"."version" > 0),
	CONSTRAINT "subscriptions_timestamps_check" CHECK("__new_subscriptions"."updated_at" >= "__new_subscriptions"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "customer_id", "plan_id", "status", "billing_interval", "currency", "started_at", "current_period_start", "current_period_end", "grace_period_ends_at", "service_extended_until", "cancel_at", "cancelled_at", "trial_ends_at", "external_billing_provider", "external_customer_id", "external_subscription_id", "version", "created_at", "updated_at") SELECT "id", "customer_id", "plan_id", "status", "billing_interval", "currency", "started_at", "current_period_start", "current_period_end", NULL, NULL, "cancel_at", "cancelled_at", "trial_ends_at", "external_billing_provider", "external_customer_id", "external_subscription_id", "version", "created_at", "updated_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_current_customer_uq` ON `subscriptions` (`customer_id`) WHERE "subscriptions"."status" in ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END');--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_reference_uq` ON `subscriptions` (`external_billing_provider`,`external_subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_status_idx` ON `subscriptions` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_period_idx` ON `subscriptions` (`status`,`current_period_end`);
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
CREATE TRIGGER `subscriptions_validate_update`
BEFORE UPDATE ON `subscriptions`
BEGIN
	SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'SUBSCRIPTION_VERSION_CONFLICT') END;
	SELECT CASE WHEN NEW.`customer_id` <> OLD.`customer_id`
		OR NEW.`plan_id` <> OLD.`plan_id`
		OR NEW.`billing_interval` <> OLD.`billing_interval`
		OR NEW.`currency` <> OLD.`currency`
		OR NEW.`created_at` <> OLD.`created_at`
		OR NEW.`external_billing_provider` IS NOT OLD.`external_billing_provider`
		OR NEW.`external_customer_id` IS NOT OLD.`external_customer_id`
		OR NEW.`external_subscription_id` IS NOT OLD.`external_subscription_id`
	THEN RAISE(ABORT, 'SUBSCRIPTION_TERMS_IMMUTABLE') END;
	SELECT CASE WHEN NOT (
		(OLD.`status` = 'PENDING' AND NEW.`status` IN ('TRIAL', 'ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'TRIAL' AND NEW.`status` IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'ACTIVE' AND NEW.`status` IN ('PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'PAST_DUE' AND NEW.`status` IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'SUSPENDED' AND NEW.`status` IN ('ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'CANCEL_AT_PERIOD_END' AND NEW.`status` IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`external_billing_provider` IS NOT NULL
			AND (NEW.`current_period_start` IS NOT OLD.`current_period_start` OR NEW.`current_period_end` IS NOT OLD.`current_period_end`)
			AND NEW.`started_at` IS OLD.`started_at`
			AND NEW.`grace_period_ends_at` IS OLD.`grace_period_ends_at`
			AND NEW.`service_extended_until` IS OLD.`service_extended_until`
			AND NEW.`cancel_at` IS OLD.`cancel_at`
			AND NEW.`cancelled_at` IS OLD.`cancelled_at`
			AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`status` IN ('PAST_DUE', 'SUSPENDED')
			AND NEW.`service_extended_until` IS NOT OLD.`service_extended_until`
			AND NEW.`started_at` IS OLD.`started_at`
			AND NEW.`current_period_start` IS OLD.`current_period_start`
			AND NEW.`current_period_end` IS OLD.`current_period_end`
			AND NEW.`grace_period_ends_at` IS OLD.`grace_period_ends_at`
			AND NEW.`cancel_at` IS OLD.`cancel_at`
			AND NEW.`cancelled_at` IS OLD.`cancelled_at`
			AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`)
	) THEN RAISE(ABORT, 'INVALID_SUBSCRIPTION_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER `subscriptions_no_delete`
BEFORE DELETE ON `subscriptions`
BEGIN SELECT RAISE(ABORT, 'SUBSCRIPTION_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_notes_immutable`
BEFORE UPDATE ON `billing_notes`
BEGIN
	SELECT RAISE(ABORT, 'BILLING_NOTE_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `billing_notes_no_delete`
BEFORE DELETE ON `billing_notes`
BEGIN
	SELECT RAISE(ABORT, 'BILLING_NOTE_IMMUTABLE');
END;
--> statement-breakpoint
PRAGMA optimize;
