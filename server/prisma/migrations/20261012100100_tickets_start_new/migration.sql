-- The NEW and PROCESSING statuses replace the autoResolving flag.
ALTER TABLE "ticket" DROP COLUMN "autoResolving",
ALTER COLUMN "status" SET DEFAULT 'NEW';
