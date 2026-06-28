DROP INDEX `reading_progress_user_key_device_uniq`;--> statement-breakpoint
-- Collapse per-device reading_progress rows into one shared row per
-- (user, readable). Progress is unified across devices, so the old per-device
-- rows only created stale-state bugs (a volume finished on one device showed
-- "in progress" because another device still had an old partway row).
--
-- 1. Fold the union state into every row of a group: finished if finished on ANY
--    device, and the furthest position reached. (Applied to all rows so the
--    survivor carries the right values regardless of which row we keep.)
UPDATE `reading_progress` SET
  `finished` = (
    SELECT MAX(x.`finished`) FROM `reading_progress` x
    WHERE x.`user_id` = `reading_progress`.`user_id`
      AND x.`readable_key` = `reading_progress`.`readable_key`
  ),
  `position` = (
    SELECT MAX(x.`position`) FROM `reading_progress` x
    WHERE x.`user_id` = `reading_progress`.`user_id`
      AND x.`readable_key` = `reading_progress`.`readable_key`
  );--> statement-breakpoint
-- 2. Keep only the most-recently-updated row per (user, readable); drop the rest.
DELETE FROM `reading_progress` WHERE `id` NOT IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `user_id`, `readable_key`
      ORDER BY `updated_at` DESC, `id` DESC
    ) AS rn
    FROM `reading_progress`
  ) WHERE rn = 1
);--> statement-breakpoint
-- 3. One row per (user, readable) is now guaranteed — enforce it.
CREATE UNIQUE INDEX `reading_progress_user_key_uniq` ON `reading_progress` (`user_id`,`readable_key`);
