import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateUserBody = {
  nome?: string;
  email?: string;
  password?: string;
  adminAccess?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Variáveis Supabase obrigatórias não configuradas.");
      return json({ error: "Serviço de autenticação não configurado." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: manager }, error: userError } = await userClient.auth.getUser();
    if (userError || !manager) {
      return json({ error: "Sessão do gestor inválida ou expirada." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: role, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", manager.id)
      .maybeSingle();

    if (roleError || role?.role !== "gestor") {
      return json({ error: "Somente gestores podem cadastrar usuários." }, 403);
    }

    const body = (await req.json()) as CreateUserBody;
    const nome = String(body.nome ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const adminAccess = Boolean(body.adminAccess);

    if (!nome || !email || password.length < 8) {
      return json({ error: "Nome, e-mail e senha válida são obrigatórios." }, 400);
    }

    const managerEmail = String(manager.email ?? "").trim().toLowerCase();
    const ownerEmail = "faber.alexsandro2011@gmail.com";
    if (adminAccess && managerEmail !== ownerEmail) {
      return json({ error: "Somente o administrador principal pode cadastrar outro administrador." }, 403);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError || !created.user) {
      const message = createError?.message ?? "Não foi possível criar a conta.";
      return json({
        error: message.toLowerCase().includes("already") || message.toLowerCase().includes("registered")
          ? "Este e-mail já possui uma conta."
          : message,
      }, 400);
    }

    const newUser = created.user;

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({ id: newUser.id, email, nome }, { onConflict: "id" });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUser.id);
      return json({ error: "A conta foi criada, mas não foi possível criar o perfil." }, 500);
    }

    const { error: roleUpsertError } = await adminClient
      .from("user_roles")
      .upsert(
        {
          id: crypto.randomUUID(),
          user_id: newUser.id,
          role: adminAccess ? "gestor" : "tecnico",
        },
        { onConflict: "user_id" },
      );

    if (roleUpsertError) {
      await adminClient.auth.admin.deleteUser(newUser.id);
      return json({ error: "A conta foi criada, mas não foi possível definir a função." }, 500);
    }

    return json({
      user: {
        id: newUser.id,
        email,
        nome,
        role: adminAccess ? "gestor" : "tecnico",
      },
    }, 200);
  } catch (error) {
    console.error("create-user error:", error);
    return json({ error: "Erro inesperado ao cadastrar usuário." }, 500);
  }
});
