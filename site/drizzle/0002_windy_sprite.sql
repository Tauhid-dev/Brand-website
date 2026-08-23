CREATE TABLE `customer_discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`discount_id` text NOT NULL,
	`promotion_code_id` text,
	`source` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`status` text NOT NULL,
	`applied_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`promotion_code_id`) REFERENCES `promotion_codes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "customer_discounts_source_check" CHECK("customer_discounts"."source" in ('ADMIN', 'PROMOTION_CODE', 'SALES', 'MIGRATION', 'SYSTEM')),
	CONSTRAINT "customer_discounts_status_check" CHECK("customer_discounts"."status" in ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "customer_discounts_range_check" CHECK("customer_discounts"."effective_to" is null or "customer_discounts"."effective_to" > "customer_discounts"."effective_from"),
	CONSTRAINT "customer_discounts_timestamps_check" CHECK("customer_discounts"."updated_at" >= "customer_discounts"."created_at")
);
--> statement-breakpoint
CREATE INDEX `customer_discounts_effective_lookup_idx` ON `customer_discounts` (`customer_id`,`status`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE INDEX `customer_discounts_discount_idx` ON `customer_discounts` (`discount_id`);--> statement-breakpoint
CREATE INDEX `customer_discounts_promotion_idx` ON `customer_discounts` (`promotion_code_id`);--> statement-breakpoint
CREATE TABLE `discount_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_id` text NOT NULL,
	`promotion_code_id` text,
	`customer_discount_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`redemption_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount_discounted_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`redeemed_at` integer NOT NULL,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`promotion_code_id`) REFERENCES `promotion_codes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_discount_id`) REFERENCES `customer_discounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "discount_redemptions_type_check" CHECK("discount_redemptions"."redemption_type" in ('PROMOTION_CLAIM', 'CHARGE_APPLICATION')),
	CONSTRAINT "discount_redemptions_amount_check" CHECK("discount_redemptions"."amount_discounted_minor" >= 0 and length("discount_redemptions"."currency") = 3 and "discount_redemptions"."currency" = upper("discount_redemptions"."currency")),
	CONSTRAINT "discount_redemptions_claim_check" CHECK(("discount_redemptions"."redemption_type" = 'PROMOTION_CLAIM' and "discount_redemptions"."promotion_code_id" is not null and "discount_redemptions"."amount_discounted_minor" = 0) or ("discount_redemptions"."redemption_type" = 'CHARGE_APPLICATION' and "discount_redemptions"."amount_discounted_minor" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discount_redemptions_idempotency_uq` ON `discount_redemptions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_promotion_idx` ON `discount_redemptions` (`promotion_code_id`,`redeemed_at`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_discount_idx` ON `discount_redemptions` (`discount_id`,`redeemed_at`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_customer_idx` ON `discount_redemptions` (`customer_id`,`redeemed_at`);--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`percent_off_basis_points` integer,
	`amount_off_minor` integer,
	`currency` text,
	`duration_type` text NOT NULL,
	`duration_months` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`max_redemptions` integer,
	`active` integer DEFAULT true NOT NULL,
	`stackable` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "discounts_code_check" CHECK("discounts"."code" = lower("discounts"."code")),
	CONSTRAINT "discounts_type_check" CHECK("discounts"."discount_type" in ('PERCENTAGE', 'FIXED_AMOUNT')),
	CONSTRAINT "discounts_value_check" CHECK(("discounts"."discount_type" = 'PERCENTAGE' and "discounts"."percent_off_basis_points" between 1 and 10000 and "discounts"."amount_off_minor" is null and "discounts"."currency" is null) or ("discounts"."discount_type" = 'FIXED_AMOUNT' and "discounts"."percent_off_basis_points" is null and "discounts"."amount_off_minor" > 0 and length("discounts"."currency") = 3 and "discounts"."currency" = upper("discounts"."currency"))),
	CONSTRAINT "discounts_duration_check" CHECK(("discounts"."duration_type" = 'REPEATING' and "discounts"."duration_months" > 0) or ("discounts"."duration_type" in ('ONCE', 'FOREVER') and "discounts"."duration_months" is null)),
	CONSTRAINT "discounts_range_check" CHECK("discounts"."ends_at" is null or "discounts"."ends_at" > "discounts"."starts_at"),
	CONSTRAINT "discounts_max_redemptions_check" CHECK("discounts"."max_redemptions" is null or "discounts"."max_redemptions" > 0),
	CONSTRAINT "discounts_timestamps_check" CHECK("discounts"."updated_at" >= "discounts"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discounts_code_uq` ON `discounts` (`code`);--> statement-breakpoint
CREATE INDEX `discounts_effective_lookup_idx` ON `discounts` (`active`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `promotion_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_id` text NOT NULL,
	`code` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`customer_id` text,
	`plan_id` text,
	`starts_at` integer NOT NULL,
	`expires_at` integer,
	`max_redemptions` integer,
	`redemption_count` integer DEFAULT 0 NOT NULL,
	`first_purchase_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotion_codes_normalised_check" CHECK("promotion_codes"."code" = upper("promotion_codes"."code") and length("promotion_codes"."code") between 3 and 64),
	CONSTRAINT "promotion_codes_range_check" CHECK("promotion_codes"."expires_at" is null or "promotion_codes"."expires_at" > "promotion_codes"."starts_at"),
	CONSTRAINT "promotion_codes_redemption_check" CHECK("promotion_codes"."redemption_count" >= 0 and ("promotion_codes"."max_redemptions" is null or ("promotion_codes"."max_redemptions" > 0 and "promotion_codes"."redemption_count" <= "promotion_codes"."max_redemptions"))),
	CONSTRAINT "promotion_codes_timestamps_check" CHECK("promotion_codes"."updated_at" >= "promotion_codes"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_codes_code_uq` ON `promotion_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promotion_codes_discount_idx` ON `promotion_codes` (`discount_id`);--> statement-breakpoint
CREATE INDEX `promotion_codes_effective_lookup_idx` ON `promotion_codes` (`active`,`starts_at`,`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `customer_discounts_no_overlap_insert`
BEFORE INSERT ON `customer_discounts`
WHEN NEW.`status` IN ('SCHEDULED', 'ACTIVE') AND EXISTS (
	SELECT 1 FROM `customer_discounts` existing
	WHERE existing.`customer_id` = NEW.`customer_id`
		AND existing.`discount_id` = NEW.`discount_id`
		AND existing.`status` IN ('SCHEDULED', 'ACTIVE')
		AND NEW.`effective_from` < COALESCE(existing.`effective_to`, 9223372036854775807)
		AND existing.`effective_from` < COALESCE(NEW.`effective_to`, 9223372036854775807)
)
BEGIN SELECT RAISE(ABORT, 'CUSTOMER_DISCOUNT_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_validate_claim`
BEFORE INSERT ON `discount_redemptions`
WHEN NEW.`redemption_type` = 'PROMOTION_CLAIM'
BEGIN
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `promotion_codes` code
		JOIN `discounts` discount ON discount.`id` = code.`discount_id`
		WHERE code.`id` = NEW.`promotion_code_id`
			AND code.`discount_id` = NEW.`discount_id`
			AND code.`active` = 1 AND discount.`active` = 1
			AND code.`starts_at` <= NEW.`redeemed_at`
			AND (code.`expires_at` IS NULL OR code.`expires_at` > NEW.`redeemed_at`)
			AND discount.`starts_at` <= NEW.`redeemed_at`
			AND (discount.`ends_at` IS NULL OR discount.`ends_at` > NEW.`redeemed_at`)
			AND (code.`customer_id` IS NULL OR code.`customer_id` = NEW.`customer_id`)
			AND (code.`plan_id` IS NULL OR code.`plan_id` = NEW.`plan_id`)
			AND (code.`max_redemptions` IS NULL OR code.`redemption_count` < code.`max_redemptions`)
			AND (discount.`max_redemptions` IS NULL OR (
				SELECT COUNT(*) FROM `discount_redemptions` used
				WHERE used.`discount_id` = discount.`id` AND used.`redemption_type` = 'PROMOTION_CLAIM'
			) < discount.`max_redemptions`)
	) THEN RAISE(ABORT, 'PROMOTION_CODE_INELIGIBLE') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `customer_discounts` assignment
		WHERE assignment.`id` = NEW.`customer_discount_id`
			AND assignment.`customer_id` = NEW.`customer_id`
			AND assignment.`discount_id` = NEW.`discount_id`
			AND assignment.`promotion_code_id` = NEW.`promotion_code_id`
	) THEN RAISE(ABORT, 'PROMOTION_ASSIGNMENT_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_once_only`
BEFORE INSERT ON `discount_redemptions`
WHEN NEW.`redemption_type` = 'CHARGE_APPLICATION' AND EXISTS (
	SELECT 1 FROM `customer_discounts` assignment
	JOIN `discounts` discount ON discount.`id` = assignment.`discount_id`
	WHERE assignment.`id` = NEW.`customer_discount_id`
		AND discount.`duration_type` = 'ONCE'
		AND EXISTS (
			SELECT 1 FROM `discount_redemptions` used
			WHERE used.`customer_discount_id` = NEW.`customer_discount_id`
				AND used.`redemption_type` = 'CHARGE_APPLICATION'
		)
)
BEGIN SELECT RAISE(ABORT, 'ONCE_DISCOUNT_ALREADY_USED'); END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_validate_application`
BEFORE INSERT ON `discount_redemptions`
WHEN NEW.`redemption_type` = 'CHARGE_APPLICATION' AND NOT EXISTS (
	SELECT 1 FROM `customer_discounts` assignment
	LEFT JOIN `promotion_codes` code ON code.`id` = assignment.`promotion_code_id`
	WHERE assignment.`id` = NEW.`customer_discount_id`
		AND assignment.`customer_id` = NEW.`customer_id`
		AND assignment.`discount_id` = NEW.`discount_id`
		AND (NEW.`promotion_code_id` IS NULL OR NEW.`promotion_code_id` = assignment.`promotion_code_id`)
		AND (code.`plan_id` IS NULL OR code.`plan_id` = NEW.`plan_id`)
)
BEGIN SELECT RAISE(ABORT, 'DISCOUNT_APPLICATION_MISMATCH'); END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_increment_code`
AFTER INSERT ON `discount_redemptions`
WHEN NEW.`redemption_type` = 'PROMOTION_CLAIM'
BEGIN
	UPDATE `promotion_codes`
	SET `redemption_count` = `redemption_count` + 1, `updated_at` = NEW.`redeemed_at`
	WHERE `id` = NEW.`promotion_code_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_no_update`
BEFORE UPDATE ON `discount_redemptions`
BEGIN SELECT RAISE(ABORT, 'DISCOUNT_REDEMPTION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `discount_redemptions_no_delete`
BEFORE DELETE ON `discount_redemptions`
BEGIN SELECT RAISE(ABORT, 'DISCOUNT_REDEMPTION_IMMUTABLE'); END;
--> statement-breakpoint
PRAGMA optimize;
