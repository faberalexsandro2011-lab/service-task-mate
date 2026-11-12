-- Limita as funções de encaminhamento a usuários autenticados.
revoke all on function public.encaminhar_solicitacao_os_existente(uuid, uuid) from public, anon;
revoke all on function public.encaminhar_solicitacao_numero_os(uuid, text) from public, anon;
grant execute on function public.encaminhar_solicitacao_os_existente(uuid, uuid) to authenticated;
grant execute on function public.encaminhar_solicitacao_numero_os(uuid, text) to authenticated;
