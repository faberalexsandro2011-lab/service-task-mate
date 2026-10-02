```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CreateUserBody = {
  nome?: string;
  email?: string;
  password?: string;
  adminAccess?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  const json = (
    body: Record<string, unknown>,
    status = 200,
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json(
        {
          error: "Não autenticado.",
        },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error(
        "Variáveis Supabase obrigatórias não configuradas.",
      );

      return json(
        {
          error:
            "Serviço de autenticação não configurado.",
        },
        500,
      );
    }

    // Cliente usando a sessão do gestor
    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user: manager },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !manager) {
      console.error(
        "Erro ao identificar gestor:",
        userError,
      );

      return json(
        {
          error:
            "Sessão do gestor inválida ou expirada.",
        },
        401,
      );
    }

    // Cliente administrativo
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Verificar se o usuário é gestor
    const {
      data: role,
      error: roleError,
    } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", manager.id)
      .maybeSingle();

    if (roleError) {
      console.error(
        "Erro ao consultar função:",
        roleError,
      );

      return json(
        {
          error:
            "Não foi possível verificar a função do usuário: " +
            roleError.message,
        },
        500,
      );
    }

    if (role?.role !== "gestor") {
      return json(
        {
          error:
            "Somente gestores podem cadastrar usuários.",
        },
        403,
      );
    }

    // Ler dados enviados
    let body: CreateUserBody;

    try {
      body = (await req.json()) as CreateUserBody;
    } catch {
      return json(
        {
          error: "Dados enviados em formato inválido.",
        },
        400,
      );
    }

    const nome = String(body.nome ?? "").trim();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const password = String(body.password ?? "");

    const adminAccess = Boolean(body.adminAccess);

    // Validação
    if (!nome) {
      return json(
        {
          error: "Informe o nome do usuário.",
        },
        400,
      );
    }

    if (!email) {
      return json(
        {
          error: "Informe o e-mail do usuário.",
        },
        400,
      );
    }

    if (password.length < 8) {
      return json(
        {
          error:
            "A senha precisa ter pelo menos 8 caracteres.",
        },
        400,
      );
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return json(
        {
          error: "Informe um e-mail válido.",
        },
        400,
      );
    }

    // Somente o administrador principal pode criar outro gestor
    const managerEmail = String(
      manager.email ?? "",
    )
      .trim()
      .toLowerCase();

    const ownerEmail =
      "faber.alexsandro2011@gmail.com";

    if (
      adminAccess &&
      managerEmail !== ownerEmail
    ) {
      return json(
        {
          error:
            "Somente o administrador principal pode cadastrar outro administrador.",
        },
        403,
      );
    }

    const targetRole = adminAccess
      ? "gestor"
      : "tecnico";

    // =====================================================
    // CRIAR USUÁRIO
    // =====================================================

    const {
      data: created,
      error: createError,
    } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome,
          role: targetRole,
        },
      });

    let newUser = created?.user ?? null;

    // =====================================================
    // SE HOUVE ERRO AO CRIAR
    // =====================================================

    if (createError || !newUser) {
      const message =
        createError?.message ??
        "Não foi possível criar a conta.";

      console.error(
        "Erro retornado pelo Auth:",
        message,
      );

      // Verificar se realmente é duplicidade
      const duplicateError =
        /already|registered|exists|já.*conta|já.*cadastr/i.test(
          message,
        );

      if (!duplicateError) {
        return json(
          {
            error: message,
          },
          400,
        );
      }

      // ===================================================
      // PROCURAR USUÁRIO EXISTENTE
      // ===================================================

      const {
        data: usersPage,
        error: listError,
      } =
        await adminClient.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

      if (listError) {
        console.error(
          "Erro ao procurar usuário:",
          listError,
        );

        return json(
          {
            error:
              "O Supabase informou que o e-mail já existe, mas não foi possível verificar a conta: " +
              listError.message,
          },
          400,
        );
      }

      const existingUser =
        usersPage?.users?.find(
          (user) =>
            String(user.email ?? "")
              .trim()
              .toLowerCase() === email,
        );

      if (!existingUser) {
        return json(
          {
            error:
              "O Supabase informou que o e-mail já existe, mas a conta não foi localizada. Verifique o e-mail informado.",
          },
          400,
        );
      }

      // ===================================================
      // ATUALIZAR CONTA EXISTENTE
      // ===================================================

      const {
        data: updated,
        error: updateError,
      } =
        await adminClient.auth.admin.updateUserById(
          existingUser.id,
          {
            password,
            email_confirm: true,
            user_metadata: {
              nome,
              role: targetRole,
            },
          },
        );

      if (updateError || !updated.user) {
        console.error(
          "Erro ao atualizar usuário:",
          updateError,
        );

        return json(
          {
            error:
              "A conta já existe, mas não foi possível atualizar o acesso: " +
              (updateError?.message ??
                "erro desconhecido"),
          },
          400,
        );
      }

      newUser = updated.user;
    }

    // =====================================================
    // GARANTIR USUÁRIO
    // =====================================================

    if (!newUser) {
      return json(
        {
          error:
            "Não foi possível obter o usuário.",
        },
        500,
      );
    }

    // =====================================================
    // PROFILE
    // =====================================================

    const {
      error: profileError,
    } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          email,
          nome,
        },
        {
          onConflict: "id",
        },
      );

    if (profileError) {
      console.error(
        "Erro no profile:",
        profileError,
      );

      // Só apagar se foi uma conta nova
      if (created?.user?.id) {
        await adminClient.auth.admin.deleteUser(
          newUser.id,
        );
      }

      return json(
        {
          error:
            "A conta foi criada, mas não foi possível criar o perfil: " +
            profileError.message,
        },
        500,
      );
    }

    // =====================================================
    // VERIFICAR ROLE
    // =====================================================

    const {
      data: existingRole,
      error: roleReadError,
    } =
      await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("user_id", newUser.id)
        .maybeSingle();

    if (roleReadError) {
      console.error(
        "Erro ao consultar user_roles:",
        roleReadError,
      );

      if (created?.user?.id) {
        await adminClient.auth.admin.deleteUser(
          newUser.id,
        );
      }

      return json(
        {
          error:
            "A conta foi criada, mas não foi possível verificar a função: " +
            roleReadError.message,
        },
        500,
      );
    }

    // =====================================================
    // ATUALIZAR ROLE
    // =====================================================

    if (existingRole) {
      const {
        error: roleUpdateError,
      } =
        await adminClient
          .from("user_roles")
          .update({
            role: targetRole,
          })
          .eq("user_id", newUser.id);

      if (roleUpdateError) {
        console.error(
          "Erro ao atualizar função:",
          roleUpdateError,
        );

        if (created?.user?.id) {
          await adminClient.auth.admin.deleteUser(
            newUser.id,
          );
        }

        return json(
          {
            error:
              "A conta foi criada, mas não foi possível definir a função: " +
              roleUpdateError.message,
          },
          500,
        );
      }
    } else {
      // ===================================================
      // CRIAR ROLE
      // ===================================================

      const {
        error: roleInsertError,
      } =
        await adminClient
          .from("user_roles")
          .insert({
            id: crypto.randomUUID(),
            user_id: newUser.id,
            role: targetRole,
          });

      if (roleInsertError) {
        console.error(
          "Erro ao inserir função:",
          roleInsertError,
        );

        if (created?.user?.id) {
          await adminClient.auth.admin.deleteUser(
            newUser.id,
          );
        }

        return json(
          {
            error:
              "A conta foi criada, mas não foi possível definir a função: " +
              roleInsertError.message,
          },
          500,
        );
      }
    }

    // =====================================================
    // SUCESSO
    // =====================================================

    return json(
      {
        success: true,
        message: created?.user
          ? "Usuário criado com sucesso."
          : "Usuário existente atualizado com sucesso.",
        user: {
          id: newUser.id,
          email,
          nome,
          role: targetRole,
        },
      },
      200,
    );
  } catch (error) {
    console.error(
      "create-user error:",
      error,
    );

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao cadastrar usuário.",
      },
      500,
    );
  }
});
```
