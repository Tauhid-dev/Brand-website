CREATE TABLE `customer_price_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`currency` text NOT NULL,
	`billing_interval` text NOT NULL,
	`override_amount_minor` integer NOT NULL,
	`override_setup_fee_minor` integer DEFAULT 0 NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "customer_price_overrides_currency_check" CHECK(length("customer_price_overrides"."currency") = 3 and "customer_price_overrides"."currency" = upper("customer_price_overrides"."currency")),
	CONSTRAINT "customer_price_overrides_interval_check" CHECK("customer_price_overrides"."billing_interval" in ('MONTHLY', 'ANNUAL')),
	CONSTRAINT "customer_price_overrides_amount_check" CHECK("customer_price_overrides"."override_amount_minor" >= 0 and "customer_price_overrides"."override_setup_fee_minor" >= 0),
	CONSTRAINT "customer_price_overrides_status_check" CHECK("customer_price_overrides"."status" in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "customer_price_overrides_range_check" CHECK("customer_price_overrides"."effective_to" is null or "customer_price_overrides"."effective_to" > "customer_price_overrides"."effective_from"),
	CONSTRAINT "customer_price_overrides_timestamps_check" CHECK("customer_price_overrides"."updated_at" >= "customer_price_overrides"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_price_overrides_scope_start_uq` ON `customer_price_overrides` (`customer_id`,`plan_id`,`billing_interval`,`effective_from`);--> statement-breakpoint
CREATE INDEX `customer_price_overrides_effective_lookup_idx` ON `customer_price_overrides` (`customer_id`,`plan_id`,`billing_interval`,`status`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE INDEX `customer_price_overrides_plan_idx` ON `customer_price_overrides` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`currency` text NOT NULL,
	`billing_interval` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`setup_fee_minor` integer DEFAULT 0 NOT NULL,
	`tax_behaviour` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plan_prices_currency_check" CHECK(length("plan_prices"."currency") = 3 and "plan_prices"."currency" = upper("plan_prices"."currency")),
	CONSTRAINT "plan_prices_interval_check" CHECK("plan_prices"."billing_interval" in ('MONTHLY', 'ANNUAL')),
	CONSTRAINT "plan_prices_amount_check" CHECK("plan_prices"."amount_minor" >= 0 and "plan_prices"."setup_fee_minor" >= 0),
	CONSTRAINT "plan_prices_tax_check" CHECK("plan_prices"."tax_behaviour" in ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')),
	CONSTRAINT "plan_prices_range_check" CHECK("plan_prices"."effective_to" is null or "plan_prices"."effective_to" > "plan_prices"."effective_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_prices_scope_start_uq` ON `plan_prices` (`plan_id`,`billing_interval`,`effective_from`);--> statement-breakpoint
CREATE INDEX `plan_prices_effective_lookup_idx` ON `plan_prices` (`plan_id`,`billing_interval`,`active`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `price_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`billing_interval` text NOT NULL,
	`base_price_minor` integer NOT NULL,
	`override_price_minor` integer,
	`discount_total_minor` integer DEFAULT 0 NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`pricing_snapshot_json` text NOT NULL,
	`valid_until` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "price_quotes_interval_check" CHECK("price_quotes"."billing_interval" in ('MONTHLY', 'ANNUAL')),
	CONSTRAINT "price_quotes_currency_check" CHECK(length("price_quotes"."currency") = 3 and "price_quotes"."currency" = upper("price_quotes"."currency")),
	CONSTRAINT "price_quotes_amounts_check" CHECK("price_quotes"."base_price_minor" >= 0 and ("price_quotes"."override_price_minor" is null or "price_quotes"."override_price_minor" >= 0) and "price_quotes"."discount_total_minor" >= 0 and "price_quotes"."subtotal_minor" >= 0 and "price_quotes"."tax_minor" >= 0 and "price_quotes"."total_minor" = "price_quotes"."subtotal_minor" + "price_quotes"."tax_minor"),
	CONSTRAINT "price_quotes_validity_check" CHECK("price_quotes"."valid_until" > "price_quotes"."created_at")
);
--> statement-breakpoint
CREATE INDEX `price_quotes_customer_created_idx` ON `price_quotes` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `price_quotes_plan_created_idx` ON `price_quotes` (`plan_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `plan_prices_no_overlap_insert`
BEFORE INSERT ON `plan_prices`
WHEN NEW.`active` = 1 AND EXISTS (
	SELECT 1 FROM `plan_prices` existing
	WHERE existing.`plan_id` = NEW.`plan_id`
		AND existing.`billing_interval` = NEW.`billing_interval`
		AND existing.`active` = 1
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN
	SELECT RAISE(ABORT, 'PRICE_VERSION_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `plan_prices_no_overlap_update`
BEFORE UPDATE OF `effective_to`, `active` ON `plan_prices`
WHEN NEW.`active` = 1 AND EXISTS (
	SELECT 1 FROM `plan_prices` existing
	WHERE existing.`id` <> NEW.`id`
		AND existing.`plan_id` = NEW.`plan_id`
		AND existing.`billing_interval` = NEW.`billing_interval`
		AND existing.`active` = 1
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN
	SELECT RAISE(ABORT, 'PRICE_VERSION_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `plan_prices_immutable_terms`
BEFORE UPDATE ON `plan_prices`
WHEN NEW.`plan_id` IS NOT OLD.`plan_id`
	OR NEW.`currency` IS NOT OLD.`currency`
	OR NEW.`billing_interval` IS NOT OLD.`billing_interval`
	OR NEW.`amount_minor` IS NOT OLD.`amount_minor`
	OR NEW.`setup_fee_minor` IS NOT OLD.`setup_fee_minor`
	OR NEW.`tax_behaviour` IS NOT OLD.`tax_behaviour`
	OR NEW.`effective_from` IS NOT OLD.`effective_from`
	OR NEW.`created_by` IS NOT OLD.`created_by`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'PLAN_PRICE_TERMS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `plan_prices_no_delete`
BEFORE DELETE ON `plan_prices`
BEGIN
	SELECT RAISE(ABORT, 'PLAN_PRICE_HISTORY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_price_overrides_no_overlap_insert`
BEFORE INSERT ON `customer_price_overrides`
WHEN NEW.`status` IN ('SCHEDULED', 'ACTIVE') AND EXISTS (
	SELECT 1 FROM `customer_price_overrides` existing
	WHERE existing.`customer_id` = NEW.`customer_id`
		AND existing.`plan_id` = NEW.`plan_id`
		AND existing.`billing_interval` = NEW.`billing_interval`
		AND existing.`status` IN ('SCHEDULED', 'ACTIVE')
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN
	SELECT RAISE(ABORT, 'PRICE_OVERRIDE_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_price_overrides_no_overlap_update`
BEFORE UPDATE OF `effective_to`, `status` ON `customer_price_overrides`
WHEN NEW.`status` IN ('SCHEDULED', 'ACTIVE') AND EXISTS (
	SELECT 1 FROM `customer_price_overrides` existing
	WHERE existing.`id` <> NEW.`id`
		AND existing.`customer_id` = NEW.`customer_id`
		AND existing.`plan_id` = NEW.`plan_id`
		AND existing.`billing_interval` = NEW.`billing_interval`
		AND existing.`status` IN ('SCHEDULED', 'ACTIVE')
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN
	SELECT RAISE(ABORT, 'PRICE_OVERRIDE_CONFLICT');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_price_overrides_immutable_terms`
BEFORE UPDATE ON `customer_price_overrides`
WHEN NEW.`customer_id` IS NOT OLD.`customer_id`
	OR NEW.`plan_id` IS NOT OLD.`plan_id`
	OR NEW.`currency` IS NOT OLD.`currency`
	OR NEW.`billing_interval` IS NOT OLD.`billing_interval`
	OR NEW.`override_amount_minor` IS NOT OLD.`override_amount_minor`
	OR NEW.`override_setup_fee_minor` IS NOT OLD.`override_setup_fee_minor`
	OR NEW.`effective_from` IS NOT OLD.`effective_from`
	OR NEW.`reason` IS NOT OLD.`reason`
	OR NEW.`created_by` IS NOT OLD.`created_by`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'PRICE_OVERRIDE_TERMS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_price_overrides_no_delete`
BEFORE DELETE ON `customer_price_overrides`
BEGIN
	SELECT RAISE(ABORT, 'PRICE_OVERRIDE_HISTORY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `price_quotes_no_update`
BEFORE UPDATE ON `price_quotes`
BEGIN
	SELECT RAISE(ABORT, 'PRICE_QUOTE_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `price_quotes_no_delete`
BEFORE DELETE ON `price_quotes`
BEGIN
	SELECT RAISE(ABORT, 'PRICE_QUOTE_IMMUTABLE');
END;
--> statement-breakpoint
PRAGMA optimize;
