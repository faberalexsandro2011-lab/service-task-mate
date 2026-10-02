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
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id).maybeSingle();
      role = roleRow?.role ?? "tecnico";
      await saveOfflineRole(role);
    } else {
      role = (await getOfflineRole<"gestor" | "tecnico">()) ?? "tecnico";
    }
    if (role === "tecnico" && !location.pathname.endsWith("/tecnico")) throw redirect({ to: "/tecnico", replace: true });
    if (role === "gestor" && location.pathname.endsWith("/tecnico")) throw redirect({ to: "/dashboard", replace: true });
    return { user: data.session.user, role };
  },
  component: () => <Outlet />,
});
