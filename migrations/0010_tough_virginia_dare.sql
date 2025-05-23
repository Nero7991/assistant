CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"nickname" text,
	"email" text,
	"phone_number" text,
	"contact_preference" text DEFAULT 'sms',
	"is_phone_verified" boolean DEFAULT false NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"birthday" date,
	"relationship" text NOT NULL,
	"relationship_details" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_verifications" ADD CONSTRAINT "people_verifications_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;