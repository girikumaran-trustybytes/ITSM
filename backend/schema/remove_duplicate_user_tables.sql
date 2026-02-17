-- Canonical user table cleanup.
-- Keeps "User" as source of truth and removes duplicate user table name variants.
-- Review in non-production first.

BEGIN;

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "Users";
DROP TABLE IF EXISTS "USER";
DROP TABLE IF EXISTS "USERS";

COMMIT;
