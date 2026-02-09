-- Schema for itsm (executed during container init)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App users table for authentication/authorization
-- (RBAC tables created in 03_rbac.sql: app_user, roles, permissions, mappings)

-- Tickets table (simplified)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_id UUID NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL
);

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'P3',
  status TEXT NOT NULL DEFAULT 'new',
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  impacted_services JSONB DEFAULT '[]'::jsonb,
  mitigation TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL
);

-- Add indexes for common filters
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
