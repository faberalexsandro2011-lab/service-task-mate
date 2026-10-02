-- Reforça a criação e associação de usuários técnicos.
-- Corrige o cadastro pelo backend quando user_roles não possui UNIQUE(user_id)
-- e garante perfil/papel para novos usuários do Supabase Auth.

-- 1) Evita mais de um papel por usuário no fluxo atual do aplicativo.
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

-- 2) Garante perfil e papel automaticamente quando uma conta Auth é criada.
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
        THEN 'gestor'
      ELSE 'tecnico'
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 3) Mantém os dados atuais alinhados com o Auth.
INSERT INTO public.profiles (id, email, nome)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'nome'), ''),
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(u.email, ''), '@', 1)
  )
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  nome = CASE
    WHEN NULLIF(trim(public.profiles.nome), '') IS NULL THEN EXCLUDED.nome
    ELSE public.profiles.nome
  END;

INSERT INTO public.user_roles (user_id, role)
SELECT
  u.id,
  CASE
    WHEN lower(coalesce(u.raw_user_meta_data ->> 'role', '')) = 'gestor'
      THEN 'gestor'
    ELSE 'tecnico'
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles r
  WHERE r.user_id = u.id
);

-- 4) Índices usados pela sincronização do técnico.
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_id
  ON public.ordens_servico (tecnico_id);

CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_email
  ON public.ordens_servico (lower(tecnico_email));

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles (user_id);
