-- Security hardening for PostgreSQL data exposure.
-- Idempotent: safe to run repeatedly.

DO $$
DECLARE
  table_rec RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR table_rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_rec.tablename);

    IF has_anon THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_rec.tablename);
    END IF;

    IF has_authenticated THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_rec.tablename);
    END IF;
  END LOOP;
END;
$$;
