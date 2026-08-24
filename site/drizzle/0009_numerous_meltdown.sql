PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notification_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `channel` text NOT NULL,
  `version` integer NOT NULL,
  `subject_template` text,
  `body_template` text NOT NULL,
  `required_service_notice` integer DEFAULT false NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT "notification_templates_code_check" CHECK(`code` = lower(`code`)),
  CONSTRAINT "notification_templates_channel_check" CHECK(`channel` in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  CONSTRAINT "notification_templates_version_check" CHECK(`version` > 0),
  CONSTRAINT "notification_templates_subject_check" CHECK(`channel` <> 'EMAIL' or `subject_template` is not null),
  CONSTRAINT "notification_templates_timestamps_check" CHECK(`updated_at` >= `created_at`)
);--> statement-breakpoint
INSERT INTO `__new_notification_templates` SELECT * FROM `notification_templates`;--> statement-breakpoint
DROP TABLE `notification_templates`;--> statement-breakpoint
ALTER TABLE `__new_notification_templates` RENAME TO `notification_templates`;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_code_channel_version_uq` ON `notification_templates` (`code`,`channel`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_active_code_channel_uq` ON `notification_templates` (`code`,`channel`) WHERE `active` = 1;--> statement-breakpoint

CREATE TABLE `__new_notification_preferences` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL,
  `notification_code` text NOT NULL,
  `channel` text NOT NULL,
  `status` text NOT NULL,
  `updated_by` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict,
  CONSTRAINT "notification_preferences_code_check" CHECK(`notification_code` = lower(`notification_code`)),
  CONSTRAINT "notification_preferences_channel_check" CHECK(`channel` in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  CONSTRAINT "notification_preferences_status_check" CHECK(`status` in ('OPTED_IN', 'OPTED_OUT')),
  CONSTRAINT "notification_preferences_timestamps_check" CHECK(`updated_at` >= `created_at`)
);--> statement-breakpoint
INSERT INTO `__new_notification_preferences` SELECT * FROM `notification_preferences`;--> statement-breakpoint
DROP TABLE `notification_preferences`;--> statement-breakpoint
ALTER TABLE `__new_notification_preferences` RENAME TO `notification_preferences`;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_customer_code_channel_uq` ON `notification_preferences` (`customer_id`,`notification_code`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_preferences_customer_idx` ON `notification_preferences` (`customer_id`);--> statement-breakpoint

CREATE TABLE `__new_notification_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `customer_id` text,
  `recipient_type` text NOT NULL,
  `recipient_id` text NOT NULL,
  `channel` text NOT NULL,
  `status` text NOT NULL,
  `template_variables_json` text DEFAULT '{}' NOT NULL,
  `idempotency_key` text NOT NULL,
  `scheduled_for` integer NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 5 NOT NULL,
  `next_attempt_at` integer,
  `processing_started_at` integer,
  `lease_expires_at` integer,
  `provider_reference` text,
  `error_category` text,
  `sent_at` integer,
  `cancelled_at` integer,
  `read_at` integer,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`) ON DELETE restrict,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict,
  CONSTRAINT "notification_deliveries_recipient_check" CHECK(`recipient_type` in ('CUSTOMER', 'ADMIN', 'SYSTEM')),
  CONSTRAINT "notification_deliveries_channel_check" CHECK(`channel` in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  CONSTRAINT "notification_deliveries_status_check" CHECK(`status` in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
  CONSTRAINT "notification_deliveries_attempt_check" CHECK(`attempt_count` >= 0 and `max_attempts` > 0 and `attempt_count` <= `max_attempts`),
  CONSTRAINT "notification_deliveries_outcome_check" CHECK((`status` = 'SENT' and `sent_at` is not null and `provider_reference` is not null and `error_category` is null and `cancelled_at` is null) or (`status` = 'FAILED' and `sent_at` is null and `error_category` is not null and `cancelled_at` is null) or (`status` in ('PENDING', 'PROCESSING') and `sent_at` is null and `error_category` is null and `cancelled_at` is null) or (`status` = 'CANCELLED' and `sent_at` is null and `error_category` is null and `cancelled_at` is not null)),
  CONSTRAINT "notification_deliveries_lease_check" CHECK((`status` = 'PROCESSING' and `processing_started_at` is not null and `lease_expires_at` is not null) or (`status` <> 'PROCESSING' and `processing_started_at` is null and `lease_expires_at` is null)),
  CONSTRAINT "notification_deliveries_read_check" CHECK(`read_at` is null or (`channel` = 'IN_APP' and `status` = 'SENT' and `read_at` >= `sent_at`)),
  CONSTRAINT "notification_deliveries_version_check" CHECK(`version` > 0),
  CONSTRAINT "notification_deliveries_timestamps_check" CHECK(`updated_at` >= `created_at`)
);--> statement-breakpoint
INSERT INTO `__new_notification_deliveries` (
  `id`,`template_id`,`customer_id`,`recipient_type`,`recipient_id`,`channel`,`status`,
  `template_variables_json`,`idempotency_key`,`scheduled_for`,`attempt_count`,`max_attempts`,
  `next_attempt_at`,`processing_started_at`,`lease_expires_at`,`provider_reference`,`error_category`,
  `sent_at`,`cancelled_at`,`read_at`,`version`,`created_at`,`updated_at`
)
SELECT
  `id`,`template_id`,`customer_id`,`recipient_type`,`recipient_id`,`channel`,
  CASE WHEN `status` = 'PROCESSING' THEN 'PENDING' ELSE `status` END,
  `template_variables_json`,`idempotency_key`,`scheduled_for`,`attempt_count`,`max_attempts`,
  CASE WHEN `status` = 'PROCESSING' THEN `updated_at` ELSE `next_attempt_at` END,
  NULL,NULL,`provider_reference`,`error_category`,`sent_at`,
  CASE WHEN `status` = 'CANCELLED' THEN `updated_at` ELSE NULL END,
  NULL,CASE WHEN `status` = 'PROCESSING' THEN `version` + 1 ELSE `version` END,`created_at`,`updated_at`
FROM `notification_deliveries`;--> statement-breakpoint
DROP TABLE `notification_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_notification_deliveries` RENAME TO `notification_deliveries`;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_idempotency_uq` ON `notification_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_retry_idx` ON `notification_deliveries` (`status`,`next_attempt_at`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_customer_created_idx` ON `notification_deliveries` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_recipient_status_idx` ON `notification_deliveries` (`recipient_type`,`recipient_id`,`status`);--> statement-breakpoint

CREATE TABLE `notification_delivery_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `delivery_id` text NOT NULL,
  `attempt_number` integer NOT NULL,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `provider_reference` text,
  `error_category` text,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`delivery_id`) REFERENCES `notification_deliveries`(`id`) ON DELETE restrict,
  CONSTRAINT "notification_delivery_attempts_number_check" CHECK(`attempt_number` > 0),
  CONSTRAINT "notification_delivery_attempts_status_check" CHECK(`status` in ('PROCESSING', 'SENT', 'FAILED')),
  CONSTRAINT "notification_delivery_attempts_outcome_check" CHECK((`status` = 'PROCESSING' and `completed_at` is null and `provider_reference` is null and `error_category` is null) or (`status` = 'SENT' and `completed_at` is not null and `provider_reference` is not null and `error_category` is null) or (`status` = 'FAILED' and `completed_at` is not null and `provider_reference` is null and `error_category` is not null))
);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_attempts_delivery_number_uq` ON `notification_delivery_attempts` (`delivery_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `notification_delivery_attempts_delivery_created_idx` ON `notification_delivery_attempts` (`delivery_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_delivery_attempts_status_created_idx` ON `notification_delivery_attempts` (`status`,`created_at`);--> statement-breakpoint

INSERT INTO `notification_templates` (`id`,`code`,`channel`,`version`,`subject_template`,`body_template`,`required_service_notice`,`active`,`created_at`,`updated_at`) VALUES
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
('12000000-0000-4000-8000-000000000014','integration_action_required','EMAIL',1,'Action required for {{integration}}','Hi {{name}}, your {{integration}} integration is {{status}} and needs attention.',1,1,1787577001094,1787577001094);--> statement-breakpoint

INSERT INTO `permissions` (`id`,`code`,`name`,`description`,`created_at`) VALUES
('permission_operations_read','OPERATIONS_READ','Read operations','View operational work queues and notification delivery state.',1787577001094),
('permission_operations_write','OPERATIONS_WRITE','Manage operations','Reconcile, claim and resolve operational work and notification requests.',1787577001094);--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`,`permission_id`,`created_at`)
SELECT `roles`.`id`,`permissions`.`id`,1787577001094
FROM `roles` CROSS JOIN `permissions`
WHERE `permissions`.`code` IN ('OPERATIONS_READ','OPERATIONS_WRITE')
AND (
  `roles`.`code` IN ('SUPER_ADMIN','ADMIN','SALES','SUPPORT')
  OR (`roles`.`code` = 'READ_ONLY' AND `permissions`.`code` = 'OPERATIONS_READ')
);--> statement-breakpoint

CREATE TRIGGER `notification_deliveries_validate_update`
BEFORE UPDATE ON `notification_deliveries`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'NOTIFICATION_VERSION_CONFLICT') END; END;--> statement-breakpoint
CREATE TRIGGER `notification_templates_immutable_content`
BEFORE UPDATE OF `code`, `channel`, `version`, `subject_template`, `body_template`, `required_service_notice`, `created_at` ON `notification_templates`
BEGIN SELECT RAISE(ABORT, 'NOTIFICATION_TEMPLATE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `notification_delivery_attempts_immutable_update`
BEFORE UPDATE OF `delivery_id`, `attempt_number`, `provider`, `started_at`, `created_at` ON `notification_delivery_attempts`
BEGIN SELECT RAISE(ABORT, 'NOTIFICATION_ATTEMPT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `notification_delivery_attempts_no_delete`
BEFORE DELETE ON `notification_delivery_attempts`
BEGIN SELECT RAISE(ABORT, 'NOTIFICATION_ATTEMPT_IMMUTABLE'); END;--> statement-breakpoint
PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA optimize;
