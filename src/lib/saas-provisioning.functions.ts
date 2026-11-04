import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const PLATFORM_ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";

export const requestTenantProvisioning = createServerFn({ method: "POST" })
  .inputValidator((value) => z.object({ empresaId: z.string().uuid(), accessToken: z.string().min(20) }).parse(value))
  .handler(async ({ data }) => {
    const token = data.accessToken;
    if (!token || token.split(".").length !== 3) {
      return { ok: false as const, error: "Sessão administrativa ausente. Entre novamente." };
    }

    const url = process.env.SAAS_CONTROL_SUPABASE_URL ?? process.env.VITE_SAAS_CONTROL_SUPABASE_URL;
    const publishableKey = process.env.SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SAAS_CONTROL_SUPABASE_SECRET_KEY;
    if (!url || !publishableKey || !secretKey) {
      console.error("[SaaS provisioning] Server configuration is incomplete.");
      return { ok: false as const, error: "Provisionamento indisponível: falta configurar as credenciais seguras do servidor." };
    }

    const authClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getClaims(token);
    const claims = authData?.claims as Record<string, unknown> | undefined;
    if (authError || claims?.email !== PLATFORM_ADMIN_EMAIL || claims?.aal !== "aal2" || typeof claims.sub !== "string") {
      return { ok: false as const, error: "Acesso negado. Administrador da plataforma com MFA AAL2 é obrigatório." };
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: empresa, error: empresaError } = await admin
      .from("empresas")
      .select("id,nome_exibicao,status")
      .eq("id", data.empresaId)
      .maybeSingle();
    if (empresaError || !empresa) return { ok: false as const, error: "Empresa não encontrada no banco de controle." };
    if (empresa.status === "encerrada" || empresa.status === "suspensa") {
      return { ok: false as const, error: "Empresa suspensa ou encerrada não pode iniciar provisionamento." };
    }

    const { data: assinatura, error: assinaturaError } = await admin
      .from("assinaturas")
      .select("id,status,plano:planos(ativo)")
      .eq("empresa_id", data.empresaId)
      .in("status", ["trial", "ativa"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assinaturaError || !assinatura || !assinatura.plano || (assinatura.plano as { ativo?: boolean }).ativo !== true) {
      return { ok: false as const, error: "A empresa precisa ter uma assinatura de teste ou ativa vinculada a um plano ativo." };
    }

    const idempotencyKey = `tenant-provisioning:${data.empresaId}:request-v1`;
    const { data: existing } = await admin
      .from("eventos_provisionamento")
      .select("id,status,mensagem_segura")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, repeated: true, eventId: existing.id, status: existing.status, message: "Já existe uma solicitação registrada para esta empresa. Nenhum projeto foi criado." };
    }

    const { data: event, error: eventError } = await admin
      .from("eventos_provisionamento")
      .insert({
        empresa_id: data.empresaId,
        tipo: "solicitacao_manual_assistida",
        status: "iniciado",
        idempotency_key: idempotencyKey,
        tentativa: 1,
        mensagem_segura: "Solicitação registrada. A criação do projeto está desativada nesta etapa.",
      })
      .select("id,status")
      .single();
    if (eventError || !event) {
      console.error("[SaaS provisioning] Could not create request event:", eventError?.code);
      return { ok: false as const, error: "Não foi possível registrar a solicitação. Tente novamente ou consulte a auditoria." };
    }

    const { error: auditError } = await admin.from("auditoria_plataforma").insert({
      ator_id: claims.sub,
      acao: "solicitar_provisionamento",
      entidade_tipo: "empresa",
      entidade_id: data.empresaId,
      resultado: "sucesso",
      metadados_minimos: { evento_id: event.id, modo: "manual_assistido_sem_criacao_de_projeto" },
    });
    if (auditError) {
      console.error("[SaaS provisioning] Audit insert failed:", auditError.code);
      return { ok: false as const, error: "A solicitação foi registrada, mas a auditoria não foi concluída. Contate o administrador antes de repetir." };
    }

    return {
      ok: true as const,
      repeated: false,
      eventId: event.id,
      status: event.status,
      message: "Solicitação registrada. Nenhum projeto Supabase foi criado.",
    };
  });


export const listTenantProvisioningEvents = createServerFn({ method: "POST" })
  .inputValidator((value) => z.object({ accessToken: z.string().min(20) }).parse(value))
  .handler(async ({ data }) => {
    const token = data.accessToken;
    if (token.split(".").length !== 3) {
      return { ok: false as const, error: "Sessão administrativa ausente. Entre novamente." };
    }

    const url = process.env.SAAS_CONTROL_SUPABASE_URL ?? process.env.VITE_SAAS_CONTROL_SUPABASE_URL;
    const publishableKey = process.env.SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SAAS_CONTROL_SUPABASE_SECRET_KEY;
    if (!url || !publishableKey || !secretKey) {
      return { ok: false as const, error: "Credenciais seguras do servidor não configuradas." };
    }

    const authClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getClaims(token);
    const claims = authData?.claims as Record<string, unknown> | undefined;
    if (authError || claims?.email !== PLATFORM_ADMIN_EMAIL || claims?.aal !== "aal2" || typeof claims.sub !== "string") {
      return { ok: false as const, error: "Acesso negado. Administrador com MFA AAL2 é obrigatório." };
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: events, error } = await admin
      .from("eventos_provisionamento")
      .select("id,empresa_id,tipo,status,tentativa,mensagem_segura,iniciado_em,finalizado_em,empresa:empresas(nome_exibicao,slug)")
      .order("iniciado_em", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[SaaS provisioning] Queue read failed:", error.code);
      return { ok: false as const, error: "Não foi possível consultar a fila de implantação." };
    }

    return { ok: true as const, events: events ?? [] };
  });


export const reviewTenantProvisioning = createServerFn({ method: "POST" })
  .inputValidator((value) => z.object({
    eventId: z.string().uuid(),
    decision: z.enum(["aprovar", "rejeitar"]),
    accessToken: z.string().min(20),
  }).parse(value))
  .handler(async ({ data }) => {
    const token = data.accessToken;
    if (token.split(".").length !== 3) {
      return { ok: false as const, error: "Sessão administrativa ausente. Entre novamente." };
    }

    const url = process.env.SAAS_CONTROL_SUPABASE_URL ?? process.env.VITE_SAAS_CONTROL_SUPABASE_URL;
    const publishableKey = process.env.SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SAAS_CONTROL_SUPABASE_SECRET_KEY;
    if (!url || !publishableKey || !secretKey) {
      return { ok: false as const, error: "Credenciais seguras do servidor não configuradas." };
    }

    const authClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getClaims(token);
    const claims = authData?.claims as Record<string, unknown> | undefined;
    if (authError || claims?.email !== PLATFORM_ADMIN_EMAIL || claims?.aal !== "aal2" || typeof claims.sub !== "string") {
      return { ok: false as const, error: "Acesso negado. Administrador com MFA AAL2 é obrigatório." };
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: event, error: eventError } = await admin
      .from("eventos_provisionamento")
      .select("id,empresa_id,tipo,status")
      .eq("id", data.eventId)
      .maybeSingle();
    if (eventError || !event) return { ok: false as const, error: "Solicitação não encontrada." };
    if (event.tipo !== "solicitacao_manual_assistida" || event.status !== "iniciado") {
      return { ok: false as const, error: "Esta solicitação já foi analisada ou não pode ser analisada por este fluxo." };
    }

    if (data.decision === "aprovar") {
      const { data: empresa, error: empresaError } = await admin
        .from("empresas").select("status").eq("id", event.empresa_id).maybeSingle();
      const { data: assinatura, error: assinaturaError } = await admin
        .from("assinaturas").select("id,plano:planos(ativo)")
        .eq("empresa_id", event.empresa_id).in("status", ["trial", "ativa"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (empresaError || !empresa || empresa.status === "suspensa" || empresa.status === "encerrada") {
        return { ok: false as const, error: "Empresa suspensa, encerrada ou indisponível. Aprovação bloqueada." };
      }
      if (assinaturaError || !assinatura || (assinatura.plano as { ativo?: boolean } | null)?.ativo !== true) {
        return { ok: false as const, error: "Aprovação exige assinatura de teste ou ativa vinculada a um plano ativo." };
      }
    }

    const nextStatus = data.decision === "aprovar" ? "aprovado" : "rejeitado";
    const message = data.decision === "aprovar"
      ? "Solicitação validada pelo administrador. Nenhum projeto foi criado."
      : "Solicitação rejeitada pelo administrador. Nenhum projeto foi criado.";
    const { data: updated, error: updateError } = await admin
      .from("eventos_provisionamento")
      .update({ status: nextStatus, mensagem_segura: message, finalizado_em: new Date().toISOString() })
      .eq("id", data.eventId).eq("status", "iniciado")
      .select("id,status").maybeSingle();
    if (updateError || !updated) {
      console.error("[SaaS provisioning] Review update failed:", updateError?.code);
      return { ok: false as const, error: "Não foi possível concluir a análise. Atualize a fila e tente novamente." };
    }

    const { error: auditError } = await admin.from("auditoria_plataforma").insert({
      ator_id: claims.sub,
      acao: data.decision === "aprovar" ? "aprovar_solicitacao_provisionamento" : "rejeitar_solicitacao_provisionamento",
      entidade_tipo: "evento_provisionamento",
      entidade_id: data.eventId,
      resultado: "sucesso",
      metadados_minimos: { empresa_id: event.empresa_id, status: nextStatus, projeto_criado: false },
    });
    if (auditError) {
      console.error("[SaaS provisioning] Review audit failed:", auditError.code);
      return { ok: false as const, error: "A análise foi registrada, mas a auditoria apresentou falha. Verifique a fila antes de qualquer nova ação." };
    }

    return { ok: true as const, status: nextStatus, message };
  });
