ALTER TABLE `series` ADD `comicvine_id` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `publisher` text;--> statement-breakpoint
ALTER TABLE `series` ADD `start_year` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `series_comicvine_id_uniq` ON `series` (`comicvine_id`);