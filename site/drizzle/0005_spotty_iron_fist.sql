CREATE TABLE `agent_links` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`agent_platform` text NOT NULL,
	`external_agent_id` text,
	`status` text NOT NULL,
	`last_synced_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_links_platform_check" CHECK("agent_links"."agent_platform" = lower("agent_links"."agent_platform")),
	CONSTRAINT "agent_links_status_check" CHECK("agent_links"."status" in ('NOT_PROVISIONED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ERROR')),
	CONSTRAINT "agent_links_external_check" CHECK("agent_links"."status" not in ('ACTIVE', 'SUSPENDED') or "agent_links"."external_agent_id" is not null),
	CONSTRAINT "agent_links_version_check" CHECK("agent_links"."version" > 0),
	CONSTRAINT "agent_links_timestamps_check" CHECK("agent_links"."updated_at" >= "agent_links"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_links_customer_platform_uq` ON `agent_links` (`customer_id`,`agent_platform`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_links_platform_external_uq` ON `agent_links` (`agent_platform`,`external_agent_id`) WHERE "agent_links"."external_agent_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_links_status_idx` ON `agent_links` (`status`);--> statement-breakpoint
CREATE TABLE `agent_provisioning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_link_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` integer,
	`error_category` text,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_link_id`) REFERENCES `agent_links`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_provisioning_jobs_operation_check" CHECK("agent_provisioning_jobs"."operation" in ('PROVISION', 'UPDATE', 'SUSPEND', 'RESUME')),
	CONSTRAINT "agent_provisioning_jobs_status_check" CHECK("agent_provisioning_jobs"."status" in ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "agent_provisioning_jobs_attempt_check" CHECK("agent_provisioning_jobs"."attempt_count" >= 0 and "agent_provisioning_jobs"."max_attempts" > 0 and "agent_provisioning_jobs"."attempt_count" <= "agent_provisioning_jobs"."max_attempts"),
	CONSTRAINT "agent_provisioning_jobs_outcome_check" CHECK(("agent_provisioning_jobs"."status" = 'SUCCEEDED' and "agent_provisioning_jobs"."completed_at" is not null and "agent_provisioning_jobs"."error_category" is null) or ("agent_provisioning_jobs"."status" = 'FAILED' and "agent_provisioning_jobs"."completed_at" is not null and "agent_provisioning_jobs"."error_category" is not null) or ("agent_provisioning_jobs"."status" in ('PENDING', 'IN_PROGRESS', 'CANCELLED') and "agent_provisioning_jobs"."completed_at" is null and "agent_provisioning_jobs"."error_category" is null)),
	CONSTRAINT "agent_provisioning_jobs_version_check" CHECK("agent_provisioning_jobs"."version" > 0),
	CONSTRAINT "agent_provisioning_jobs_timestamps_check" CHECK("agent_provisioning_jobs"."updated_at" >= "agent_provisioning_jobs"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_provisioning_jobs_idempotency_uq` ON `agent_provisioning_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_jobs_link_status_idx` ON `agent_provisioning_jobs` (`agent_link_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_jobs_customer_status_idx` ON `agent_provisioning_jobs` (`customer_id`,`status`);--> statement-breakpoint
CREATE TABLE `customer_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`integration_code` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`last_checked_at` integer,
	`last_successful_at` integer,
	`error_code` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "customer_integrations_code_check" CHECK("customer_integrations"."integration_code" = lower("customer_integrations"."integration_code")),
	CONSTRAINT "customer_integrations_status_check" CHECK("customer_integrations"."status" in ('NOT_CONNECTED', 'PENDING', 'HEALTHY', 'DEGRADED', 'ERROR', 'DISABLED')),
	CONSTRAINT "customer_integrations_error_check" CHECK(("customer_integrations"."status" in ('DEGRADED', 'ERROR') and "customer_integrations"."error_code" is not null) or ("customer_integrations"."status" not in ('DEGRADED', 'ERROR') and "customer_integrations"."error_code" is null)),
	CONSTRAINT "customer_integrations_version_check" CHECK("customer_integrations"."version" > 0),
	CONSTRAINT "customer_integrations_timestamps_check" CHECK("customer_integrations"."updated_at" >= "customer_integrations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_integrations_customer_code_uq` ON `customer_integrations` (`customer_id`,`integration_code`);--> statement-breakpoint
CREATE INDEX `customer_integrations_customer_status_idx` ON `customer_integrations` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `customer_integrations_category_status_idx` ON `customer_integrations` (`category`,`status`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
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
	`provider_reference` text,
	`error_category` text,
	`sent_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notification_deliveries_recipient_check" CHECK("notification_deliveries"."recipient_type" in ('CUSTOMER', 'ADMIN', 'SYSTEM')),
	CONSTRAINT "notification_deliveries_channel_check" CHECK("notification_deliveries"."channel" in ('EMAIL', 'SMS', 'IN_APP')),
	CONSTRAINT "notification_deliveries_status_check" CHECK("notification_deliveries"."status" in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
	CONSTRAINT "notification_deliveries_attempt_check" CHECK("notification_deliveries"."attempt_count" >= 0 and "notification_deliveries"."max_attempts" > 0 and "notification_deliveries"."attempt_count" <= "notification_deliveries"."max_attempts"),
	CONSTRAINT "notification_deliveries_outcome_check" CHECK(("notification_deliveries"."status" = 'SENT' and "notification_deliveries"."sent_at" is not null and "notification_deliveries"."provider_reference" is not null and "notification_deliveries"."error_category" is null) or ("notification_deliveries"."status" = 'FAILED' and "notification_deliveries"."sent_at" is null and "notification_deliveries"."error_category" is not null) or ("notification_deliveries"."status" in ('PENDING', 'PROCESSING', 'CANCELLED') and "notification_deliveries"."sent_at" is null and "notification_deliveries"."error_category" is null)),
	CONSTRAINT "notification_deliveries_version_check" CHECK("notification_deliveries"."version" > 0),
	CONSTRAINT "notification_deliveries_timestamps_check" CHECK("notification_deliveries"."updated_at" >= "notification_deliveries"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_idempotency_uq` ON `notification_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_retry_idx` ON `notification_deliveries` (`status`,`next_attempt_at`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_customer_created_idx` ON `notification_deliveries` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_recipient_status_idx` ON `notification_deliveries` (`recipient_type`,`recipient_id`,`status`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`notification_code` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notification_preferences_code_check" CHECK("notification_preferences"."notification_code" = lower("notification_preferences"."notification_code")),
	CONSTRAINT "notification_preferences_channel_check" CHECK("notification_preferences"."channel" in ('EMAIL', 'SMS', 'IN_APP')),
	CONSTRAINT "notification_preferences_status_check" CHECK("notification_preferences"."status" in ('OPTED_IN', 'OPTED_OUT')),
	CONSTRAINT "notification_preferences_timestamps_check" CHECK("notification_preferences"."updated_at" >= "notification_preferences"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_customer_code_channel_uq` ON `notification_preferences` (`customer_id`,`notification_code`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_preferences_customer_idx` ON `notification_preferences` (`customer_id`);--> statement-breakpoint
CREATE TABLE `notification_templates` (
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
	CONSTRAINT "notification_templates_code_check" CHECK("notification_templates"."code" = lower("notification_templates"."code")),
	CONSTRAINT "notification_templates_channel_check" CHECK("notification_templates"."channel" in ('EMAIL', 'SMS', 'IN_APP')),
	CONSTRAINT "notification_templates_version_check" CHECK("notification_templates"."version" > 0),
	CONSTRAINT "notification_templates_subject_check" CHECK("notification_templates"."channel" <> 'EMAIL' or "notification_templates"."subject_template" is not null),
	CONSTRAINT "notification_templates_timestamps_check" CHECK("notification_templates"."updated_at" >= "notification_templates"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_code_channel_version_uq` ON `notification_templates` (`code`,`channel`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_active_code_channel_uq` ON `notification_templates` (`code`,`channel`) WHERE "notification_templates"."active" = 1;--> statement-breakpoint
CREATE TABLE `onboarding_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`ready_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "onboarding_cases_status_check" CHECK("onboarding_cases"."status" in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "onboarding_cases_version_check" CHECK("onboarding_cases"."version" > 0),
	CONSTRAINT "onboarding_cases_timestamps_check" CHECK("onboarding_cases"."updated_at" >= "onboarding_cases"."created_at"),
	CONSTRAINT "onboarding_cases_lifecycle_check" CHECK(
      ("onboarding_cases"."status" = 'NOT_STARTED' and "onboarding_cases"."started_at" is null and "onboarding_cases"."ready_at" is null and "onboarding_cases"."completed_at" is null and "onboarding_cases"."cancelled_at" is null) or
      ("onboarding_cases"."status" in ('IN_PROGRESS', 'BLOCKED') and "onboarding_cases"."started_at" is not null and "onboarding_cases"."ready_at" is null and "onboarding_cases"."completed_at" is null and "onboarding_cases"."cancelled_at" is null) or
      ("onboarding_cases"."status" = 'READY' and "onboarding_cases"."started_at" is not null and "onboarding_cases"."ready_at" is not null and "onboarding_cases"."completed_at" is null and "onboarding_cases"."cancelled_at" is null) or
      ("onboarding_cases"."status" = 'COMPLETED' and "onboarding_cases"."started_at" is not null and "onboarding_cases"."ready_at" is not null and "onboarding_cases"."completed_at" is not null and "onboarding_cases"."cancelled_at" is null) or
      ("onboarding_cases"."status" = 'CANCELLED' and "onboarding_cases"."completed_at" is null and "onboarding_cases"."cancelled_at" is not null)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_cases_current_customer_uq` ON `onboarding_cases` (`customer_id`) WHERE "onboarding_cases"."status" in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY');--> statement-breakpoint
CREATE INDEX `onboarding_cases_customer_status_idx` ON `onboarding_cases` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `onboarding_cases_status_updated_idx` ON `onboarding_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `onboarding_task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on_task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `onboarding_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_task_id`) REFERENCES `onboarding_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_task_dependencies_not_self_check" CHECK("onboarding_task_dependencies"."task_id" <> "onboarding_task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
CREATE INDEX `onboarding_task_dependencies_dependency_idx` ON `onboarding_task_dependencies` (`depends_on_task_id`);--> statement-breakpoint
CREATE TABLE `onboarding_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`onboarding_case_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`owner_type` text NOT NULL,
	`status` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`due_at` integer,
	`blocked_reason` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`onboarding_case_id`) REFERENCES `onboarding_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_tasks_code_check" CHECK("onboarding_tasks"."code" = lower("onboarding_tasks"."code")),
	CONSTRAINT "onboarding_tasks_owner_check" CHECK("onboarding_tasks"."owner_type" in ('CUSTOMER', 'INTERNAL')),
	CONSTRAINT "onboarding_tasks_status_check" CHECK("onboarding_tasks"."status" in ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED', 'CANCELLED')),
	CONSTRAINT "onboarding_tasks_order_check" CHECK("onboarding_tasks"."sort_order" >= 0),
	CONSTRAINT "onboarding_tasks_version_check" CHECK("onboarding_tasks"."version" > 0),
	CONSTRAINT "onboarding_tasks_completion_check" CHECK(("onboarding_tasks"."status" = 'DONE' and "onboarding_tasks"."completed_at" is not null) or ("onboarding_tasks"."status" <> 'DONE' and "onboarding_tasks"."completed_at" is null)),
	CONSTRAINT "onboarding_tasks_blocked_check" CHECK(("onboarding_tasks"."status" = 'BLOCKED' and "onboarding_tasks"."blocked_reason" is not null) or ("onboarding_tasks"."status" <> 'BLOCKED' and "onboarding_tasks"."blocked_reason" is null)),
	CONSTRAINT "onboarding_tasks_timestamps_check" CHECK("onboarding_tasks"."updated_at" >= "onboarding_tasks"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_tasks_case_code_uq` ON `onboarding_tasks` (`onboarding_case_id`,`code`);--> statement-breakpoint
CREATE INDEX `onboarding_tasks_case_owner_status_idx` ON `onboarding_tasks` (`onboarding_case_id`,`owner_type`,`status`);--> statement-breakpoint
CREATE INDEX `onboarding_tasks_status_due_idx` ON `onboarding_tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `operational_queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`customer_id` text,
	`status` text NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`title` text NOT NULL,
	`available_at` integer NOT NULL,
	`due_at` integer,
	`assigned_to_admin_user_id` text,
	`claimed_at` integer,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "operational_queue_items_type_check" CHECK("operational_queue_items"."queue_type" in ('CUSTOMER_ACTION', 'INTERNAL_ACTION', 'BILLING_ATTENTION', 'AGENT_PROVISIONING')),
	CONSTRAINT "operational_queue_items_status_check" CHECK("operational_queue_items"."status" in ('OPEN', 'CLAIMED', 'COMPLETED', 'DISMISSED')),
	CONSTRAINT "operational_queue_items_priority_check" CHECK("operational_queue_items"."priority" between 0 and 100),
	CONSTRAINT "operational_queue_items_claim_check" CHECK(("operational_queue_items"."status" = 'CLAIMED' and "operational_queue_items"."assigned_to_admin_user_id" is not null and "operational_queue_items"."claimed_at" is not null and "operational_queue_items"."resolved_at" is null) or ("operational_queue_items"."status" = 'OPEN' and "operational_queue_items"."assigned_to_admin_user_id" is null and "operational_queue_items"."claimed_at" is null and "operational_queue_items"."resolved_at" is null) or ("operational_queue_items"."status" in ('COMPLETED', 'DISMISSED') and "operational_queue_items"."resolved_at" is not null)),
	CONSTRAINT "operational_queue_items_version_check" CHECK("operational_queue_items"."version" > 0),
	CONSTRAINT "operational_queue_items_timestamps_check" CHECK("operational_queue_items"."updated_at" >= "operational_queue_items"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_queue_items_open_source_uq` ON `operational_queue_items` (`queue_type`,`source_type`,`source_id`) WHERE "operational_queue_items"."status" in ('OPEN', 'CLAIMED');--> statement-breakpoint
CREATE INDEX `operational_queue_items_work_idx` ON `operational_queue_items` (`queue_type`,`status`,`priority`,`available_at`);--> statement-breakpoint
CREATE INDEX `operational_queue_items_customer_status_idx` ON `operational_queue_items` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `operational_queue_items_assignee_status_idx` ON `operational_queue_items` (`assigned_to_admin_user_id`,`status`);
--> statement-breakpoint
CREATE TRIGGER `onboarding_cases_validate_update`
BEFORE UPDATE ON `onboarding_cases`
BEGIN
	SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'ONBOARDING_VERSION_CONFLICT') END;
	SELECT CASE WHEN
		(OLD.`status` = 'NOT_STARTED' AND NEW.`status` NOT IN ('IN_PROGRESS', 'BLOCKED', 'READY', 'CANCELLED')) OR
		(OLD.`status` = 'IN_PROGRESS' AND NEW.`status` NOT IN ('IN_PROGRESS', 'BLOCKED', 'READY', 'CANCELLED')) OR
		(OLD.`status` = 'BLOCKED' AND NEW.`status` NOT IN ('IN_PROGRESS', 'BLOCKED', 'READY', 'CANCELLED')) OR
		(OLD.`status` = 'READY' AND NEW.`status` NOT IN ('IN_PROGRESS', 'BLOCKED', 'READY', 'COMPLETED', 'CANCELLED')) OR
		(OLD.`status` IN ('COMPLETED', 'CANCELLED'))
	THEN RAISE(ABORT, 'INVALID_ONBOARDING_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER `onboarding_tasks_validate_update`
BEFORE UPDATE ON `onboarding_tasks`
BEGIN
	SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'ONBOARDING_TASK_VERSION_CONFLICT') END;
	SELECT CASE WHEN OLD.`status` IN ('DONE', 'SKIPPED', 'CANCELLED') THEN RAISE(ABORT, 'ONBOARDING_TASK_CLOSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `onboarding_dependencies_same_case`
BEFORE INSERT ON `onboarding_task_dependencies`
BEGIN
	SELECT CASE WHEN
		(SELECT `onboarding_case_id` FROM `onboarding_tasks` WHERE `id` = NEW.`task_id`) <>
		(SELECT `onboarding_case_id` FROM `onboarding_tasks` WHERE `id` = NEW.`depends_on_task_id`)
	THEN RAISE(ABORT, 'ONBOARDING_DEPENDENCY_CASE_MISMATCH') END;
	SELECT CASE WHEN EXISTS (
		WITH RECURSIVE dependencies(`task_id`) AS (
			SELECT NEW.`depends_on_task_id`
			UNION ALL
			SELECT d.`depends_on_task_id` FROM `onboarding_task_dependencies` d JOIN dependencies x ON d.`task_id` = x.`task_id`
		) SELECT 1 FROM dependencies WHERE `task_id` = NEW.`task_id`
	) THEN RAISE(ABORT, 'CYCLIC_ONBOARDING_DEPENDENCY') END;
END;
--> statement-breakpoint
CREATE TRIGGER `customer_integrations_validate_update`
BEFORE UPDATE ON `customer_integrations`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'INTEGRATION_VERSION_CONFLICT') END; END;
--> statement-breakpoint
CREATE TRIGGER `agent_links_validate_update`
BEFORE UPDATE ON `agent_links`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'AGENT_LINK_VERSION_CONFLICT') END; END;
--> statement-breakpoint
CREATE TRIGGER `agent_jobs_validate_insert`
BEFORE INSERT ON `agent_provisioning_jobs`
BEGIN
	SELECT CASE WHEN NEW.`customer_id` <> (SELECT `customer_id` FROM `agent_links` WHERE `id` = NEW.`agent_link_id`) THEN RAISE(ABORT, 'AGENT_JOB_CUSTOMER_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_jobs_validate_update`
BEFORE UPDATE ON `agent_provisioning_jobs`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'AGENT_JOB_VERSION_CONFLICT') END; END;
--> statement-breakpoint
CREATE TRIGGER `operational_queue_items_validate_update`
BEFORE UPDATE ON `operational_queue_items`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'QUEUE_VERSION_CONFLICT') END; END;
--> statement-breakpoint
CREATE TRIGGER `notification_deliveries_validate_update`
BEFORE UPDATE ON `notification_deliveries`
BEGIN SELECT CASE WHEN NEW.`version` <> OLD.`version` + 1 THEN RAISE(ABORT, 'NOTIFICATION_VERSION_CONFLICT') END; END;
--> statement-breakpoint
CREATE TRIGGER `notification_templates_immutable_content`
BEFORE UPDATE OF `code`, `channel`, `version`, `subject_template`, `body_template`, `required_service_notice`, `created_at` ON `notification_templates`
BEGIN SELECT RAISE(ABORT, 'NOTIFICATION_TEMPLATE_IMMUTABLE'); END;
