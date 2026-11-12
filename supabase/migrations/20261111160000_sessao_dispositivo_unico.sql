-- Sessão exclusiva por conta: mantém apenas o device_id mais recente ativo.
create table if not exists public.sessoes_dispositivo_ativas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.sessoes_dispositivo_ativas enable row level security;
revoke all on public.sessoes_dispositivo_ativas from anon, authenticated;

create or replace function public.registrar_sessao_dispositivo(p_device_id text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'É necessário entrar na conta.'; end if;
  if p_device_id is null or length(trim(p_device_id)) < 16 or length(p_device_id) > 128 then raise exception 'Identificador de dispositivo inválido.'; end if;
  insert into public.sessoes_dispositivo_ativas(user_id, device_id, atualizado_em) values (v_user_id, p_device_id, now())
  on conflict (user_id) do update set device_id = excluded.device_id, atualizado_em = now();
  return jsonb_build_object('permitido', true);
end; $$;

create or replace function public.verificar_sessao_dispositivo(p_device_id text)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (select 1 from public.sessoes_dispositivo_ativas s where s.user_id = auth.uid() and s.device_id = p_device_id);
$$;

revoke all on function public.registrar_sessao_dispositivo(text) from public, anon;
revoke all on function public.verificar_sessao_dispositivo(text) from public, anon;
grant execute on function public.registrar_sessao_dispositivo(text) to authenticated;
grant execute on function public.verificar_sessao_dispositivo(text) to authenticated;