CREATE TABLE `agent_provisioning_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`provider_reference` text,
	`error_category` text,
	`retryable` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `agent_provisioning_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_provisioning_attempts_number_check" CHECK("agent_provisioning_attempts"."attempt_number" > 0),
	CONSTRAINT "agent_provisioning_attempts_status_check" CHECK("agent_provisioning_attempts"."status" in ('PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "agent_provisioning_attempts_outcome_check" CHECK(("agent_provisioning_attempts"."status" = 'PROCESSING' and "agent_provisioning_attempts"."completed_at" is null and "agent_provisioning_attempts"."provider_reference" is null and "agent_provisioning_attempts"."error_category" is null and "agent_provisioning_attempts"."retryable" = 0) or ("agent_provisioning_attempts"."status" = 'SUCCEEDED' and "agent_provisioning_attempts"."completed_at" is not null and "agent_provisioning_attempts"."error_category" is null and "agent_provisioning_attempts"."retryable" = 0) or ("agent_provisioning_attempts"."status" = 'FAILED' and "agent_provisioning_attempts"."completed_at" is not null and "agent_provisioning_attempts"."provider_reference" is null and "agent_provisioning_attempts"."error_category" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_provisioning_attempts_job_number_uq` ON `agent_provisioning_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_attempts_job_created_idx` ON `agent_provisioning_attempts` (`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_attempts_status_created_idx` ON `agent_provisioning_attempts` (`status`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_provisioning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_link_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` integer,
	`processing_started_at` integer,
	`lease_expires_at` integer,
	`error_category` text,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_link_id`) REFERENCES `agent_links`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_provisioning_jobs_operation_check" CHECK("__new_agent_provisioning_jobs"."operation" in ('PROVISION', 'UPDATE', 'SUSPEND', 'RESUME')),
	CONSTRAINT "agent_provisioning_jobs_status_check" CHECK("__new_agent_provisioning_jobs"."status" in ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "agent_provisioning_jobs_attempt_check" CHECK("__new_agent_provisioning_jobs"."attempt_count" >= 0 and "__new_agent_provisioning_jobs"."max_attempts" > 0 and "__new_agent_provisioning_jobs"."attempt_count" <= "__new_agent_provisioning_jobs"."max_attempts"),
	CONSTRAINT "agent_provisioning_jobs_outcome_check" CHECK(("__new_agent_provisioning_jobs"."status" = 'SUCCEEDED' and "__new_agent_provisioning_jobs"."completed_at" is not null and "__new_agent_provisioning_jobs"."error_category" is null) or ("__new_agent_provisioning_jobs"."status" = 'FAILED' and "__new_agent_provisioning_jobs"."completed_at" is not null and "__new_agent_provisioning_jobs"."error_category" is not null) or ("__new_agent_provisioning_jobs"."status" in ('PENDING', 'IN_PROGRESS', 'CANCELLED') and "__new_agent_provisioning_jobs"."completed_at" is null and "__new_agent_provisioning_jobs"."error_category" is null)),
	CONSTRAINT "agent_provisioning_jobs_lease_check" CHECK(("__new_agent_provisioning_jobs"."status" = 'IN_PROGRESS' and "__new_agent_provisioning_jobs"."processing_started_at" is not null and "__new_agent_provisioning_jobs"."lease_expires_at" is not null) or ("__new_agent_provisioning_jobs"."status" <> 'IN_PROGRESS' and "__new_agent_provisioning_jobs"."processing_started_at" is null and "__new_agent_provisioning_jobs"."lease_expires_at" is null)),
	CONSTRAINT "agent_provisioning_jobs_version_check" CHECK("__new_agent_provisioning_jobs"."version" > 0),
	CONSTRAINT "agent_provisioning_jobs_timestamps_check" CHECK("__new_agent_provisioning_jobs"."updated_at" >= "__new_agent_provisioning_jobs"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_agent_provisioning_jobs`("id", "agent_link_id", "customer_id", "operation", "status", "idempotency_key", "attempt_count", "max_attempts", "next_attempt_at", "processing_started_at", "lease_expires_at", "error_category", "requested_at", "started_at", "completed_at", "version", "created_at", "updated_at") SELECT "id", "agent_link_id", "customer_id", "operation", "status", "idempotency_key", "attempt_count", "max_attempts", "next_attempt_at", CASE WHEN "status" = 'IN_PROGRESS' THEN COALESCE("started_at", "updated_at") ELSE NULL END, CASE WHEN "status" = 'IN_PROGRESS' THEN COALESCE("started_at", "updated_at") + 120000 ELSE NULL END, "error_category", "requested_at", "started_at", "completed_at", "version", "created_at", "updated_at" FROM `agent_provisioning_jobs`;--> statement-breakpoint
DROP TABLE `agent_provisioning_jobs`;--> statement-breakpoint
ALTER TABLE `__new_agent_provisioning_jobs` RENAME TO `agent_provisioning_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_provisioning_jobs_idempotency_uq` ON `agent_provisioning_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_jobs_link_status_idx` ON `agent_provisioning_jobs` (`agent_link_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_jobs_customer_status_idx` ON `agent_provisioning_jobs` (`customer_id`,`status`);--> statement-breakpoint
CREATE INDEX `agent_provisioning_jobs_lease_idx` ON `agent_provisioning_jobs` (`status`,`lease_expires_at`);
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
CREATE TRIGGER `agent_provisioning_attempts_immutable_update`
BEFORE UPDATE OF `job_id`, `attempt_number`, `provider`, `started_at`, `created_at` ON `agent_provisioning_attempts`
BEGIN SELECT RAISE(ABORT, 'AGENT_ATTEMPT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_provisioning_attempts_terminal_update`
BEFORE UPDATE ON `agent_provisioning_attempts`
WHEN OLD.`status` <> 'PROCESSING'
BEGIN SELECT RAISE(ABORT, 'AGENT_ATTEMPT_TERMINAL'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_provisioning_attempts_no_delete`
BEFORE DELETE ON `agent_provisioning_attempts`
BEGIN SELECT RAISE(ABORT, 'AGENT_ATTEMPT_IMMUTABLE'); END;
