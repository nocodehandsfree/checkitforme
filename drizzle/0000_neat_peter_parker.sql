CREATE TABLE `call_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer,
	`retailer_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`confirmed` integer,
	`shipment_day_heard` text,
	`summary` text,
	`transcript` text,
	`provider_call_id` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `call_results_retailer_category_idx` ON `call_results` (`retailer_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `call_results_provider_idx` ON `call_results` (`provider_call_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_key_unique` ON `categories` (`key`);--> statement-breakpoint
CREATE TABLE `chains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone_tree_default` text,
	`call_target` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chains_name_unique` ON `chains` (`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`carried_by_chain_id` integer,
	`series` text,
	`type` text,
	`sku` text,
	`item_code` text,
	`language` text,
	`msrp` real,
	`max_price` real,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`carried_by_chain_id`) REFERENCES `chains`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_external_id_unique` ON `products` (`external_id`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE TABLE `retailers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_id` integer,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`address` text,
	`zip` text,
	`lat` real,
	`lng` real,
	`phone` text NOT NULL,
	`timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`phone_tree` text,
	`shipment_day` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chain_id`) REFERENCES `chains`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `retailers_chain_idx` ON `retailers` (`chain_id`);--> statement-breakpoint
CREATE TABLE `schedule_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`retailer_id` integer NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_targets_schedule_idx` ON `schedule_targets` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`product_id` integer,
	`question_template` text NOT NULL,
	`clarification` text,
	`ask_shipment_day` integer DEFAULT false NOT NULL,
	`time_local` text NOT NULL,
	`days_of_week` text NOT NULL,
	`voice_id` text NOT NULL,
	`caller_id` text,
	`max_call_seconds` integer DEFAULT 180 NOT NULL,
	`zone_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `zone_retailers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` integer NOT NULL,
	`retailer_id` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zone_retailers_zone_idx` ON `zone_retailers` (`zone_id`);--> statement-breakpoint
CREATE TABLE `zones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`center_zip` text,
	`center_lat` real,
	`center_lng` real,
	`radius_miles` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
