-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "organization_id" INTEGER;

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_organization_id_is_revoked_idx" ON "refresh_tokens"("user_id", "organization_id", "is_revoked");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
