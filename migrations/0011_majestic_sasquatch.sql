CREATE TABLE "external_service_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"message_content" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_method" text DEFAULT 'all' NOT NULL,
	"error_message" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"service_name" text NOT NULL,
	"service_slug" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"last_used_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_services_service_slug_unique" UNIQUE("service_slug")
);
--> statement-breakpoint
CREATE TABLE "function_call_history" (
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
--> statement-breakpoint
ALTER TABLE "message_history" ADD COLUMN "sequence_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "devlm_preferred_model" text DEFAULT 'claude-3-5-sonnet-20241022';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "devlm_preferred_provider" text DEFAULT 'anthropic';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "devlm_custom_openai_server_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "devlm_custom_openai_model_name" text;--> statement-breakpoint
ALTER TABLE "external_service_messages" ADD CONSTRAINT "external_service_messages_service_id_external_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."external_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_service_messages" ADD CONSTRAINT "external_service_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_services" ADD CONSTRAINT "external_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unique_user_service" ON "external_services" USING btree ("user_id","service_name");