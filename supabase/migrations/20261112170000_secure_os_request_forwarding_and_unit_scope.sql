CREATE OR REPLACE FUNCTION public.encaminhar_solicitacao_numero_os(p_solicitacao_id uuid, p_numero_os text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_request public.ordens_servico%rowtype; v_duplicate public.ordens_servico%rowtype;
  v_actor uuid := auth.uid(); v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_number text := trim(coalesce(p_numero_os, '')); v_role text; v_unit uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sessão inválida. Entre novamente.'; END IF;
  SELECT perfil, unidade_id INTO v_role, v_unit FROM public.usuarios_unidades WHERE user_id = v_actor AND ativo = true LIMIT 1;
  IF v_role NOT IN ('gestor', 'admin_unidade', 'gestor_central') THEN RAISE EXCEPTION 'Apenas gestores ou ADM autorizado podem encaminhar solicitações de OS.'; END IF;
  IF v_role <> 'gestor_central' AND v_unit IS NULL THEN RAISE EXCEPTION 'Seu usuário não possui unidade ativa vinculada.'; END IF;
  IF v_number = '' THEN RAISE EXCEPTION 'Informe o número da OS.'; END IF;
  SELECT * INTO v_request FROM public.ordens_servico WHERE id = p_solicitacao_id AND solicitacao_os = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada ou já tratada.'; END IF;
  IF v_role <> 'gestor_central' AND v_request.unidade_id IS DISTINCT FROM v_unit THEN RAISE EXCEPTION 'Você só pode encaminhar solicitações da sua própria unidade.'; END IF;
  SELECT * INTO v_duplicate FROM public.ordens_servico WHERE numero_os = v_number AND id <> v_request.id LIMIT 1;
  IF FOUND THEN
    IF lower(trim(v_duplicate.frota)) = lower(trim(v_request.frota)) THEN RAISE EXCEPTION 'Esse número já existe para esta frota. Selecione a OS pendente na opção de reaproveitamento.';
    ELSE RAISE EXCEPTION 'Esse número de OS já está cadastrado para outra frota. Confira o número antes de enviar.'; END IF;
  END IF;
  UPDATE public.ordens_servico SET numero_os = v_number, solicitacao_os = false, solicitacao_status = 'regularizada', regularizada_em = now(), regularizada_por_email = v_email, updated_at = now() WHERE id = v_request.id;
  INSERT INTO public.historico_edicoes (os_id, acao, detalhe, usuario_id, usuario_email)
  VALUES (v_request.id, 'numero_os_informado', 'O gestor informou somente o número ' || v_number || ' e encaminhou a OS ao técnico, preservando os demais dados da solicitação.', v_actor, v_email);
  RETURN v_number;
END; $function$;

CREATE OR REPLACE FUNCTION public.encaminhar_solicitacao_os_existente(p_solicitacao_id uuid, p_os_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_request public.ordens_servico%rowtype; v_existing public.ordens_servico%rowtype;
  v_actor uuid := auth.uid(); v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_role text; v_unit uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sessão inválida. Entre novamente.'; END IF;
  SELECT perfil, unidade_id INTO v_role, v_unit FROM public.usuarios_unidades WHERE user_id = v_actor AND ativo = true LIMIT 1;
  IF v_role NOT IN ('gestor', 'admin_unidade', 'gestor_central') THEN RAISE EXCEPTION 'Apenas gestores ou ADM autorizado podem encaminhar solicitações de OS.'; END IF;
  IF v_role <> 'gestor_central' AND v_unit IS NULL THEN RAISE EXCEPTION 'Seu usuário não possui unidade ativa vinculada.'; END IF;
  SELECT * INTO v_request FROM public.ordens_servico WHERE id = p_solicitacao_id AND solicitacao_os = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada ou já tratada.'; END IF;
  IF v_role <> 'gestor_central' AND v_request.unidade_id IS DISTINCT FROM v_unit THEN RAISE EXCEPTION 'Você só pode encaminhar solicitações da sua própria unidade.'; END IF;
  SELECT * INTO v_existing FROM public.ordens_servico WHERE id = p_os_id AND lower(trim(frota)) = lower(trim(v_request.frota)) AND status = 'pendente' AND coalesce(solicitacao_os, false) = false AND nullif(trim(numero_os), '') IS NOT NULL AND unidade_id = v_request.unidade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A OS selecionada não está mais pendente, não corresponde à frota ou pertence a outra unidade.'; END IF;
  IF v_role <> 'gestor_central' AND v_existing.unidade_id IS DISTINCT FROM v_unit THEN RAISE EXCEPTION 'Você só pode reaproveitar OS da sua própria unidade.'; END IF;
  UPDATE public.ordens_servico SET tecnico_id = v_request.tecnico_id, tecnico_email = v_request.tecnico_email, tecnico_nome = v_request.tecnico_nome, updated_at = now() WHERE id = v_existing.id;
  UPDATE public.ordens_servico SET os_vinculada_id = v_existing.id, numero_os_referencia = v_existing.numero_os, status = 'cancelada', solicitacao_os = false, solicitacao_status = 'regularizada', regularizada_em = now(), regularizada_por_email = v_email, updated_at = now() WHERE id = v_request.id;
  INSERT INTO public.historico_edicoes (os_id, acao, detalhe, usuario_id, usuario_email)
  VALUES (v_request.id, 'os_existente_encaminhada', 'OS ' || v_existing.numero_os || ' da frota ' || v_request.frota || ' vinculada à solicitação e encaminhada para ' || coalesce(v_request.tecnico_nome, v_request.tecnico_email, 'técnico') || '. A OS original foi preservada.', v_actor, v_email),
  (v_existing.id, 'os_reaproveitada_encaminhada', 'OS encaminhada ao técnico por meio da solicitação ' || v_request.id::text || '. Número e dados originais preservados.', v_actor, v_email);
  RETURN v_existing.numero_os;
END; $function$;

REVOKE ALL ON FUNCTION public.encaminhar_solicitacao_numero_os(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.encaminhar_solicitacao_os_existente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encaminhar_solicitacao_numero_os(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encaminhar_solicitacao_os_existente(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
