CREATE TABLE `replay_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`triggered_at` integer NOT NULL,
	`completed_at` integer,
	`status` text NOT NULL,
	`window_days` integer,
	`releases_total` integer DEFAULT 0 NOT NULL,
	`releases_flipped` integer DEFAULT 0 NOT NULL,
	`releases_rescored` integer DEFAULT 0 NOT NULL,
	`weights_snapshot_json` text NOT NULL,
	`adult_filter_snapshot_json` text NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `replay_runs_triggered_at_idx` ON `replay_runs` (`triggered_at`);
--> statement-breakpoint
CREATE INDEX `replay_runs_status_idx` ON `replay_runs` (`status`);
--> statement-breakpoint
CREATE TABLE `release_match_replays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`replay_run_id` integer NOT NULL,
	`release_id` integer NOT NULL,
	`old_score` integer,
	`new_score` integer,
	`old_would_grab` integer NOT NULL,
	`new_would_grab` integer NOT NULL,
	`changed_kind` text NOT NULL,
	`adopted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`replay_run_id`) REFERENCES `replay_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `release_match_replays_run_kind_idx` ON `release_match_replays` (`replay_run_id`,`changed_kind`);
--> statement-breakpoint
CREATE INDEX `release_match_replays_release_idx` ON `release_match_replays` (`release_id`);
