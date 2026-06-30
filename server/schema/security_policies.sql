-- Security hardening:
-- 1) Ensure every public table with RLS has explicit policies (to satisfy linter 0008).
-- 2) Set immutable function search_path for linter 0011.
-- Idempotent and safe to run repeatedly.

DO $$
DECLARE
  table_rec RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  FOR table_rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_rec.tablename);

    IF has_anon
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_rec.tablename
          AND policyname = 'p_deny_anon'
      )
    THEN
      EXECUTE format(
        'CREATE POLICY p_deny_anon ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
        table_rec.tablename
      );
    END IF;

    IF has_authenticated
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_rec.tablename
          AND policyname = 'p_deny_authenticated'
      )
    THEN
      EXECUTE format(
        'CREATE POLICY p_deny_authenticated ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
        table_rec.tablename
      );
    END IF;

    IF has_service_role
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_rec.tablename
          AND policyname = 'p_allow_service_role'
      )
    THEN
      EXECUTE format(
        'CREATE POLICY p_allow_service_role ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        table_rec.tablename
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.set_row_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_row_updated_at() SET search_path = pg_catalog, public;
  END IF;

  IF to_regprocedure('public.app_emit_event()') IS NOT NULL THEN
    ALTER FUNCTION public.app_emit_event() SET search_path = pg_catalog, public;
  END IF;
END;
$$;
