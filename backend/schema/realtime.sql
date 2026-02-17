-- Realtime outbox schema for production-safe frontend/backend sync.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS app_event_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT,
  operation TEXT NOT NULL,
  business_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_event_outbox_created_at ON app_event_outbox (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_event_outbox_entity ON app_event_outbox (entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_app_event_outbox_business_key ON app_event_outbox (business_key);

CREATE OR REPLACE FUNCTION app_emit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  op TEXT := TG_OP;
  row_new JSONB := COALESCE(to_jsonb(NEW), '{}'::jsonb);
  row_old JSONB := COALESCE(to_jsonb(OLD), '{}'::jsonb);
  row_any JSONB := COALESCE(to_jsonb(NEW), to_jsonb(OLD), '{}'::jsonb);
  outbox_id BIGINT;
  e_type TEXT;
  e_entity_id TEXT;
  e_business_key TEXT;
  e_payload JSONB;
BEGIN
  e_type := lower(TG_TABLE_NAME) || '.' || lower(op);
  e_entity_id := COALESCE(row_any->>'id', row_any->>'ticketId', row_any->>'assetId', row_any->>'code');
  e_business_key := COALESCE(row_any->>'ticketId', row_any->>'assetId', row_any->>'id', row_any->>'code');
  e_payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', op,
    'new', row_new,
    'old', row_old
  );

  INSERT INTO app_event_outbox (event_type, entity_name, entity_id, operation, business_key, payload)
  VALUES (e_type, TG_TABLE_NAME, e_entity_id, op, e_business_key, e_payload)
  RETURNING id INTO outbox_id;

  PERFORM pg_notify(
    'app_events',
    json_build_object(
      'id', outbox_id,
      'eventType', e_type,
      'entity', TG_TABLE_NAME,
      'entityId', e_entity_id,
      'operation', op
    )::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_event_ticket ON "Ticket";
CREATE TRIGGER trg_event_ticket
AFTER INSERT OR UPDATE OR DELETE ON "Ticket"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

DROP TRIGGER IF EXISTS trg_event_ticket_history ON "TicketHistory";
CREATE TRIGGER trg_event_ticket_history
AFTER INSERT OR UPDATE OR DELETE ON "TicketHistory"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

DROP TRIGGER IF EXISTS trg_event_ticket_status_history ON "TicketStatusHistory";
CREATE TRIGGER trg_event_ticket_status_history
AFTER INSERT OR UPDATE OR DELETE ON "TicketStatusHistory"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

DROP TRIGGER IF EXISTS trg_event_asset ON "Asset";
CREATE TRIGGER trg_event_asset
AFTER INSERT OR UPDATE OR DELETE ON "Asset"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

DROP TRIGGER IF EXISTS trg_event_task ON "Task";
CREATE TRIGGER trg_event_task
AFTER INSERT OR UPDATE OR DELETE ON "Task"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

DROP TRIGGER IF EXISTS trg_event_approval ON "Approval";
CREATE TRIGGER trg_event_approval
AFTER INSERT OR UPDATE OR DELETE ON "Approval"
FOR EACH ROW EXECUTE FUNCTION app_emit_event();

