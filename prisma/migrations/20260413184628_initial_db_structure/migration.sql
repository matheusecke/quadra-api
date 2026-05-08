-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('ORG_ADMIN', 'TEAM_ADMIN', 'ATHLETE', 'COACHING_STAFF');

-- CreateEnum
CREATE TYPE "entity_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "affiliation_status" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateTable
CREATE TABLE "organization_team_affiliations" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "status" "affiliation_status" NOT NULL DEFAULT 'PENDING',
    "created_by_user_id" INTEGER,
    "invite_token" TEXT,
    "invite_expires_at" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_team_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_user_affiliations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "role" "org_role" NOT NULL,
    "team_id" INTEGER,
    "jersey_number" INTEGER,
    "status" "affiliation_status" NOT NULL DEFAULT 'PENDING',
    "created_by_user_id" INTEGER,
    "invite_token" TEXT,
    "invite_expires_at" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_user_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'ACTIVE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'ACTIVE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'ACTIVE',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_team_affiliations" ADD CONSTRAINT "organization_team_affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_team_affiliations" ADD CONSTRAINT "organization_team_affiliations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_team_affiliations" ADD CONSTRAINT "organization_team_affiliations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user_affiliations" ADD CONSTRAINT "organization_user_affiliations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user_affiliations" ADD CONSTRAINT "organization_user_affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user_affiliations" ADD CONSTRAINT "organization_user_affiliations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user_affiliations" ADD CONSTRAINT "organization_user_affiliations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DB-only constraints
ALTER TABLE "users"
    ADD CONSTRAINT "users_email_lowercase_chk"
    CHECK ("email" = lower("email"));

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_slug_lowercase_chk"
    CHECK ("slug" = lower("slug"));

ALTER TABLE "teams"
    ADD CONSTRAINT "teams_slug_lowercase_chk"
    CHECK ("slug" = lower("slug"));

ALTER TABLE "organization_user_affiliations"
    ADD CONSTRAINT "organization_user_affiliations_role_team_consistency_chk"
    CHECK (
        ("role" = 'ORG_ADMIN' AND "team_id" IS NULL)
        OR ("role" IN ('TEAM_ADMIN', 'ATHLETE', 'COACHING_STAFF') AND "team_id" IS NOT NULL)
    );

ALTER TABLE "organization_user_affiliations"
    ADD CONSTRAINT "organization_user_affiliations_jersey_number_range_chk"
    CHECK ("jersey_number" IS NULL OR ("jersey_number" >= 0 AND "jersey_number" < 100));

-- DB-only partial unique indexes
CREATE UNIQUE INDEX "users_email_active_unique_idx"
    ON "users" ("email")
    WHERE "is_deleted" = false AND "status" <> 'INACTIVE';

CREATE UNIQUE INDEX "organizations_slug_active_unique_idx"
    ON "organizations" ("slug")
    WHERE "is_deleted" = false AND "status" <> 'INACTIVE';

CREATE UNIQUE INDEX "teams_slug_active_unique_idx"
    ON "teams" ("slug")
    WHERE "is_deleted" = false AND "status" <> 'INACTIVE';

CREATE UNIQUE INDEX "organization_user_affiliations_user_org_active_unique_idx"
    ON "organization_user_affiliations" ("user_id", "organization_id")
    WHERE "is_deleted" = false AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "organization_team_affiliations_org_team_active_unique_idx"
    ON "organization_team_affiliations" ("organization_id", "team_id")
    WHERE "is_deleted" = false;

CREATE UNIQUE INDEX "organization_user_affiliations_invite_token_key"
    ON "organization_user_affiliations" ("invite_token");

CREATE UNIQUE INDEX "organization_team_affiliations_invite_token_key"
    ON "organization_team_affiliations" ("invite_token");

-- DB-only partial indexes
CREATE INDEX "organization_user_affiliations_org_team_active_idx"
    ON "organization_user_affiliations" ("organization_id", "team_id")
    WHERE "is_deleted" = false;

CREATE INDEX "organization_user_affiliations_org_role_active_idx"
    ON "organization_user_affiliations" ("organization_id", "role")
    WHERE "is_deleted" = false;

CREATE INDEX "organization_team_affiliations_org_status_active_idx"
    ON "organization_team_affiliations" ("organization_id", "status")
    WHERE "is_deleted" = false;

CREATE INDEX "organization_team_affiliations_team_active_idx"
    ON "organization_team_affiliations" ("team_id")
    WHERE "is_deleted" = false;
