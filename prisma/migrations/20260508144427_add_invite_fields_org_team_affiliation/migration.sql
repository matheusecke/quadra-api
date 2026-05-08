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
