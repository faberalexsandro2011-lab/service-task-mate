-- Enforce the read-only role across every RLS-protected public table.
-- Restrictive policies are ANDed with existing permissive policies, so a
-- viewer cannot write through broad self-service or email-based policies.
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = true
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'viewer_no_insert', tbl.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'viewer_no_update', tbl.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'viewer_no_delete', tbl.table_name);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.has_role(auth.uid(), ''visualizador''))',
      'viewer_no_insert', tbl.table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.has_role(auth.uid(), ''visualizador'')) WITH CHECK (NOT public.has_role(auth.uid(), ''visualizador''))',
      'viewer_no_update', tbl.table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.has_role(auth.uid(), ''visualizador''))',
      'viewer_no_delete', tbl.table_name
    );
  END LOOP;
END
$$;
