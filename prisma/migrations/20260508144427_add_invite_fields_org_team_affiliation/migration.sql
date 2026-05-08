-- AlterTable
ALTER TABLE "organization_team_affiliations"
  ADD COLUMN "created_by_user_id" INTEGER,
  ADD COLUMN "invite_token" TEXT,
  ADD COLUMN "invite_expires_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "organization_team_affiliations_invite_token_key"
  ON "organization_team_affiliations" ("invite_token");

-- AddForeignKey
ALTER TABLE "organization_team_affiliations"
  ADD CONSTRAINT "organization_team_affiliations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- DB-only: partial unique index on (organization_id, team_id) for active affiliations
CREATE UNIQUE INDEX "organization_team_affiliations_org_team_unique_active"
  ON "organization_team_affiliations" ("organization_id", "team_id")
  WHERE is_deleted = false;

-- DB-only: partial index on (organization_id, status)
CREATE INDEX "organization_team_affiliations_org_status_idx"
  ON "organization_team_affiliations" ("organization_id", "status")
  WHERE is_deleted = false;

-- DB-only: partial index on (team_id)
CREATE INDEX "organization_team_affiliations_team_id_idx"
  ON "organization_team_affiliations" ("team_id")
  WHERE is_deleted = false;
