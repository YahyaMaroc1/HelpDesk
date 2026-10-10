-- Replace Message.direction (INBOUND / OUTBOUND) with Message.senderType (CUSTOMER / AGENT), keeping existing messages.

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('CUSTOMER', 'AGENT');

-- AlterTable: fill the new column from the old one before dropping it.
ALTER TABLE "message" ADD COLUMN "senderType" "SenderType";
UPDATE "message" SET "senderType" = CASE "direction" WHEN 'INBOUND' THEN 'CUSTOMER'::"SenderType" ELSE 'AGENT'::"SenderType" END;
ALTER TABLE "message" ALTER COLUMN "senderType" SET NOT NULL;
ALTER TABLE "message" DROP COLUMN "direction";

-- DropEnum
DROP TYPE "MessageDirection";
