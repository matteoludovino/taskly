-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "descriptionDoc" BYTEA,
ADD COLUMN     "descriptionPreview" VARCHAR(160) NOT NULL DEFAULT '',
ADD COLUMN     "descriptionText" TEXT NOT NULL DEFAULT '';
