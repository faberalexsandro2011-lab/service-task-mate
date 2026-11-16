-- Exibe e preserva o nome do responsável nas movimentações do Central Frota.
-- Aplicar somente no banco de testes desta branch.

alter table public.instalacoes_frota
  add column if not exists instalado_por_nome text,
  add column if not exists retirado_por_nome text;

-- Recupera os nomes dos registros já existentes.
update public.instalacoes_frota i
set instalado_por_nome = coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(coalesce(i.instalado_por_email, ''), '@', 1), ''))
from auth.users u
where u.id = i.instalado_por
  and nullif(trim(i.instalado_por_nome), '') is null;

update public.instalacoes_frota i
set retirado_por_nome = coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(coalesce(i.retirado_por_email, ''), '@', 1), ''))
from auth.users u
where u.id = i.retirado_por
  and nullif(trim(i.retirado_por_nome), '') is null;

create or replace function public.central_frota_auditar_instalacao()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    new.instalado_em := now();
    new.instalado_por := auth.uid();
    new.instalado_por_email := coalesce(auth.jwt() ->> 'email', '');
    select coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'nome'), ''), nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''))
      into new.instalado_por_nome;
    if new.instalado_por_nome is null then
      new.instalado_por_nome := nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '');
    end if;
    if new.instalado_por is null then
      raise exception 'É necessário estar autenticado para registrar uma instalação.';
    end if;
    if not exists (
      select 1 from public.frotas f
      where f.id = new.frota_id and f.unidade_id = new.unidade_id
    ) or not exists (
      select 1 from public.componentes_frota c
      where c.id = new.componente_id and c.unidade_id = new.unidade_id and c.status = 'disponivel'
    ) then
      raise exception 'Frota ou componente indisponível ou pertencente a outra unidade.';
    end if;
    return new;
  end if;

  if old.retirado_em is not null then
    raise exception 'O histórico de instalação já foi encerrado e não pode ser alterado.';
  end if;
  if new.frota_id <> old.frota_id
    or new.componente_id <> old.componente_id
    or new.unidade_id <> old.unidade_id
    or new.instalado_em <> old.instalado_em
    or new.instalado_por <> old.instalado_por
    or new.instalado_por_email is distinct from old.instalado_por_email
    or new.instalado_por_nome is distinct from old.instalado_por_nome then
    raise exception 'Os dados originais da instalação são imutáveis.';
  end if;
  if new.retirado_em is not null then
    new.retirado_em := now();
    new.retirado_por := auth.uid();
    new.retirado_por_email := coalesce(auth.jwt() ->> 'email', '');
    select coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'nome'), ''), nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''))
      into new.retirado_por_nome;
    if new.retirado_por_nome is null then
      new.retirado_por_nome := nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '');
    end if;
    if new.retirado_por is null then
      raise exception 'É necessário estar autenticado para registrar uma retirada.';
    end if;
    if nullif(trim(coalesce(new.motivo_retirada, '')), '') is null then
      raise exception 'Informe o motivo da retirada.';
    end if;
    if new.status_apos_retirada is null then
      new.status_apos_retirada := 'disponivel';
    end if;
  else
    raise exception 'Só é permitido encerrar uma instalação; não é permitido editar o histórico.';
  end if;
  return new;
end;
$$;
