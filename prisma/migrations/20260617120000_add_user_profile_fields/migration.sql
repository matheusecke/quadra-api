-- AlterTable
ALTER TABLE "users" ADD COLUMN "birth_date" DATE NOT NULL DEFAULT DATE '1970-01-01',
ADD COLUMN "height_cm" INTEGER;

-- DB-only constraint
ALTER TABLE "users"
    ADD CONSTRAINT "users_height_cm_range_chk"
    CHECK ("height_cm" IS NULL OR ("height_cm" >= 50 AND "height_cm" <= 250));
