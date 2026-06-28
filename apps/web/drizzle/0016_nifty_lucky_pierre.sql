CREATE TABLE `mobile_push_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`device_token` text NOT NULL,
	`platform` text NOT NULL,
	`sns_endpoint_arn` text,
	`registered_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_push_devices_user_token_uniq` ON `mobile_push_devices` (`user_id`,`device_token`);--> statement-breakpoint
CREATE INDEX `mobile_push_devices_user_idx` ON `mobile_push_devices` (`user_id`);