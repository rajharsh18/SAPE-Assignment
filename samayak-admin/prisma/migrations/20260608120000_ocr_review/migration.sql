-- AlterEnum
ALTER TYPE "ImportStatus" ADD VALUE 'OCR_REVIEW';

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "metadata" JSONB;
