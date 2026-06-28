ALTER TABLE `series` ADD `mal_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `series_mal_id_uniq` ON `series` (`mal_id`);