import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

function createSaasAuthClient() {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SAAS_CONTROL_SUPABASE_URL;
  const key = env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}

export const Route = createFileRoute("/saas-admin")({
  ssr: false,
  beforeLoad: async () => {
    const client = createSaasAuthClient();
    if (!client) throw redirect({ to: "/admin-login" });
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.email?.toLowerCase() !== "faber.alexsandro2011@gmail.com") {
      await client.auth.signOut();
      throw redirect({ to: "/admin-login" });
    }
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") throw redirect({ to: "/admin-login" });
  },
  component: SaasAdminHome,
});

function SaasAdminHome() {
  async function signOut() {
    const client = createSaasAuthClient();
    await client?.auth.signOut();
    window.location.assign("/admin-login");
  }
  return <main className="min-h-screen bg-background p-6 sm:p-10">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div><p className="text-sm font-semibold text-primary">Central OS · Plataforma SaaS</p><h1 className="mt-1 text-3xl font-bold">Painel administrativo</h1></div>
        <Button variant="outline" onClick={() => void signOut()}>Sair</Button>
      </header>
      <section className="mt-8 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-primary" /><h2 className="text-lg font-semibold">Acesso protegido por MFA</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">A sessão administrativa foi validada com nível AAL2. Esta é a área reservada da plataforma SaaS.</p>
        <p className="mt-4 text-sm">O painel de empresas, planos, assinaturas e instâncias será implementado nas próximas etapas. Nenhum dado operacional de clientes é exibido aqui.</p>
      </section>
    </div>
  </main>;
}
