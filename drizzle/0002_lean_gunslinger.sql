ALTER TABLE `retailers` ADD `stock_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `retailers` ADD `carries` text;--> statement-breakpoint
ALTER TABLE `retailers` ADD `special_instructions` text;