-- Add resolution fields to Ticket and internal flag to TicketHistory
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "resolution" text;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "resolutionCategory" text;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "resolvedAt" timestamp with time zone;

ALTER TABLE "TicketHistory" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false;
