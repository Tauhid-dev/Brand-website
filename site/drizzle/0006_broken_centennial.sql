CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`state` text DEFAULT 'PROCESSING' NOT NULL,
	`response_status` integer,
	`response_body_json` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "idempotency_keys_state_check" CHECK("idempotency_keys"."state" in ('PROCESSING', 'COMPLETED')),
	CONSTRAINT "idempotency_keys_response_check" CHECK(("idempotency_keys"."state" = 'PROCESSING' and "idempotency_keys"."response_status" is null and "idempotency_keys"."response_body_json" is null) or ("idempotency_keys"."state" = 'COMPLETED' and "idempotency_keys"."response_status" between 200 and 499 and "idempotency_keys"."response_body_json" is not null)),
	CONSTRAINT "idempotency_keys_expiry_check" CHECK("idempotency_keys"."expires_at" > "idempotency_keys"."created_at"),
	CONSTRAINT "idempotency_keys_timestamps_check" CHECK("idempotency_keys"."updated_at" >= "idempotency_keys"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_keys_scope_key_uq` ON `idempotency_keys` (`scope`,`key`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_expiry_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `service_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`scopes_json` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expires_at` integer NOT NULL,
	`rotated_from_id` text,
	`created_by_admin_user_id` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`revoked_by_admin_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "service_credentials_status_check" CHECK("service_credentials"."status" in ('ACTIVE', 'REVOKED')),
	CONSTRAINT "service_credentials_expiry_check" CHECK("service_credentials"."expires_at" > "service_credentials"."created_at"),
	CONSTRAINT "service_credentials_revocation_check" CHECK(("service_credentials"."status" = 'ACTIVE' and "service_credentials"."revoked_at" is null and "service_credentials"."revoked_by_admin_user_id" is null) or ("service_credentials"."status" = 'REVOKED' and "service_credentials"."revoked_at" is not null and "service_credentials"."revoked_by_admin_user_id" is not null)),
	CONSTRAINT "service_credentials_timestamps_check" CHECK("service_credentials"."updated_at" >= "service_credentials"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_credentials_secret_hash_uq` ON `service_credentials` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `service_credentials_status_expiry_idx` ON `service_credentials` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `service_credentials_rotated_from_idx` ON `service_credentials` (`rotated_from_id`);--> statement-breakpoint
CREATE TABLE `service_rate_limits` (
	`credential_id` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`credential_id`, `window_started_at`),
	FOREIGN KEY (`credential_id`) REFERENCES `service_credentials`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "service_rate_limits_count_check" CHECK("service_rate_limits"."request_count" > 0),
	CONSTRAINT "service_rate_limits_timestamps_check" CHECK("service_rate_limits"."updated_at" >= "service_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE INDEX `service_rate_limits_window_idx` ON `service_rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE TRIGGER `idempotency_keys_completed_immutable`
BEFORE UPDATE ON `idempotency_keys`
WHEN OLD.`state` = 'COMPLETED'
BEGIN
	SELECT RAISE(ABORT, 'IDEMPOTENCY_RESULT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `service_credentials_secret_immutable`
BEFORE UPDATE ON `service_credentials`
WHEN NEW.`secret_hash` <> OLD.`secret_hash`
	OR NEW.`scopes_json` <> OLD.`scopes_json`
	OR NEW.`created_by_admin_user_id` <> OLD.`created_by_admin_user_id`
BEGIN
	SELECT RAISE(ABORT, 'SERVICE_CREDENTIAL_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `service_credentials_revocation_terminal`
BEFORE UPDATE ON `service_credentials`
WHEN OLD.`status` = 'REVOKED'
BEGIN
	SELECT RAISE(ABORT, 'SERVICE_CREDENTIAL_REVOKED');
END;--> statement-breakpoint
PRAGMA optimize;
