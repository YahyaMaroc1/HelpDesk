-- A ticket starts NEW and is PROCESSING while the AI tries to resolve it, before it becomes OPEN or RESOLVED.
-- Added before OPEN so statuses sort in their lifecycle order. The default is set in the next migration: Postgres
-- doesn't allow using an enum value in the transaction that adds it.
ALTER TYPE "TicketStatus" ADD VALUE 'NEW' BEFORE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'PROCESSING' BEFORE 'OPEN';
