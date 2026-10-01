import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
    const role = roleRow?.role ?? "tecnico";
    if (role === "tecnico" && !location.pathname.endsWith("/tecnico")) throw redirect({ to: "/tecnico", replace: true });
    if (role === "gestor" && location.pathname.endsWith("/tecnico")) throw redirect({ to: "/dashboard", replace: true });
    return { user: data.user, role };
  },
  component: () => <Outlet />,
});
