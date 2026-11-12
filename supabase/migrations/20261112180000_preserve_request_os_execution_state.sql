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

  -- Preserva o estado e os horários informados pelo técnico na solicitação.
  UPDATE public.ordens_servico
     SET tecnico_id = v_request.tecnico_id,
         tecnico_email = v_request.tecnico_email,
         tecnico_nome = v_request.tecnico_nome,
         status = v_request.status,
         data_inicio = v_request.data_inicio,
         concluida_em = v_request.concluida_em,
         updated_at = now()
   WHERE id = v_existing.id;

  UPDATE public.ordens_servico
     SET os_vinculada_id = v_existing.id,
         numero_os_referencia = v_existing.numero_os,
         status = 'cancelada',
         solicitacao_os = false,
         solicitacao_status = 'regularizada',
         regularizada_em = now(),
         regularizada_por_email = v_email,
         updated_at = now()
   WHERE id = v_request.id;

  INSERT INTO public.historico_edicoes (os_id, acao, detalhe, usuario_id, usuario_email)
  VALUES
    (v_request.id, 'os_existente_encaminhada', 'OS ' || v_existing.numero_os || ' vinculada; estado e horários do técnico preservados na OS oficial.', v_actor, v_email),
    (v_existing.id, 'os_reaproveitada_encaminhada', 'Estado preservado: ' || v_request.status || '; início: ' || coalesce(v_request.data_inicio::text, 'não iniciado') || '; término: ' || coalesce(v_request.concluida_em::text, 'não finalizado') || '.', v_actor, v_email);
  RETURN v_existing.numero_os;
END; $function$;

REVOKE ALL ON FUNCTION public.encaminhar_solicitacao_os_existente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encaminhar_solicitacao_os_existente(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
