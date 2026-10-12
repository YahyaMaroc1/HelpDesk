-- AlterEnum
ALTER TYPE "SenderType" ADD VALUE 'AI';

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "autoResolving" BOOLEAN NOT NULL DEFAULT false;
