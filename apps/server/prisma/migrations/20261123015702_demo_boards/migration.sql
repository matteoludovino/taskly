-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "expiresAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "boards_expiresAt_idx" ON "boards"("expiresAt");
