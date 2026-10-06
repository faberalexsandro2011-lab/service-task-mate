-- Padroniza o nome exibido do técnico Alex para evitar duplicidade no painel.
UPDATE public.profiles
SET nome = 'Alexsandro Faber'
WHERE lower(email) = lower('faber-alex2011@hotmail.com');

UPDATE public.ordens_servico
SET tecnico_nome = 'Alexsandro Faber'
WHERE lower(coalesce(tecnico_email, '')) = lower('faber-alex2011@hotmail.com');
