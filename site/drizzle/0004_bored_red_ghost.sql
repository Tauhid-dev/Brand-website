CREATE TABLE `admin_user_roles` (
	`admin_user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_by_admin_user_id` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`admin_user_id`, `role_id`),
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `admin_user_roles_role_idx` ON `admin_user_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_provider` text NOT NULL,
	`external_subject` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text NOT NULL,
	`bootstrap` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "admin_users_status_check" CHECK("admin_users"."status" in ('ACTIVE', 'SUSPENDED')),
	CONSTRAINT "admin_users_timestamps_check" CHECK("admin_users"."updated_at" >= "admin_users"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_provider_subject_uq` ON `admin_users` (`identity_provider`,`external_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_uq` ON `admin_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_bootstrap_uq` ON `admin_users` (`bootstrap`) WHERE "admin_users"."bootstrap" = 1;--> statement-breakpoint
CREATE INDEX `admin_users_status_idx` ON `admin_users` (`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`request_id` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK("audit_events"."actor_type" in ('ANONYMOUS', 'CUSTOMER', 'ADMIN', 'SERVICE', 'SYSTEM')),
	CONSTRAINT "audit_events_actor_id_check" CHECK(("audit_events"."actor_type" = 'ANONYMOUS' and "audit_events"."actor_id" is null) or ("audit_events"."actor_type" <> 'ANONYMOUS' and "audit_events"."actor_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_created_idx` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_created_idx` ON `audit_events` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_type`,`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_request_idx` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "permissions_code_check" CHECK("permissions"."code" = upper("permissions"."code"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_code_uq` ON `permissions` (`code`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `role_permissions_permission_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`system` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "roles_code_check" CHECK("roles"."code" = upper("roles"."code")),
	CONSTRAINT "roles_timestamps_check" CHECK("roles"."updated_at" >= "roles"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_uq` ON `roles` (`code`);--> statement-breakpoint
ALTER TABLE `customer_identities` ADD `accepted_invitation_id` text REFERENCES customer_invitations(id);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_identities_invitation_uq` ON `customer_identities` (`accepted_invitation_id`);
--> statement-breakpoint
INSERT INTO `roles` (`id`, `code`, `name`, `description`, `system`, `created_at`, `updated_at`) VALUES
	('role_super_admin', 'SUPER_ADMIN', 'Super administrator', 'Full platform administration including administrator access management.', 1, 1787530000000, 1787530000000),
	('role_admin', 'ADMIN', 'Administrator', 'Broad operational administration excluding administrator access management.', 1, 1787530000000, 1787530000000),
	('role_sales', 'SALES', 'Sales', 'Customer, commercial pricing, discount and subscription sales operations.', 1, 1787530000000, 1787530000000),
	('role_support', 'SUPPORT', 'Support', 'Customer support, subscription visibility and agent-link operations.', 1, 1787530000000, 1787530000000),
	('role_read_only', 'READ_ONLY', 'Read only', 'Read-only commercial and audit visibility.', 1, 1787530000000, 1787530000000);
--> statement-breakpoint
INSERT INTO `permissions` (`id`, `code`, `name`, `description`, `created_at`) VALUES
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
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT `roles`.`id`, `permissions`.`id`, 1787530000000
FROM `roles` CROSS JOIN `permissions`
WHERE `roles`.`code` = 'SUPER_ADMIN'
	OR (`roles`.`code` = 'ADMIN' AND `permissions`.`code` <> 'ADMIN_USER_MANAGE')
	OR (`roles`.`code` = 'SALES' AND `permissions`.`code` IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'CATALOG_READ', 'PRICE_READ', 'PRICE_WRITE', 'DISCOUNT_READ', 'DISCOUNT_WRITE', 'SUBSCRIPTION_READ', 'SUBSCRIPTION_WRITE', 'BILLING_READ'))
	OR (`roles`.`code` = 'SUPPORT' AND `permissions`.`code` IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'CATALOG_READ', 'PRICE_READ', 'DISCOUNT_READ', 'SUBSCRIPTION_READ', 'BILLING_READ', 'AGENT_LINK_READ', 'AGENT_LINK_WRITE'))
	OR (`roles`.`code` = 'READ_ONLY' AND `permissions`.`code` IN ('CUSTOMER_READ', 'CATALOG_READ', 'PRICE_READ', 'DISCOUNT_READ', 'SUBSCRIPTION_READ', 'BILLING_READ', 'AGENT_LINK_READ', 'AUDIT_READ'));
--> statement-breakpoint
CREATE TRIGGER `audit_events_immutable_update`
BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_immutable_delete`
BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
END;
