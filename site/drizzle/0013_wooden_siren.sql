CREATE TABLE `billing_checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "billing_checkout_sessions_status_check" CHECK("billing_checkout_sessions"."status" in ('OPEN', 'COMPLETED', 'EXPIRED')),
	CONSTRAINT "billing_checkout_sessions_outcome_check" CHECK(("billing_checkout_sessions"."status" = 'COMPLETED' and "billing_checkout_sessions"."completed_at" is not null) or ("billing_checkout_sessions"."status" <> 'COMPLETED' and "billing_checkout_sessions"."completed_at" is null)),
	CONSTRAINT "billing_checkout_sessions_expiry_check" CHECK("billing_checkout_sessions"."expires_at" > "billing_checkout_sessions"."created_at"),
	CONSTRAINT "billing_checkout_sessions_timestamps_check" CHECK("billing_checkout_sessions"."updated_at" >= "billing_checkout_sessions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_sessions_provider_reference_uq` ON `billing_checkout_sessions` (`provider`,`provider_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_sessions_idempotency_uq` ON `billing_checkout_sessions` (`customer_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `billing_checkout_sessions_subscription_status_idx` ON `billing_checkout_sessions` (`subscription_id`,`status`);--> statement-breakpoint
CREATE TABLE `billing_provider_price_references` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`subscription_price_id` text NOT NULL,
	`provider_product_id` text NOT NULL,
	`provider_price_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_price_id`) REFERENCES `subscription_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "billing_provider_prices_provider_check" CHECK("billing_provider_price_references"."provider" = lower("billing_provider_price_references"."provider") and length(trim("billing_provider_price_references"."provider")) between 1 and 80),
	CONSTRAINT "billing_provider_prices_timestamps_check" CHECK("billing_provider_price_references"."updated_at" >= "billing_provider_price_references"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_provider_prices_scope_uq` ON `billing_provider_price_references` (`provider`,`subscription_price_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_provider_prices_reference_uq` ON `billing_provider_price_references` (`provider`,`provider_price_id`);
--> statement-breakpoint
DROP TRIGGER `subscriptions_validate_update`;
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
		OR ((NEW.`external_billing_provider` IS NOT OLD.`external_billing_provider`
			OR NEW.`external_customer_id` IS NOT OLD.`external_customer_id`
			OR NEW.`external_subscription_id` IS NOT OLD.`external_subscription_id`)
			AND NOT (OLD.`external_billing_provider` IS NULL AND OLD.`external_customer_id` IS NULL AND OLD.`external_subscription_id` IS NULL
				AND NEW.`external_billing_provider` IS NOT NULL AND NEW.`external_customer_id` IS NOT NULL AND NEW.`external_subscription_id` IS NOT NULL))
	THEN RAISE(ABORT, 'SUBSCRIPTION_TERMS_IMMUTABLE') END;
	SELECT CASE WHEN NOT (
		(OLD.`status` = 'PENDING' AND NEW.`status` IN ('TRIAL', 'ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'TRIAL' AND NEW.`status` IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'ACTIVE' AND NEW.`status` IN ('PAST_DUE', 'SUSPENDED', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'PAST_DUE' AND NEW.`status` IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'SUSPENDED' AND NEW.`status` IN ('ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'CANCEL_AT_PERIOD_END' AND NEW.`status` IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`external_billing_provider` IS NULL AND OLD.`external_customer_id` IS NULL AND OLD.`external_subscription_id` IS NULL
			AND NEW.`external_billing_provider` IS NOT NULL AND NEW.`external_customer_id` IS NOT NULL AND NEW.`external_subscription_id` IS NOT NULL
			AND NEW.`started_at` IS OLD.`started_at` AND NEW.`current_period_start` IS OLD.`current_period_start` AND NEW.`current_period_end` IS OLD.`current_period_end`
			AND NEW.`grace_period_ends_at` IS OLD.`grace_period_ends_at` AND NEW.`service_extended_until` IS OLD.`service_extended_until`
			AND NEW.`cancel_at` IS OLD.`cancel_at` AND NEW.`cancelled_at` IS OLD.`cancelled_at` AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`external_billing_provider` IS NOT NULL
			AND (NEW.`current_period_start` IS NOT OLD.`current_period_start` OR NEW.`current_period_end` IS NOT OLD.`current_period_end`)
			AND NEW.`started_at` IS OLD.`started_at` AND NEW.`grace_period_ends_at` IS OLD.`grace_period_ends_at`
			AND NEW.`service_extended_until` IS OLD.`service_extended_until` AND NEW.`cancel_at` IS OLD.`cancel_at`
			AND NEW.`cancelled_at` IS OLD.`cancelled_at` AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`status` IN ('PAST_DUE', 'SUSPENDED')
			AND NEW.`service_extended_until` IS NOT OLD.`service_extended_until`
			AND NEW.`started_at` IS OLD.`started_at` AND NEW.`current_period_start` IS OLD.`current_period_start`
			AND NEW.`current_period_end` IS OLD.`current_period_end` AND NEW.`grace_period_ends_at` IS OLD.`grace_period_ends_at`
			AND NEW.`cancel_at` IS OLD.`cancel_at` AND NEW.`cancelled_at` IS OLD.`cancelled_at` AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`)
	) THEN RAISE(ABORT, 'INVALID_SUBSCRIPTION_TRANSITION') END;
END;
--> statement-breakpoint
PRAGMA optimize;
