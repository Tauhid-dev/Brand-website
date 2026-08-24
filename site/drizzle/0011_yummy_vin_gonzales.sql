DROP INDEX `customers_created_at_idx`;--> statement-breakpoint
CREATE INDEX `customers_created_id_idx` ON `customers` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `customers_status_created_id_idx` ON `customers` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_id_idx` ON `audit_events` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `discounts_active_created_id_idx` ON `discounts` (`active`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `invoices_created_id_idx` ON `invoices` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `invoices_status_created_id_idx` ON `invoices` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_created_id_idx` ON `notification_deliveries` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_status_created_id_idx` ON `notification_deliveries` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `promotion_codes_active_created_id_idx` ON `promotion_codes` (`active`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `subscriptions_created_id_idx` ON `subscriptions` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_created_id_idx` ON `subscriptions` (`status`,`created_at`,`id`);