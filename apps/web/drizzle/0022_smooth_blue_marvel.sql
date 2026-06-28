ALTER TABLE `users` ADD `totp_secret_encrypted` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_recovery_codes_hashed` text;