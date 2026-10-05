-- Reconcile the remote database with the versioned Central OS schema.
-- This migration is intentionally idempotent so it can repair an existing
-- database without deleting application data.

-- Status model used by the application.
UPDATE public.ordens_servico
SET status = 'pendente'
WHERE status NOT IN ('pendente', 'em_andamento', 'concluida', 'cancelada');

ALTER TABLE public.ordens_servico
  ALTER COLUMN status SET DEFAULT 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ordens_servico_status_check'
      AND conrelid = 'public.ordens_servico'::regclass
  ) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_status_check
      CHECK (status IN ('pendente','em_andamento','concluida','cancelada'));
  END IF;
END $$;

-- One role per user, as expected by the current application.
DELETE FROM public.user_roles a
WHERE a.id IN (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
    FROM public.user_roles
  ) x
  WHERE x.rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_user_id_key'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Timestamp maintenance.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_ordens_servico_updated_at ON public.ordens_servico;
CREATE TRIGGER update_ordens_servico_updated_at
BEFORE UPDATE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep Auth users synchronized with application profile/role rows.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data ->> 'nome'), ''),
      NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(COALESCE(NEW.email, ''), '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    nome = COALESCE(NULLIF(trim(public.profiles.nome), ''), EXCLUDED.nome);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN lower(coalesce(NEW.raw_user_meta_data ->> 'role', '')) = 'gestor'
        THEN 'gestor'::public.app_role
      ELSE 'tecnico'::public.app_role
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Login by username/name.
CREATE OR REPLACE FUNCTION public.lookup_email_by_username(p_nome text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE lower(trim(coalesce(p.nome, ''))) = lower(trim(coalesce(p_nome, '')))
  ORDER BY p.created_at
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_email_by_username(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon;

-- Realtime for service orders.
ALTER TABLE public.ordens_servico REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication pub ON pub.oid = pr.prpubid
    WHERE pub.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'ordens_servico'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_servico;
  END IF;
END $$;

-- Indexes used by the application's RLS and synchronization paths.
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_id
  ON public.ordens_servico (tecnico_id)
  WHERE tecnico_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_email_lower
  ON public.ordens_servico (lower(tecnico_email))
  WHERE tecnico_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_historico_edicoes_os_id
  ON public.historico_edicoes (os_id);

-- Replace the old manager ALL policy so managers cannot delete arbitrary OS.
DROP POLICY IF EXISTS "Gestores gerenciam OS" ON public.ordens_servico;

DROP POLICY IF EXISTS "Gestores leem OS" ON public.ordens_servico;
CREATE POLICY "Gestores leem OS"
ON public.ordens_servico FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

DROP POLICY IF EXISTS "Gestores criam OS" ON public.ordens_servico;
CREATE POLICY "Gestores criam OS"
ON public.ordens_servico FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

DROP POLICY IF EXISTS "Gestores atualizam OS" ON public.ordens_servico;
CREATE POLICY "Gestores atualizam OS"
ON public.ordens_servico FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

DROP POLICY IF EXISTS "Administrador principal exclui OS" ON public.ordens_servico;
CREATE POLICY "Administrador principal exclui OS"
ON public.ordens_servico FOR DELETE TO authenticated
USING (
  lower(coalesce(auth.jwt() ->> 'email', '')) =
  'faber.alexsandro2011@gmail.com'
);

-- Keep the current technician queue/assignment rules and ensure the policy
-- used by the latest application is present.
DROP POLICY IF EXISTS "Tecnicos podem visualizar suas OS" ON public.ordens_servico;
CREATE POLICY "Tecnicos podem visualizar suas OS"
ON public.ordens_servico FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR tecnico_id = auth.uid()
  OR (tecnico_id IS NULL AND tecnico_email IS NULL AND status = 'pendente')
  OR (
    tecnico_id IS NULL
    AND lower(trim(tecnico_email)) = lower(trim(coalesce(auth.email(), '')))
  )
);

DROP POLICY IF EXISTS "Tecnicos podem atualizar suas OS" ON public.ordens_servico;
CREATE POLICY "Tecnicos podem atualizar suas OS"
ON public.ordens_servico FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR tecnico_id = auth.uid()
  OR (tecnico_id IS NULL AND tecnico_email IS NULL AND status = 'pendente')
)
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR (
    tecnico_id = auth.uid()
    AND lower(trim(coalesce(tecnico_email, ''))) =
        lower(trim(coalesce(auth.email(), '')))
  )
);

NOTIFY pgrst, 'reload schema';
