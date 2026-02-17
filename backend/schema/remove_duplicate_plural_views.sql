-- Cleanup script: remove duplicate plural view names that mirror core tables.
-- Use this when you want only canonical table names in DB tooling.

BEGIN;

DROP VIEW IF EXISTS users;
DROP VIEW IF EXISTS assets;
DROP VIEW IF EXISTS suppliers;
DROP VIEW IF EXISTS tickets;

COMMIT;

