-- A função de encaminhamento só pode ser executada por usuários autenticados.
revoke all on function public.encaminhar_solicitacao_os_existente(uuid, uuid, uuid) from anon;
revoke all on function public.encaminhar_solicitacao_os_existente(uuid, uuid, uuid) from public;
grant execute on function public.encaminhar_solicitacao_os_existente(uuid, uuid, uuid) to authenticated;
