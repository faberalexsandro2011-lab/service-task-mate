import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getOfflineRole, saveOfflineRole } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/" });

    let role: "gestor" | "tecnico" = "tecnico";
    if (navigator.onLine) {
      // Use the SECURITY DEFINER helper so the role check is not blocked by
      // RLS on user_roles. This is important for fresh Supabase projects.
      const { data: isManager, error: managerRoleError } = await supabase.rpc("has_role", {
        _user_id: data.session.user.id,
        _role: "gestor",
      });

      if (!managerRoleError && isManager === true) {
        role = "gestor";
      } else {
        const { data: roleRow, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .maybeSingle();

        if (!roleError && roleRow?.role === "gestor") {
          role = "gestor";
        } else {
          role = "tecnico";
        }
      }

      await saveOfflineRole(role);
    } else {
      role = (await getOfflineRole<"gestor" | "tecnico">()) ?? "tecnico";
    }
    const isTechnicianArea = location.pathname.endsWith("/tecnico");
    const isRequestArea = location.pathname.endsWith("/solicitacoes");

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
