-- Auditoria somente leitura: inventário para isolamento multi-tenant.
-- Pode ser executado no SQL Editor do Supabase de TESTE.
-- Não cria, altera ou remove objetos/dados. Não executar no projeto oficial.
-- Resultado serve para completar o desenho da migration; não prova isolamento sozinho.

-- 1) Tabelas, RLS e FORCE RLS.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in ('public', 'private')
order by 1, 2;

-- 2) Policies: comando, permissividade, roles, USING e WITH CHECK.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname in ('public', 'private')
order by schemaname, tablename, policyname;

-- 3) Funções/RPCs relevantes: assinatura, SECURITY DEFINER e search_path.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by 1, 2, 3;

-- 4) Triggers: gatilhos que podem executar lógica fora das policies.
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public', 'private')
order by 1, 2, 3;

-- 5) Views e opções de segurança (inclui security_invoker quando suportado).
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname in ('public', 'private')
order by 1, 2;

-- 6) Tabelas expostas por publicações Realtime.
select
  p.pubname as publication_name,
  n.nspname as schema_name,
  c.relname as table_name
from pg_publication_tables p
join pg_namespace n on n.nspname = p.schemaname
join pg_class c on c.relname = p.tablename and c.relnamespace = n.oid
order by 1, 2, 3;

-- 7) Buckets e configuração de acesso do Storage.
-- Esta consulta lê metadados; não lê arquivos.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- 8) Policies do Storage.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- 9) Foreign keys entre tabelas: importante para impedir referências cruzadas.
select
  ns.nspname as schema_name,
  src.relname as source_table,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace ns on ns.oid = src.relnamespace
where con.contype = 'f'
  and ns.nspname in ('public', 'private')
order by 1, 2, 3;
