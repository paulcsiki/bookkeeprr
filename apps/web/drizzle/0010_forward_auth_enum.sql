PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text,
	`role` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`auth_source` text DEFAULT 'local' NOT NULL,
	`oidc_issuer` text,
	`oidc_subject` text,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "password_hash", "role", "must_change_password", "disabled", "auth_source", "oidc_issuer", "oidc_subject", "email", "created_at", "updated_at", "last_login_at") SELECT "id", "username", "password_hash", "role", "must_change_password", "disabled", "auth_source", "oidc_issuer", "oidc_subject", "email", "created_at", "updated_at", "last_login_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uniq` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_uniq` ON `users` (`oidc_issuer`,`oidc_subject`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);
