-- Add sequence_id column to message_history table
ALTER TABLE "message_history" ADD COLUMN "sequence_id" text;

-- Create function_call_history table
CREATE TABLE IF NOT EXISTS "function_call_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"sequence_id" text NOT NULL,
	"interaction_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"type" text NOT NULL,
	"function_name" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "function_call_history_user_id_idx" ON "function_call_history" ("user_id");
CREATE INDEX IF NOT EXISTS "function_call_history_sequence_id_idx" ON "function_call_history" ("sequence_id");
CREATE INDEX IF NOT EXISTS "function_call_history_interaction_id_idx" ON "function_call_history" ("interaction_id");
CREATE INDEX IF NOT EXISTS "message_history_sequence_id_idx" ON "message_history" ("sequence_id");