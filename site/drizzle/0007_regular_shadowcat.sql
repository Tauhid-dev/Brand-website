CREATE TABLE `api_rate_limits` (
	`scope` text NOT NULL,
	`subject_hash` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `subject_hash`, `window_started_at`),
	CONSTRAINT "api_rate_limits_count_check" CHECK("api_rate_limits"."request_count" > 0),
	CONSTRAINT "api_rate_limits_subject_hash_check" CHECK(length("api_rate_limits"."subject_hash") = 64),
	CONSTRAINT "api_rate_limits_timestamps_check" CHECK("api_rate_limits"."updated_at" >= "api_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE INDEX `api_rate_limits_window_idx` ON `api_rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE TABLE `billing_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`normalized_payload_json` text NOT NULL,
	`status` text DEFAULT 'PROCESSING' NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processing_started_at` integer NOT NULL,
	`processed_at` integer,
	`next_attempt_at` integer,
	`failure_code` text,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "billing_webhook_events_status_check" CHECK("billing_webhook_events"."status" in ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')),
	CONSTRAINT "billing_webhook_events_attempt_check" CHECK("billing_webhook_events"."attempt_count" > 0 and "billing_webhook_events"."max_attempts" > 0 and "billing_webhook_events"."attempt_count" <= "billing_webhook_events"."max_attempts"),
	CONSTRAINT "billing_webhook_events_outcome_check" CHECK(("billing_webhook_events"."status" = 'PROCESSING' and "billing_webhook_events"."processed_at" is null and "billing_webhook_events"."next_attempt_at" is null and "billing_webhook_events"."failure_code" is null) or ("billing_webhook_events"."status" in ('PROCESSED', 'IGNORED') and "billing_webhook_events"."processed_at" is not null and "billing_webhook_events"."next_attempt_at" is null and "billing_webhook_events"."failure_code" is null) or ("billing_webhook_events"."status" = 'FAILED' and "billing_webhook_events"."processed_at" is null and "billing_webhook_events"."failure_code" is not null)),
	CONSTRAINT "billing_webhook_events_timestamps_check" CHECK("billing_webhook_events"."updated_at" >= "billing_webhook_events"."created_at" and "billing_webhook_events"."processing_started_at" >= "billing_webhook_events"."received_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_webhook_events_provider_event_uq` ON `billing_webhook_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `billing_webhook_events_ready_idx` ON `billing_webhook_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `billing_webhook_events_provider_occurred_idx` ON `billing_webhook_events` (`provider`,`occurred_at`);--> statement-breakpoint
CREATE TRIGGER `billing_webhook_events_identity_immutable`
BEFORE UPDATE ON `billing_webhook_events`
WHEN NEW.`provider` <> OLD.`provider`
	OR NEW.`provider_event_id` <> OLD.`provider_event_id`
	OR NEW.`event_type` <> OLD.`event_type`
	OR NEW.`payload_hash` <> OLD.`payload_hash`
	OR NEW.`normalized_payload_json` <> OLD.`normalized_payload_json`
	OR NEW.`occurred_at` <> OLD.`occurred_at`
	OR NEW.`received_at` <> OLD.`received_at`
	OR NEW.`request_id` <> OLD.`request_id`
	OR NEW.`created_at` <> OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'BILLING_WEBHOOK_IDENTITY_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `billing_webhook_events_terminal_immutable`
BEFORE UPDATE ON `billing_webhook_events`
WHEN OLD.`status` IN ('PROCESSED', 'IGNORED')
BEGIN
	SELECT RAISE(ABORT, 'BILLING_WEBHOOK_TERMINAL');
END;--> statement-breakpoint
CREATE TRIGGER `billing_webhook_events_transition_guard`
BEFORE UPDATE ON `billing_webhook_events`
WHEN NOT (
	(OLD.`status` = 'PROCESSING' AND NEW.`status` IN ('PROCESSED', 'IGNORED', 'FAILED'))
	OR (OLD.`status` = 'PROCESSING' AND NEW.`status` = 'PROCESSING' AND NEW.`attempt_count` = OLD.`attempt_count` + 1)
	OR (OLD.`status` = 'FAILED' AND NEW.`status` = 'PROCESSING' AND NEW.`attempt_count` = OLD.`attempt_count` + 1)
)
BEGIN
	SELECT RAISE(ABORT, 'INVALID_BILLING_WEBHOOK_TRANSITION');
END;--> statement-breakpoint
DROP TRIGGER `subscriptions_validate_update`;--> statement-breakpoint
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
		(OLD.`status` = 'ACTIVE' AND NEW.`status` IN ('PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'PAST_DUE' AND NEW.`status` IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = 'SUSPENDED' AND NEW.`status` IN ('ACTIVE', 'CANCELLED', 'EXPIRED')) OR
		(OLD.`status` = NEW.`status`
			AND OLD.`external_billing_provider` IS NOT NULL
			AND (NEW.`current_period_start` IS NOT OLD.`current_period_start` OR NEW.`current_period_end` IS NOT OLD.`current_period_end`)
			AND NEW.`started_at` IS OLD.`started_at`
			AND NEW.`cancel_at` IS OLD.`cancel_at`
			AND NEW.`cancelled_at` IS OLD.`cancelled_at`
			AND NEW.`trial_ends_at` IS OLD.`trial_ends_at`)
	) THEN RAISE(ABORT, 'INVALID_SUBSCRIPTION_TRANSITION') END;
END;--> statement-breakpoint
PRAGMA optimize;
