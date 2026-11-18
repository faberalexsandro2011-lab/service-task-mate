-- QR Code público e permanente por frota.
-- A consulta pública expõe apenas os dados cadastrais e os dispositivos atualmente instalados.

alter table public.frotas
  add column if not exists qr_publico_token uuid;

create unique index if not exists frotas_qr_publico_token_unique
  on public.frotas (qr_publico_token)
  where qr_publico_token is not null;

create or replace function public.central_frota_gerar_qr_publico(p_frota_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidade_id uuid;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;

  select unidade_id, qr_publico_token
    into v_unidade_id, v_token
  from public.frotas
  where id = p_frota_id
  for update;

  if not found then
    raise exception 'Frota não encontrada.';
  end if;

  if not public.central_frota_tem_acesso(v_unidade_id, true) then
    raise exception 'Você não tem permissão para gerar o QR Code desta frota.';
  end if;

  if v_token is null then
    v_token := gen_random_uuid();
    update public.frotas
      set qr_publico_token = v_token
    where id = p_frota_id;
  end if;

  return v_token;
end;
$$;

revoke all on function public.central_frota_gerar_qr_publico(uuid) from public, anon;
grant execute on function public.central_frota_gerar_qr_publico(uuid) to authenticated;

create or replace function public.central_frota_consulta_publica(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'frota', jsonb_build_object(
      'numero', f.numero,
      'tipo', f.tipo,
      'marca', f.marca,
      'modelo', f.modelo,
      'identificacao', f.identificacao,
      'status', f.status,
      'unidade', u.nome
    ),
    'dispositivos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tipo', c.tipo,
          'fabricante', c.fabricante,
          'modelo', c.modelo,
          'numero_serie', c.numero_serie,
          'observacoes', c.observacoes
        )
        order by c.tipo, c.fabricante, c.modelo, c.numero_serie
      )
      from public.instalacoes_frota i
      join public.componentes_frota c on c.id = i.componente_id
      where i.frota_id = f.id
        and i.retirado_em is null
    ), '[]'::jsonb)
  )
  from public.frotas f
  join public.unidades u on u.id = f.unidade_id
  where f.qr_publico_token = p_token;
$$;

revoke all on function public.central_frota_consulta_publica(uuid) from public;
grant execute on function public.central_frota_consulta_publica(uuid) to anon, authenticated;

comment on column public.frotas.qr_publico_token is
  'Identificador aleatório permanente usado exclusivamente para consulta pública por QR Code.';
