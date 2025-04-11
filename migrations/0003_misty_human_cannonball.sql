ALTER TABLE "users" ADD COLUMN "first_name" text;

-- Backfill first_name for existing users
UPDATE "users" SET "first_name" = "username" WHERE "first_name" IS NULL;