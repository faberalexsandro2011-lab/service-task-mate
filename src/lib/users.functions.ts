import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Cadastro de técnicos/gestores pelo Painel Central. Só gestores podem usar.
export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        nome: z.string().trim().min(1, "Informe o nome do usuário.").max(120),
        email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
        password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(128),
        adminAccess: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isGestor, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (roleErr) return { ok: false as const, error: "Não foi possível verificar a sua função." };
    if (!isGestor) return { ok: false as const, error: "Somente gestores podem cadastrar usuários." }

    const ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";
    const actorEmail = String(context.claims?.email ?? "").trim().toLowerCase();
    if (data.adminAccess && actorEmail !== ADMIN_EMAIL) {
      return { ok: false as const, error: "Somente o administrador principal pode cadastrar gestores." };
    }

    const role = data.adminAccess ? "gestor" : "tecnico";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    let createdNew = false;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (created?.user) {
      userId = created.user.id;
      createdNew = true;
    } else {
      const msg = createErr?.message ?? "";
      if (!/already|registered|exists/i.test(msg)) {
        return { ok: false as const, error: msg || "Não foi possível criar a conta." };
      }
      const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", data.email).maybeSingle();
      if (!prof) return { ok: false as const, error: "Este e-mail já tem conta, mas não foi localizada." };
      userId = prof.id;
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: data.nome },
      });
      if (upErr) return { ok: false as const, error: upErr.message };
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email: data.email, nome: data.nome }, { onConflict: "id" });
    if (profErr) return { ok: false as const, error: "Erro ao gravar o perfil: " + profErr.message };

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
    if (rErr) return { ok: false as const, error: "Erro ao definir a função: " + rErr.message };

    return { ok: true as const, createdNew, user: { id: userId, email: data.email, nome: data.nome, role } };
  });


// Edição de técnico pelo administrador principal: permite alterar nome e/ou senha.
export const updateTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      userId: z.string().uuid("Usuário inválido."),
      nome: z.string().trim().min(1, "Informe o nome do usuário.").max(120),
      password: z.string().max(128).optional().default(""),
      role: z.enum(["gestor", "tecnico"]).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isGestor, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (roleErr) return { ok: false as const, error: "Não foi possível verificar a sua função." };
    if (!isGestor) return { ok: false as const, error: "Somente gestores podem editar usuários." };
    if (data.userId === context.userId) {
      return { ok: false as const, error: "Você não pode editar a própria conta por esta função." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (targetError || !target.user) {
      return { ok: false as const, error: targetError?.message || "Usuário não encontrado." };
    }
    const password = data.password.trim();
    if (password && password.length < 8) {
      return { ok: false as const, error: "A senha precisa ter pelo menos 8 caracteres." };
    }

    const updatePayload: { user_metadata: { nome: string }; password?: string } = {
      user_metadata: { nome: data.nome },
    };
    if (password) updatePayload.password = password;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, updatePayload);
    if (authError) return { ok: false as const, error: authError.message || "Não foi possível atualizar o usuário." };

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ nome: data.nome })
      .eq("id", data.userId);
    if (profileError) return { ok: false as const, error: "Não foi possível atualizar o perfil: " + profileError.message };

    if (data.role) {
      const ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";
      const actorEmail = String(context.claims?.email ?? "").trim().toLowerCase();
      if (actorEmail !== ADMIN_EMAIL) {
        return { ok: false as const, error: "Somente o administrador principal pode alterar funções." };
      }
      if (data.userId === context.userId) {
        return { ok: false as const, error: "O administrador principal não pode alterar a própria função." };
      }
      const { error: roleDeleteError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      if (roleDeleteError) return { ok: false as const, error: "Não foi possível atualizar a função: " + roleDeleteError.message };
      const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (roleInsertError) return { ok: false as const, error: "Não foi possível definir a função: " + roleInsertError.message };
    }

    return { ok: true as const };
  });


// Exclusão definitiva de um usuário do sistema. Somente o administrador principal pode executar.
export const deleteTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      userId: z.string().uuid("Usuário inválido."),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isGestor, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (roleErr) return { ok: false as const, error: "Não foi possível verificar a sua função." };
    if (!isGestor) return { ok: false as const, error: "Somente gestores podem excluir usuários." };
    if (data.userId === context.userId) {
      return { ok: false as const, error: "Você não pode excluir a própria conta." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (targetError || !target.user) {
      return { ok: false as const, error: targetError?.message || "Usuário não encontrado." };
    }
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) {
      return { ok: false as const, error: deleteError.message || "Não foi possível excluir o usuário." };
    }

    return { ok: true as const };
  });
