-- Add sla warning flag (noop placeholder)
ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "warningSent" boolean DEFAULT false;
