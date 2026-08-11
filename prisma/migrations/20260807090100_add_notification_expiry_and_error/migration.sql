-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_expiresAt_idx" ON "notifications"("expiresAt");
