#!/bin/bash
set -e

# This script runs during the Postgres container first-time init.
# It creates a limited application role and grants minimal privileges on the target DB.

if [ -z "$POSTGRES_APP_USER" ] || [ -z "$POSTGRES_APP_PASSWORD" ]; then
  echo "POSTGRES_APP_USER and POSTGRES_APP_PASSWORD must be set"
  exit 1
fi

echo "Creating application role '$POSTGRES_APP_USER' and granting privileges on database '$POSTGRES_DB'..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${POSTGRES_APP_USER}') THEN
      CREATE ROLE ${POSTGRES_APP_USER} WITH LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
    END IF;
  END $$;

  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_APP_USER};
EOSQL

# After connecting to the target DB, grant schema/table privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  GRANT USAGE ON SCHEMA public TO ${POSTGRES_APP_USER};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${POSTGRES_APP_USER};
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${POSTGRES_APP_USER};
EOSQL

echo "Application role setup complete."
