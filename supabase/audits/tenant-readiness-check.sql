-- Verificação de prontidão para multi-tenant (somente leitura).
-- Executar somente no Supabase OPERACIONAL DE TESTE.
-- Não cria/edita objetos nem dados. Não executar no projeto oficial.
-- Esta consulta identifica bloqueios conhecidos no modelo atual de multiunidade.

-- A) Colunas de vínculo empresarial ausentes nas tabelas operacionais.
with expected(table_name) as (
  values
    ('unidades'),
    ('usuarios_unidades'),
    ('ordens_servico'),
    ('pecas_catalogo'),
    ('estoque_movimentacoes'),
    ('dispositivos_acesso'),
    ('historico_edicoes')
)
select
  e.table_name,
  case
    when to_regclass('public.' || e.table_name) is null then 'TABELA_AUSENTE'
    when exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = e.table_name
        and c.column_name = 'empresa_id'
    ) then 'EMPRESA_ID_PRESENTE'
    else 'BLOQUEIO: SEM_EMPRESA_ID'
  end as tenant_link_status
from expected e
order by e.table_name;

-- B) Estrutura atual de usuarios_unidades: confirma se user_id é a chave única.
select
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.conrelid = to_regclass('public.usuarios_unidades')
  and con.contype in ('p', 'u')
order by con.contype, con.conname;

-- C) Policies com indícios de autorização global de gestor/admin.
-- Revisão humana obrigatória: o texto da policy não é uma prova isolada.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    coalesce(qual, '') ilike '%gestor_central%'
    or coalesce(qual, '') ilike '%gestor_operacional%'
    or coalesce(qual, '') ilike '%admin_unidade%'
    or coalesce(with_check, '') ilike '%gestor_central%'
    or coalesce(with_check, '') ilike '%gestor_operacional%'
    or coalesce(with_check, '') ilike '%admin_unidade%'
  )
order by tablename, policyname;

-- D) RPCs SECURITY DEFINER expostas em public.
-- Conferir cada função, suas verificações de tenant e privilégios EXECUTE.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname, arguments;

-- E) Verifica se há chave estrangeira composta para evitar vínculos entre empresas.
-- O resultado é inventário; validar manualmente após a inclusão de empresa_id.
select
  src.relname as source_table,
  con.conname as foreign_key,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace ns on ns.oid = src.relnamespace
where con.contype = 'f'
  and ns.nspname = 'public'
order by src.relname, con.conname;
