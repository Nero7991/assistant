CREATE TABLE "creation_subtasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"creation_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_index" integer NOT NULL,
	"files_paths" jsonb,
	"estimated_duration" text,
	"actual_duration_minutes" integer,
	"gemini_prompt" text,
	"gemini_response" text,
	"files_modified" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "creation_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"creation_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_index" integer NOT NULL,
	"category" text NOT NULL,
	"estimated_duration" text,
	"actual_duration_minutes" integer,
	"total_subtasks" integer DEFAULT 0,
	"completed_subtasks" integer DEFAULT 0,
	"gemini_prompt" text,
	"gemini_response" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "creations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'brainstorming' NOT NULL,
	"planning_prompt" text,
	"architecture_plan" text,
	"tech_stack" jsonb,
	"current_task_id" integer,
	"current_subtask_id" integer,
	"page_name" text,
	"deployment_url" text,
	"total_tasks" integer DEFAULT 0,
	"completed_tasks" integer DEFAULT 0,
	"total_subtasks" integer DEFAULT 0,
	"completed_subtasks" integer DEFAULT 0,
	"estimated_duration" text,
	"actual_duration_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "creations_page_name_unique" UNIQUE("page_name")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "devlm_preferred_model" SET DEFAULT 'o1-mini';--> statement-breakpoint
ALTER TABLE "creation_subtasks" ADD CONSTRAINT "creation_subtasks_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_subtasks" ADD CONSTRAINT "creation_subtasks_task_id_creation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."creation_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_tasks" ADD CONSTRAINT "creation_tasks_creation_id_creations_id_fk" FOREIGN KEY ("creation_id") REFERENCES "public"."creations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creations" ADD CONSTRAINT "creations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "devlm_preferred_provider";