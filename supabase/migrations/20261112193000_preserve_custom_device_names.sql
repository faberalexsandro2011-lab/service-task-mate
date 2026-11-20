-- Preserve administrator-defined device names during automatic access heartbeats.
create or replace function public.registrar_dispositivo_acesso(
  p_device_id text,
  p_nome_dispositivo text default null::text,
  p_user_agent text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_bloqueado boolean;
  v_email text := auth.jwt() ->> 'email';
begin
  if v_user_id is null then
    raise exception 'É necessário entrar na conta.';
  end if;

  if p_device_id is null or length(trim(p_device_id)) < 16 or length(p_device_id) > 128 then
    raise exception 'Identificador de dispositivo inválido.';
  end if;

  select bloqueado into v_bloqueado
  from public.dispositivos_acesso
  where user_id = v_user_id and device_id = p_device_id;

  if coalesce(v_bloqueado, false) then
    return jsonb_build_object('permitido', false, 'motivo', 'Este dispositivo foi bloqueado pelo gestor geral.');
  end if;

  insert into public.dispositivos_acesso(
    user_id, user_email, device_id, nome_dispositivo, user_agent, ultimo_acesso_em
  )
  values (
    v_user_id,
    v_email,
    p_device_id,
    coalesce(nullif(trim(p_nome_dispositivo), ''), 'Dispositivo sem nome'),
    left(coalesce(p_user_agent, ''), 1000),
    now()
  )
  on conflict (user_id, device_id) do update
    set user_email = excluded.user_email,
        -- Preserve custom names set by the Gestor Geral.
        nome_dispositivo = case
          when dispositivos_acesso.nome_dispositivo = 'Dispositivo sem nome'
            then coalesce(nullif(trim(p_nome_dispositivo), ''), dispositivos_acesso.nome_dispositivo)
          else dispositivos_acesso.nome_dispositivo
        end,
        user_agent = left(coalesce(nullif(p_user_agent, ''), dispositivos_acesso.user_agent, ''), 1000),
        ultimo_acesso_em = now();

  return jsonb_build_object('permitido', true);
end;
$function$;
