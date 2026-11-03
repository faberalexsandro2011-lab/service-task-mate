import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  Building2,
  CircleAlert,
  Search,
  ShieldCheck,
  Users,
  Layers3,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [search, setSearch] = useState("");
  const client = useMemo(() => createSaasAuthClient(), []);

  async function signOut() {
    await client?.auth.signOut();
    window.location.assign("/admin-login");
  }

  const modules = [
    { label: "Empresas", detail: "Cadastro e situação das empresas clientes", icon: Building2, active: true },
    { label: "Planos", detail: "Recursos e limites de cada plano", icon: Layers3, active: false },
    { label: "Assinaturas", detail: "Vigência, vencimentos e situação comercial", icon: CreditCard, active: false },
    { label: "Instâncias", detail: "Ambientes e conexões isoladas por empresa", icon: Users, active: false },
  ];

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div>
            <p className="text-sm font-semibold text-primary">Central OS · Plataforma SaaS</p>
            <h1 className="mt-1 text-3xl font-bold">Painel administrativo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gestão central da plataforma, separada dos ambientes operacionais.</p>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>Sair</Button>
        </header>

        <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <p className="font-medium">Sessão administrativa protegida</p>
            <p className="text-sm text-muted-foreground">Identidade autorizada validada com nível de segurança AAL2.</p>
          </div>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(({ label, detail, icon: Icon, active }) => (
            <article key={label} className={`rounded-xl border bg-card p-4 ${active ? "border-primary/40" : "opacity-65"}`}>
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-primary" />
                {active ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Em preparação</span> : <span className="text-xs text-muted-foreground">Etapa futura</span>}
              </div>
              <h2 className="mt-3 font-semibold">{label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>

        <section className="mt-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-xl font-semibold">Empresas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cadastro, consulta e controle de situação das empresas clientes.</p>
            </div>
            <Button disabled title="Aguardando liberação segura do banco de controle">
              <Building2 className="mr-2 size-4" /> Nova empresa
            </Button>
          </div>

          <div className="p-5">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, CNPJ ou identificador" className="pl-9" disabled />
            </label>

            <div className="mt-5 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Acesso ao banco ainda bloqueado por segurança</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A tabela de empresas já existe no projeto SaaS descartável, mas as políticas de acesso administrativo ainda não foram aplicadas. Por isso, consulta e cadastro permanecem desativados. Nenhuma empresa real ou dado operacional foi carregado.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-dashed p-8 text-center">
              <Building2 className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhuma empresa carregada</p>
              <p className="mt-1 text-sm text-muted-foreground">A listagem será habilitada após a validação das permissões no banco de controle.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
