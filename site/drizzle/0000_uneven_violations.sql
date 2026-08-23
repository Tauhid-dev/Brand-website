CREATE TABLE `customer_business_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`business_name` text NOT NULL,
	`trading_name` text,
	`abn` text,
	`website_url` text,
	`primary_email` text NOT NULL,
	`primary_phone` text,
	`industry` text,
	`timezone` text DEFAULT 'Australia/Sydney' NOT NULL,
	`country` text DEFAULT 'AU' NOT NULL,
	`state` text,
	`suburb` text,
	`postcode` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_business_profiles_country_check" CHECK("customer_business_profiles"."country" = 'AU'),
	CONSTRAINT "customer_business_profiles_timestamps_check" CHECK("customer_business_profiles"."updated_at" >= "customer_business_profiles"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_business_profiles_customer_uq` ON `customer_business_profiles` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_subject` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_identities_provider_subject_uq` ON `customer_identities` (`provider`,`external_subject`);--> statement-breakpoint
CREATE INDEX `customer_identities_customer_idx` ON `customer_identities` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_identities_email_idx` ON `customer_identities` (`email`);--> statement-breakpoint
CREATE TABLE `customer_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_invitations_status_check" CHECK("customer_invitations"."status" in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
	CONSTRAINT "customer_invitations_expiry_check" CHECK("customer_invitations"."expires_at" > "customer_invitations"."created_at"),
	CONSTRAINT "customer_invitations_acceptance_check" CHECK(("customer_invitations"."status" = 'ACCEPTED' and "customer_invitations"."accepted_at" is not null) or ("customer_invitations"."status" <> 'ACCEPTED' and "customer_invitations"."accepted_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_invitations_token_hash_uq` ON `customer_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `customer_invitations_email_status_idx` ON `customer_invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `customer_invitations_customer_idx` ON `customer_invitations` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`body` text NOT NULL,
	`author_type` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_notes_author_type_check" CHECK("customer_notes"."author_type" in ('ADMIN', 'SYSTEM'))
);
--> statement-breakpoint
CREATE INDEX `customer_notes_customer_created_idx` ON `customer_notes` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`external_reference` text NOT NULL,
	`business_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`industry` text,
	`website_url` text,
	`status` text NOT NULL,
	`creation_source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "customers_status_check" CHECK("customers"."status" in ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED')),
	CONSTRAINT "customers_creation_source_check" CHECK("customers"."creation_source" in ('SELF_REGISTRATION', 'ADMIN', 'INVITATION', 'MIGRATION')),
	CONSTRAINT "customers_timestamps_check" CHECK("customers"."updated_at" >= "customers"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_external_reference_uq` ON `customers` (`external_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_uq` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `customers_status_idx` ON `customers` (`status`);--> statement-breakpoint
CREATE INDEX `customers_created_at_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "offerings_display_order_check" CHECK("offerings"."display_order" >= 0),
	CONSTRAINT "offerings_timestamps_check" CHECK("offerings"."updated_at" >= "offerings"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_code_uq` ON `offerings` (`code`);--> statement-breakpoint
CREATE INDEX `offerings_active_order_idx` ON `offerings` (`active`,`display_order`);--> statement-breakpoint
CREATE TABLE `plan_features` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`included` integer DEFAULT true NOT NULL,
	`limit_value` integer,
	`limit_unit` text,
	`configuration_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plan_features_limit_check" CHECK("plan_features"."limit_value" is null or "plan_features"."limit_value" >= 0),
	CONSTRAINT "plan_features_limit_unit_check" CHECK(("plan_features"."limit_value" is null and "plan_features"."limit_unit" is null) or ("plan_features"."limit_value" is not null and "plan_features"."limit_unit" is not null)),
	CONSTRAINT "plan_features_inclusion_check" CHECK("plan_features"."included" = 1 or "plan_features"."limit_value" is null),
	CONSTRAINT "plan_features_timestamps_check" CHECK("plan_features"."updated_at" >= "plan_features"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_features_plan_offering_uq` ON `plan_features` (`plan_id`,`offering_id`);--> statement-breakpoint
CREATE INDEX `plan_features_offering_idx` ON `plan_features` (`offering_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`custom` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "plans_display_order_check" CHECK("plans"."display_order" >= 0),
	CONSTRAINT "plans_timestamps_check" CHECK("plans"."updated_at" >= "plans"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_code_uq` ON `plans` (`code`);--> statement-breakpoint
CREATE INDEX `plans_active_order_idx` ON `plans` (`active`,`display_order`);