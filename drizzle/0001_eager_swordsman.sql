ALTER TABLE `call_results` ADD `mode` text DEFAULT 'restock' NOT NULL;--> statement-breakpoint
ALTER TABLE `schedules` ADD `mode` text DEFAULT 'restock' NOT NULL;