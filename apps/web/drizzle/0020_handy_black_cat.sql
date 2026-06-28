CREATE TABLE `user_notification_preferences` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`event_grab_success` integer DEFAULT true NOT NULL,
	`event_import_success` integer DEFAULT true NOT NULL,
	`event_failure` integer DEFAULT true NOT NULL,
	`event_update_available` integer DEFAULT false NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);