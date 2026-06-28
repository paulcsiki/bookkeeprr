ALTER TABLE `releases` ADD `discovered_at` integer;--> statement-breakpoint
-- Backfill existing releases to migration time so they fall inside replay
-- windows (their published_at can be years old for back-catalogue/books).
UPDATE `releases` SET `discovered_at` = (CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE `discovered_at` IS NULL;