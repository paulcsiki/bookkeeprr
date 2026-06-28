ALTER TABLE `releases` ADD `grab_failed_at` integer;--> statement-breakpoint
ALTER TABLE `releases` ADD `grab_attempts` integer DEFAULT 0 NOT NULL;