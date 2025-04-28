CREATE TABLE "devlm_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_name" text NOT NULL,
	"mode" text DEFAULT 'generate' NOT NULL,
	"model" text DEFAULT 'claude',
	"source" text DEFAULT 'anthropic',
	"publisher" text,
	"anthropic_api_key" text,
	"openai_api_key" text,
	"project_id" text,
	"region" text,
	"server_url" text,
	"project_path" text DEFAULT '.',
	"write_mode" text DEFAULT 'diff',
	"debug_prompt" boolean DEFAULT false,
	"no_approval" boolean DEFAULT false,
	"frontend" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "devlm_sessions" ADD CONSTRAINT "devlm_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;