ALTER TABLE `releases` ADD `trusted` integer;
--> statement-breakpoint
ALTER TABLE `releases` ADD `remake` integer;
--> statement-breakpoint
ALTER TABLE `replay_runs` ADD `series_id` integer REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `replay_runs_series_id_idx` ON `replay_runs` (`series_id`);
