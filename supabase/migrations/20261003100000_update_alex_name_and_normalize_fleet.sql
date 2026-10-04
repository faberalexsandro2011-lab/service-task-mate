-- Padroniza o nome do técnico Alex e remove o prefixo duplicado "Frota" dos dados existentes.

UPDATE public.profiles
SET nome = 'Alexsandro Faber'
WHERE lower(trim(coalesce(nome, ''))) = 'alex';

UPDATE auth.users AS u
SET raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('nome', 'Alexsandro Faber')
WHERE u.id IN (
  SELECT p.id
  FROM public.profiles p
  WHERE lower(trim(coalesce(p.nome, ''))) = 'Alexsandro Faber'
);

UPDATE public.ordens_servico
SET
  tecnico_nome = 'Alexsandro Faber',
  frota = trim(regexp_replace(frota, '^\\s*frota\\s*[:#-]?\\s*', '', 'i'))
WHERE
  lower(trim(coalesce(tecnico_nome, ''))) = 'alex'
  OR frota ~* '^\\s*frota\\s*[:#-]?\\s*';

-- Também normaliza perfis já vinculados às OS com o nome antigo.
UPDATE public.ordens_servico o
SET tecnico_nome = 'Alexsandro Faber'
WHERE lower(trim(coalesce(o.tecnico_nome, ''))) = 'alex';
