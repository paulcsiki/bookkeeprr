CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` integer,
	`actor_username` text,
	`action` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`metadata_json` text,
	`peer_ip` text,
	`client_ip` text,
	`user_agent` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_timestamp_idx` ON `audit_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`,`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`,`timestamp`);
