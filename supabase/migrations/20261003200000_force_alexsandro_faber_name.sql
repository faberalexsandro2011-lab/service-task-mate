-- Garante que o técnico identificado como "Alex" seja exibido como "Alexsandro Faber".

UPDATE public.profiles
SET nome = 'Alexsandro Faber'
WHERE lower(trim(coalesce(nome, ''))) IN ('alex', 'alexsandro faber');

UPDATE public.ordens_servico
SET tecnico_nome = 'Alexsandro Faber'
WHERE lower(trim(coalesce(tecnico_nome, ''))) IN ('alex', 'alexsandro faber');

UPDATE auth.users AS u
SET raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('nome', 'Alexsandro Faber')
WHERE lower(trim(coalesce(u.raw_user_meta_data->>'nome', ''))) IN ('alex', 'alexsandro faber');
