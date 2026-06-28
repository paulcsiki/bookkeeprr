ALTER TABLE `series` ADD `asin` text;--> statement-breakpoint
ALTER TABLE `series` ADD `narrator` text;--> statement-breakpoint
CREATE UNIQUE INDEX `series_asin_uniq` ON `series` (`asin`);
