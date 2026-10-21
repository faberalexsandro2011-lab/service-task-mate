import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getOfflineRole, saveOfflineRole } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/" });

    let role: "gestor" | "admin_unidade" | "tecnico" | "visualizador" = "tecnico";
    if (navigator.onLine) {
      const userId = data.session.user.id;
      const { data: isManager, error: managerRoleError } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "gestor",
      });

      if (!managerRoleError && isManager === true) {
        role = "gestor";
      } else {
        const { data: isViewer } = await supabase.rpc("has_role", { _user_id: userId, _role: "visualizador" });
        if (isViewer === true) {
          role = "visualizador";
        } else {
          // The isolated multi-unit test project uses usuarios_unidades instead
          // of the production user_roles table. This check is intentionally
          // scoped to the test project's authenticated session.
          const { data: centralProfile } = await supabase
            .from("usuarios_unidades")
            .select("perfil")
            .eq("user_id", userId)
            .eq("ativo", true)
            .eq("perfil", "gestor_central")
            .maybeSingle();

          if (centralProfile?.perfil === "gestor_central") {
            role = "gestor";
          } else {
            const { data: unitProfile } = await supabase
              .from("usuarios_unidades")
              .select("perfil")
              .eq("user_id", userId)
              .eq("ativo", true)
              .in("perfil", ["admin_unidade", "tecnico", "visualizador"])
              .maybeSingle();

            if (unitProfile?.perfil === "admin_unidade") {
              role = "admin_unidade";
            } else if (unitProfile?.perfil === "visualizador") {
              role = "visualizador";
            } else if (unitProfile?.perfil === "tecnico") {
              role = "tecnico";
            } else {
              const { data: roleRow, error: roleError } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", userId)
                .maybeSingle();

              role = !roleError && roleRow?.role === "gestor" ? "gestor" : "tecnico";
            }
          }
        }
      }

      await saveOfflineRole(role);
    } else {
      role = (await getOfflineRole<"gestor" | "admin_unidade" | "tecnico" | "visualizador">()) ?? "tecnico";
    }

    const isTechnicianArea = location.pathname.endsWith("/tecnico");
    const isRequestArea = location.pathname.endsWith("/solicitacoes");
    const isViewerArea = location.pathname.endsWith("/visualizacao");

    const isTestPanel = location.pathname.endsWith("/painel-teste");
    if (role === "admin_unidade" && !isTestPanel) throw redirect({ to: "/painel-teste", replace: true });
    if (role === "visualizador" && !isViewerArea) throw redirect({ to: "/visualizacao", replace: true });
    if (role !== "visualizador" && isViewerArea) throw redirect({ to: role === "gestor" ? "/dashboard" : role === "admin_unidade" ? "/painel-teste" : "/tecnico", replace: true });

    if (role === "tecnico" && !isTechnicianArea && !isRequestArea) {
      throw redirect({ to: "/tecnico", replace: true });
    }

    if (role === "gestor" && isTechnicianArea) {
      throw redirect({ to: "/dashboard", replace: true });
    }
    return { user: data.session.user, role };
  },
  component: () => (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-muted/20 px-4 py-3 text-center text-xs text-muted-foreground">
        Desenvolvido por: <span className="font-semibold text-foreground">ALEX FABER</span>
      </footer>
    </div>
  ),
});
