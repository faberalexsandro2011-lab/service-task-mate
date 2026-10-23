import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!url || !serviceKey || !token) return json({ ok: false, error: "Configuração ou autenticação ausente." }, 401);

  const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const actor = authData.user;
  if (authError || !actor) return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: actorProfile, error: actorProfileError } = await admin
    .from("usuarios_unidades")
    .select("user_id,perfil,unidade_id,ativo")
    .eq("user_id", actor.id)
    .maybeSingle();

  const isPrimary = (actor.email ?? "").toLowerCase() === "faber.alexsandro2011@gmail.com";
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON inválido." }, 400); }
  const action = body.action;
  const gestorCentralAtivo = !!actorProfile && !actorProfileError && actorProfile.ativo === true &&
    actorProfile.perfil === "gestor_central" && actorProfile.unidade_id === null;
  const adminUnidadeAtivo = !!actorProfile && !actorProfileError && actorProfile.ativo === true &&
    actorProfile.perfil === "admin_unidade" && actorProfile.unidade_id !== null;
  const gestorAtivo = !!actorProfile && !actorProfileError && actorProfile.ativo === true &&
    actorProfile.perfil === "gestor" && actorProfile.unidade_id === null;

  // ADM de unidade pode consultar somente os técnicos ativos vinculados à própria unidade.
  // As ações de gestão de contas continuam restritas ao Gestor Central.
  if (action === "list") {
    if (!gestorCentralAtivo && !adminUnidadeAtivo && !gestorAtivo) {
      return json({ ok: false, error: "Este perfil não pode consultar a lista de usuários." }, 403);
    }
    let query = admin.from("usuarios_unidades")
      .select("user_id,unidade_id,perfil,ativo,created_at").order("perfil");
    if (adminUnidadeAtivo && actorProfile) {
      query = query.eq("unidade_id", actorProfile.unidade_id).eq("perfil", "tecnico").eq("ativo", true);
    } else if (gestorAtivo) {
      // Gestor operacional só recebe a lista de técnicos ativos para atribuir OS;
      // não recebe contas administrativas nem tem ações de gestão de usuários.
      query = query.eq("perfil", "tecnico").eq("ativo", true);
    }
    const { data, error } = await query;
    if (error) return json({ ok: false, error: "Não foi possível listar usuários." }, 500);
    const ids = (data ?? []).map((u) => u.user_id);
    const usersById = new Map<string, { email?: string; nome?: string }>();
    // Auth Admin list is paginated; scan only until the requested ids are resolved.
    for (let page = 1; page <= 20; page++) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (listError) return json({ ok: false, error: "Não foi possível consultar os e-mails." }, 500);
      for (const user of pageData.users) {
        if (ids.includes(user.id)) usersById.set(user.id, { email: user.email, nome: String(user.user_metadata?.nome ?? "") });
      }
      if (pageData.users.length < 100 || ids.every((id) => usersById.has(id))) break;
    }
    return json({ ok: true, users: (data ?? []).map((u) => ({
      ...u, email: usersById.get(u.user_id)?.email ?? "", nome: usersById.get(u.user_id)?.nome ?? "",
    })) });
  }

  // ADM de unidade pode criar somente técnicos; a unidade será forçada no servidor.
  if (!gestorCentralAtivo && !(adminUnidadeAtivo && action === "create" && body.perfil === "tecnico")) {
    return json({ ok: false, error: "O Gestor Geral gerencia contas; o ADM pode cadastrar apenas técnicos da própria unidade." }, 403);
  }

  if (action === "create") {
    const nome = String(body.nome ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const perfil = String(body.perfil ?? "");
    const unidadeCodigo = String(body.unidade_codigo ?? "");
    if (!nome || nome.length > 120) return json({ ok: false, error: "Informe um nome válido." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Informe um e-mail válido." }, 400);
    if (password.length < 8 || password.length > 128) return json({ ok: false, error: "A senha deve ter entre 8 e 128 caracteres." }, 400);
    const allowed = ["admin_unidade", "tecnico", "visualizador", "gestor", "gestor_central"];
    if (!allowed.includes(perfil)) return json({ ok: false, error: "Perfil inválido." }, 400);
    if (perfil === "gestor_central" && !isPrimary) return json({ ok: false, error: "Somente o administrador principal pode criar Gestores Gerais." }, 403);
    if (perfil === "gestor" && !isPrimary) return json({ ok: false, error: "Somente a conta principal pode criar usuários Gestor." }, 403);
    let unidadeId: string | null = null;
    if (adminUnidadeAtivo) {
      if (perfil !== "tecnico" || !actorProfile?.unidade_id) {
        return json({ ok: false, error: "O ADM pode cadastrar apenas técnicos na própria unidade." }, 403);
      }
      unidadeId = actorProfile.unidade_id;
    } else if (perfil === "gestor_central" || perfil === "gestor") {
      unidadeId = null;
    } else {
      if (!unidadeCodigo) return json({ ok: false, error: "Selecione uma unidade válida." }, 400);
      const { data: unit, error: unitError } = await admin.from("unidades").select("id,codigo").eq("codigo", unidadeCodigo).eq("ativa", true).maybeSingle();
      if (unitError || !unit) return json({ ok: false, error: "Unidade não encontrada ou inativa. Atualize a lista e selecione uma unidade ativa." }, 400);
      unidadeId = unit.id;
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nome },
    });
    if (createError || !created.user) {
      return json({ ok: false, error: /already|registered|exists/i.test(createError?.message ?? "")
        ? "Este e-mail já está cadastrado." : "Não foi possível criar a conta." }, 400);
    }
    const { error: linkError } = await admin.from("usuarios_unidades").insert({
      user_id: created.user.id, unidade_id: unidadeId, perfil, ativo: true,
    });
    if (linkError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ ok: false, error: "A conta não foi vinculada à unidade; a criação foi cancelada." }, 500);
    }
    return json({ ok: true, user: { user_id: created.user.id, email, nome, unidade_id: unidadeId, perfil, ativo: true } }, 201);
  }

  if (action === "update") {
    const userId = String(body.user_id ?? "");
    const nome = typeof body.nome === "string" ? body.nome.trim() : undefined;
    const password = typeof body.password === "string" ? body.password : "";
    const perfil = typeof body.perfil === "string" ? body.perfil : undefined;
    const ativo = typeof body.ativo === "boolean" ? body.ativo : undefined;
    const unidadeCodigo = typeof body.unidade_codigo === "string" ? body.unidade_codigo : undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ ok: false, error: "Usuário inválido." }, 400);
    if (userId === actor.id && (ativo === false || (perfil && perfil !== "gestor_central"))) return json({ ok: false, error: "Não é permitido remover seu próprio acesso de Gestor Geral." }, 400);
    if (nome !== undefined && (!nome || nome.length > 120)) return json({ ok: false, error: "Nome inválido." }, 400);
    if (password && (password.length < 8 || password.length > 128)) return json({ ok: false, error: "A senha deve ter entre 8 e 128 caracteres." }, 400);
    if (perfil && !["admin_unidade", "tecnico", "visualizador", "gestor", "gestor_central"].includes(perfil)) return json({ ok: false, error: "Perfil inválido." }, 400);
    if (perfil === "gestor_central" && !isPrimary) return json({ ok: false, error: "Somente o administrador principal pode conceder o perfil Gestor Geral." }, 403);
    if (perfil === "gestor" && !isPrimary) return json({ ok: false, error: "Somente a conta principal pode conceder o perfil Gestor." }, 403);

    const { data: targetProfile, error: targetError } = await admin.from("usuarios_unidades")
      .select("user_id,perfil").eq("user_id", userId).maybeSingle();
    if (targetError || !targetProfile) return json({ ok: false, error: "Usuário não encontrado." }, 404);
    if (targetProfile.perfil === "gestor_central" && !isPrimary && (perfil || ativo === false)) return json({ ok: false, error: "Somente o administrador principal pode alterar Gestores Gerais." }, 403);

    const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
    const authUpdate: Record<string, unknown> = {};
    if (nome !== undefined) authUpdate.user_metadata = { ...(targetAuth.user?.user_metadata ?? {}), nome };
    if (password) authUpdate.password = password;
    if (Object.keys(authUpdate).length) {
      const { error } = await admin.auth.admin.updateUserById(userId, authUpdate);
      if (error) return json({ ok: false, error: "Não foi possível atualizar a conta." }, 500);
    }
    const patch: Record<string, unknown> = {};
    if (perfil) patch.perfil = perfil;
    if (ativo !== undefined) patch.ativo = ativo;
    if (perfil === "gestor_central" || perfil === "gestor") patch.unidade_id = null;
    else if (unidadeCodigo) {
      if (!unidadeCodigo) return json({ ok: false, error: "Unidade inválida." }, 400);
      const { data: unit, error: unitError } = await admin.from("unidades").select("id,codigo").eq("codigo", unidadeCodigo).eq("ativa", true).maybeSingle();
      if (unitError || !unit) return json({ ok: false, error: "Unidade não encontrada ou inativa. Atualize a lista e selecione uma unidade ativa." }, 400);
      patch.unidade_id = unit.id;
    } else if (perfil && perfil !== "gestor_central") {
      return json({ ok: false, error: "Informe a unidade para esse perfil." }, 400);
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("usuarios_unidades").update(patch).eq("user_id", userId);
      if (error) return json({ ok: false, error: "Não foi possível salvar o vínculo do usuário." }, 500);
    }
    return json({ ok: true });
  }

  if (action === "delete") {
    const userId = String(body.user_id ?? "");
    if (!isPrimary) return json({ ok: false, error: "Somente o administrador principal pode excluir usuários." }, 403);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ ok: false, error: "Usuário inválido." }, 400);
    if (userId === actor.id) return json({ ok: false, error: "Não é permitido excluir sua própria conta." }, 400);
    const { data: target } = await admin.from("usuarios_unidades").select("perfil").eq("user_id", userId).maybeSingle();
    if (target?.perfil === "gestor_central" && !isPrimary) return json({ ok: false, error: "Somente o administrador principal pode excluir Gestores Gerais." }, 403);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ ok: false, error: "Não foi possível excluir o usuário." }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Ação inválida." }, 400);
});