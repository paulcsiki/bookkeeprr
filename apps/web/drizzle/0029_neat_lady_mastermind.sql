CREATE TABLE `dashboard_prefs` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`order_json` text NOT NULL,
	`enabled_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
