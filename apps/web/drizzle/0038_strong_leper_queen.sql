CREATE TABLE `book_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`description` text,
	`cover_url` text,
	`total_books` integer,
	`source` text NOT NULL,
	`external_id` text,
	`external_ids_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `book_series_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_series_id` integer NOT NULL,
	`position` real,
	`title` text NOT NULL,
	`external_ref` text,
	`cover_url` text,
	FOREIGN KEY (`book_series_id`) REFERENCES `book_series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_series_entries_bs_ref_uniq` ON `book_series_entries` (`book_series_id`,`external_ref`);--> statement-breakpoint
CREATE TABLE `book_series_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_series_id` integer NOT NULL,
	`series_id` integer NOT NULL,
	`position` real,
	`link_source` text NOT NULL,
	FOREIGN KEY (`book_series_id`) REFERENCES `book_series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_series_members_bs_series_uniq` ON `book_series_members` (`book_series_id`,`series_id`);--> statement-breakpoint
CREATE INDEX `book_series_members_series_idx` ON `book_series_members` (`series_id`);