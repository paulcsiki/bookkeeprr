ALTER TABLE `series` ADD `openlibrary_id` text;--> statement-breakpoint
ALTER TABLE `series` ADD `isbn` text;--> statement-breakpoint
CREATE UNIQUE INDEX `series_openlibrary_id_uniq` ON `series` (`openlibrary_id`);--> statement-breakpoint
CREATE INDEX `series_isbn_idx` ON `series` (`isbn`);
