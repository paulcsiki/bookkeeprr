ALTER TABLE `downloads` ADD `bytes_downloaded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `downloads` ADD `last_progress_at` integer;