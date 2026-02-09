-- Sample data for tb_itsm
-- Insert a few users, tickets, and incidents

-- Users
INSERT INTO users (id, name, email, role) VALUES
('11111111-1111-1111-1111-111111111111','Alice Admin','alice@example.test','ADMIN'),
('22222222-2222-2222-2222-222222222222','Bob Agent','bob@example.test','AGENT'),
('33333333-3333-3333-3333-333333333333','Charlie User','charlie@example.test','USER')
ON CONFLICT DO NOTHING;

-- App users (for authentication)
INSERT INTO app_user (full_name, username, email, role, is_active)
VALUES ('Admin','admin','admin@itsm.com','ADMIN', true)
ON CONFLICT (email) DO NOTHING;

-- Tickets
INSERT INTO tickets (id, title, description, priority, status, assignee_id, requester_id, created_by)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cannot access VPN','User reports VPN connection failing','high','open','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','charlie'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Email delivery delayed','Emails to external domain delayed for 2 hours','medium','in_progress','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','bob')
ON CONFLICT DO NOTHING;

-- Incidents
INSERT INTO incidents (id, title, description, severity, status, assignee_id, impacted_services, created_by)
VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd','Production DB slow','Customers seeing slow responses','P1','investigating','22222222-2222-2222-2222-222222222222', '"[\"payments\", \"orders\"]"'::jsonb,'system'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Monitoring alerts','Multiple alerts from monitoring','P3','new',NULL,'[]'::jsonb,'system')
ON CONFLICT DO NOTHING;
