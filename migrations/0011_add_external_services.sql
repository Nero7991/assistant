-- Add external services tables
CREATE TABLE IF NOT EXISTS "external_services" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "service_name" text NOT NULL,
  "service_slug" text NOT NULL UNIQUE,
  "access_token_hash" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "rate_limit" integer NOT NULL DEFAULT 100,
  "last_used_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create index for unique service name per user
CREATE UNIQUE INDEX "unique_user_service" ON "external_services" ("user_id", "service_name");

-- Add external service messages table
CREATE TABLE IF NOT EXISTS "external_service_messages" (
  "id" serial PRIMARY KEY,
  "service_id" integer NOT NULL REFERENCES "external_services" ("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "message_content" text NOT NULL,
  "delivery_status" text NOT NULL DEFAULT 'pending',
  "delivery_method" text NOT NULL DEFAULT 'all',
  "error_message" text,
  "sent_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX "idx_external_services_user_id" ON "external_services" ("user_id");
CREATE INDEX "idx_external_service_messages_service_id" ON "external_service_messages" ("service_id");
CREATE INDEX "idx_external_service_messages_user_id" ON "external_service_messages" ("user_id");
CREATE INDEX "idx_external_service_messages_delivery_status" ON "external_service_messages" ("delivery_status");