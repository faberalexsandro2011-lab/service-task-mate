-- Reparação idempotente de perfis, papéis, RLS e sincronização do técnico.
-- Execute no banco do projeto Lovable Cloud associado ao aplicativo.

-- 1) Recria perfis ausentes a partir do Auth e completa dados vazios.
INSERT INTO public.profiles (id, email, nome)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'nome'), ''),
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(u.email, '@', 1)
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL;

UPDATE public.profiles p
SET
  email = u.email,
  nome = COALESCE(
    NULLIF(trim(p.nome), ''),
    NULLIF(trim(u.raw_user_meta_data ->> 'nome'), ''),
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(u.email, '@', 1)
  )
FROM auth.users u
WHERE u.id = p.id
  AND u.email IS NOT NULL
  AND (
    p.email IS DISTINCT FROM u.email
    OR NULLIF(trim(p.nome), '') IS NULL
  );

-- 2) Garante um papel para contas existentes que ainda não possuem user_roles.
INSERT INTO public.user_roles (user_id, role)
SELECT
  u.id,
  CASE
    WHEN lower(coalesce(u.raw_user_meta_data ->> 'role', '')) = 'gestor'
      THEN 'gestor'::public.app_role
    ELSE 'tecnico'::public.app_role
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id
);

-- 3) RLS de perfil/papel.
DROP POLICY IF EXISTS "Tecnicos leem proprio perfil central_os" ON public.profiles;
DROP POLICY IF EXISTS "Tecnicos inserem proprio perfil central_os" ON public.profiles;
DROP POLICY IF EXISTS "Tecnicos atualizam proprio perfil central_os" ON public.profiles;

CREATE POLICY "Usuarios leem proprio perfil central_os"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Usuarios inserem proprio perfil central_os"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Usuarios atualizam proprio perfil central_os"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'gestor'))
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

DROP POLICY IF EXISTS "Usuarios leem proprio papel central_os" ON public.user_roles;
CREATE POLICY "Usuarios leem proprio papel central_os"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'));

-- 4) OS: técnico pode ler/atualizar quando atribuído por ID OU e-mail.
DROP POLICY IF EXISTS "Tecnicos veem OS pelo email atribuido" ON public.ordens_servico;
DROP POLICY IF EXISTS "Tecnicos atualizam OS pelo email atribuido" ON public.ordens_servico;
DROP POLICY IF EXISTS "Tecnicos veem OS por ID ou email central_os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Tecnicos atualizam OS por ID ou email central_os" ON public.ordens_servico;

CREATE POLICY "Tecnicos veem OS por ID ou email central_os"
ON public.ordens_servico FOR SELECT TO authenticated
USING (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) =
       lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
);

CREATE POLICY "Tecnicos atualizam OS por ID ou email central_os"
ON public.ordens_servico FOR UPDATE TO authenticated
USING (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) =
       lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
)
WITH CHECK (
  (
    tecnico_id = auth.uid()
    OR lower(coalesce(tecnico_email, '')) =
       lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  )
  AND public.has_role(auth.uid(), 'tecnico')
);

-- 5) Histórico: técnico pode ler/inserir histórico da própria OS por ID OU e-mail.
DROP POLICY IF EXISTS "Tecnicos registram historico por ID ou email central_os" ON public.historico_edicoes;

CREATE POLICY "Tecnicos leem historico por ID ou email central_os"
ON public.historico_edicoes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor')
  OR EXISTS (
    SELECT 1
    FROM public.ordens_servico o
    WHERE o.id = os_id
      AND (
        o.tecnico_id = auth.uid()
        OR lower(coalesce(o.tecnico_email, '')) =
           lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
      )
      AND public.has_role(auth.uid(), 'tecnico')
  )
);

CREATE POLICY "Tecnicos registram historico por ID ou email central_os"
ON public.historico_edicoes FOR INSERT TO authenticated
WITH CHECK (
  usuario_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.ordens_servico o
    WHERE o.id = os_id
      AND (
        o.tecnico_id = auth.uid()
        OR lower(coalesce(o.tecnico_email, '')) =
           lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
      )
      AND public.has_role(auth.uid(), 'tecnico')
  )
);

-- 6) Login por nome/usuário.
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

GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon, authenticated;

-- 7) Realtime da tabela de OS. Não falha se já estiver publicado.
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
