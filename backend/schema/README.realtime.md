# Realtime Schema Contract

This schema provides a production-safe realtime bridge between PostgreSQL, backend APIs, and frontend clients.

## Database contract

### Table: `app_event_outbox`
- `id BIGSERIAL PRIMARY KEY`
- `event_type TEXT` (example: `ticket.insert`, `tickethistory.update`)
- `entity_name TEXT` (table name)
- `entity_id TEXT` (row id/business id)
- `operation TEXT` (`INSERT`/`UPDATE`/`DELETE`)
- `business_key TEXT` (ticketId/assetId/etc)
- `payload JSONB` (snapshot with `new` + `old`)
- `created_at TIMESTAMPTZ`

### Triggers enabled
- `"Ticket"`
- `"TicketHistory"`
- `"TicketStatusHistory"`
- `"Asset"`
- `"Task"`
- `"Approval"`

All trigger writes go to `app_event_outbox`, and `pg_notify('app_events', ...)` is emitted.

## Backend API contract

### `GET /api/events`
Auth required. Roles: `ADMIN`, `AGENT`, `USER`.

Query:
- `sinceId?: number` (default `0`)
- `limit?: number` (default `100`, max `500`)

Response:
```json
{
  "items": [
    {
      "id": 123,
      "event_type": "ticket.update",
      "entity_name": "Ticket",
      "entity_id": "7",
      "operation": "UPDATE",
      "business_key": "TB#00007",
      "payload": {},
      "created_at": "2026-02-16T16:00:00.000Z"
    }
  ],
  "nextCursor": 123
}
```

## Frontend service contract

`frontend/src/services/realtime.service.ts`
- `pollRealtimeEvents({ sinceId, limit })`
- Returns `{ items, nextCursor }`

Use `nextCursor` as the next `sinceId` for incremental realtime sync.

