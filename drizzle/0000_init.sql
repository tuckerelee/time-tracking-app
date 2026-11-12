CREATE TABLE `active_timer` (
	`id` integer PRIMARY KEY NOT NULL,
	`project_id` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`accumulated_ms` integer DEFAULT 0 NOT NULL,
	`running_since` integer,
	`was_paused` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timer_singleton" CHECK("active_timer"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`email` text,
	`phone` text,
	`notes` text,
	`rate_cents` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "clients_rate_nonneg" CHECK("clients"."rate_cents" >= 0),
	CONSTRAINT "clients_name_nonempty" CHECK(length(trim("clients"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`rate_cents` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "projects_rate_nonneg" CHECK("projects"."rate_cents" IS NULL OR "projects"."rate_cents" >= 0),
	CONSTRAINT "projects_name_nonempty" CHECK(length(trim("projects"."name")) > 0)
);
--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_client_name_uq` ON `projects` (`client_id`,`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`business_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`report_footer` text DEFAULT 'Thank you for your business.' NOT NULL,
	`filename_suffix` text DEFAULT 'Lee' NOT NULL,
	`default_rate_cents` integer DEFAULT 7500 NOT NULL,
	`timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`date_format` text DEFAULT 'medium' NOT NULL,
	`time_format` text DEFAULT '12short' NOT NULL,
	`show_times_on_reports` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_rate_nonneg" CHECK("settings"."default_rate_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`project_id` integer NOT NULL,
	`description` text NOT NULL,
	`minutes` integer NOT NULL,
	`rate_cents` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'uninvoiced' NOT NULL,
	`invoice_ref` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`start_time` text,
	`end_time` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entries_date_format" CHECK("time_entries"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "entries_minutes_pos" CHECK("time_entries"."minutes" > 0 AND "time_entries"."minutes" <= 1440),
	CONSTRAINT "entries_rate_nonneg" CHECK("time_entries"."rate_cents" >= 0),
	CONSTRAINT "entries_amount_nonneg" CHECK("time_entries"."amount_cents" >= 0),
	CONSTRAINT "entries_status" CHECK("time_entries"."status" IN ('uninvoiced','invoiced')),
	CONSTRAINT "entries_source" CHECK("time_entries"."source" IN ('manual','timer')),
	CONSTRAINT "entries_start_fmt" CHECK("time_entries"."start_time" IS NULL OR "time_entries"."start_time" GLOB '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "entries_end_fmt" CHECK("time_entries"."end_time" IS NULL OR "time_entries"."end_time" GLOB '[0-2][0-9]:[0-5][0-9]')
);
--> statement-breakpoint
CREATE INDEX `entries_date_idx` ON `time_entries` (`date`);--> statement-breakpoint
CREATE INDEX `entries_project_idx` ON `time_entries` (`project_id`);