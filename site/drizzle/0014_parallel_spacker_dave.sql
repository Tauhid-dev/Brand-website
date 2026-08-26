CREATE TABLE `system_maintenance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`requested_by_admin_user_id` text NOT NULL,
	`policy_snapshot_json` text NOT NULL,
	`summary_json` text,
	`failure_code` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requested_by_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "system_maintenance_runs_operation_check" CHECK("system_maintenance_runs"."operation" = 'RETENTION_AND_RECOVERY'),
	CONSTRAINT "system_maintenance_runs_status_check" CHECK("system_maintenance_runs"."status" in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "system_maintenance_runs_outcome_check" CHECK(("system_maintenance_runs"."status" = 'IN_PROGRESS' and "system_maintenance_runs"."completed_at" is null and "system_maintenance_runs"."summary_json" is null and "system_maintenance_runs"."failure_code" is null) or ("system_maintenance_runs"."status" = 'SUCCEEDED' and "system_maintenance_runs"."completed_at" is not null and "system_maintenance_runs"."summary_json" is not null and "system_maintenance_runs"."failure_code" is null) or ("system_maintenance_runs"."status" = 'FAILED' and "system_maintenance_runs"."completed_at" is not null and "system_maintenance_runs"."summary_json" is null and "system_maintenance_runs"."failure_code" is not null)),
	CONSTRAINT "system_maintenance_runs_timestamps_check" CHECK("system_maintenance_runs"."updated_at" >= "system_maintenance_runs"."created_at" and ("system_maintenance_runs"."completed_at" is null or "system_maintenance_runs"."completed_at" >= "system_maintenance_runs"."started_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_maintenance_runs_active_operation_uq` ON `system_maintenance_runs` (`operation`) WHERE "system_maintenance_runs"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX `system_maintenance_runs_status_created_idx` ON `system_maintenance_runs` (`status`,`created_at`);
--> statement-breakpoint
DROP TRIGGER `audit_events_immutable_update`;
--> statement-breakpoint
CREATE TRIGGER `audit_events_immutable_update`
BEFORE UPDATE ON `audit_events`
WHEN NOT (
  NEW.id IS OLD.id
  AND NEW.actor_type IS OLD.actor_type
  AND NEW.actor_id IS OLD.actor_id
  AND NEW.action IS OLD.action
  AND NEW.entity_type IS OLD.entity_type
  AND NEW.entity_id IS OLD.entity_id
  AND NEW.before_json IS OLD.before_json
  AND NEW.after_json IS OLD.after_json
  AND NEW.request_id IS OLD.request_id
  AND NEW.created_at IS OLD.created_at
  AND NEW.ip_address IS NULL
  AND NEW.user_agent IS NULL
  AND (OLD.ip_address IS NOT NULL OR OLD.user_agent IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_maintenance_runs_terminal_immutable`
BEFORE UPDATE ON `system_maintenance_runs`
WHEN OLD.status <> 'IN_PROGRESS'
BEGIN
  SELECT RAISE(ABORT, 'SYSTEM_MAINTENANCE_RUN_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `system_maintenance_runs_no_delete`
BEFORE DELETE ON `system_maintenance_runs`
BEGIN
  SELECT RAISE(ABORT, 'SYSTEM_MAINTENANCE_RUN_IMMUTABLE');
END;
