import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Wrench, Tractor, Wheat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrada — Central OS" },
      { name: "description", content: "Acesso seguro à gestão de ordens de serviço." },
      { property: "og:title", content: "Entrada — Central OS" },
      { property: "og:description", content: "Acesso seguro à gestão de ordens de serviço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const login = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    // Permite entrar tanto pelo e-mail quanto pelo nome de usuário/cadastrado.
    // O campo "nome" do perfil é resolvido para o e-mail real da autenticação.
    let email = login;
    if (!login.includes("@")) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, nome")
        .ilike("nome", login)
        .maybeSingle();

      if (profileError) {
        console.error("[Login] Não foi possível localizar o usuário:", profileError);
      }
      if (profile?.email) {
        email = profile.email.trim();
      } else {
        setBusy(false);
        setError("Usuário não encontrado. Confira o nome de usuário ou use o e-mail cadastrado.");
        return;
      }
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signInError) {
      console.error("[Login] Supabase signInWithPassword:", signInError);
      const message = signInError.message?.toLowerCase() ?? "";
      if (message.includes("invalid login credentials") || message.includes("invalid email or password")) {
        setError("Usuário/e-mail ou palavra-passe incorretos. Confirme os dados da conta do sistema.");
      } else if (message.includes("email not confirmed")) {
        setError("O e-mail desta conta ainda não foi confirmado.");
      } else if (message.includes("rate limit")) {
        setError("Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.");
      } else {
        setError("Não foi possível entrar. Tente novamente ou contacte o gestor.");
      }
      return;
    }
    await navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-10 [background-image:linear-gradient(var(--primary-foreground)_1px,transparent_1px),linear-gradient(90deg,var(--primary-foreground)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative flex items-center gap-3"><div className="grid size-10 place-items-center rounded-md bg-primary-foreground text-primary"><Wrench className="size-5" /></div><div><div className="font-bold">Central OS</div><div className="text-xs opacity-70">Gestão operacional</div></div></div>
        <div className="relative max-w-xl pb-12"><div className="mb-6 flex items-center gap-3 text-[var(--agri-wheat)]"><Tractor className="size-9" /><Wheat className="size-8" /><span className="text-sm font-semibold uppercase tracking-widest">Operação no campo</span></div><p className="text-sm font-semibold uppercase opacity-70">Operações organizadas</p><h1 className="mt-4 text-5xl font-bold leading-tight tracking-normal">Cada ordem.<br />Sempre acompanhada.</h1><p className="mt-6 max-w-md text-base leading-7 opacity-75">Distribua, acompanhe e conclua o trabalho da sua equipa num único lugar.</p></div>
        <div className="relative flex items-center gap-2 text-xs opacity-70"><Wheat className="size-3.5" /> Campo, oficina e equipa conectados em tempo real</div>
      </section>
      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground"><Wrench className="size-5" /></div><div><div className="font-bold">Central OS</div><div className="text-xs text-muted-foreground">Gestão operacional</div></div></div>
          <div className="mb-8"><p className="text-sm font-medium text-primary">Bem-vindo</p><h2 className="mt-2 text-3xl font-bold tracking-normal">Entre na sua conta</h2><p className="mt-2 text-sm text-muted-foreground">Use os dados fornecidos pela sua organização.</p></div>
          {/* method="post" keeps credentials out of the URL if submitted before hydration; button stays disabled until hydrated */}
          <form action="/" method="post" onSubmit={signIn} className="grid gap-5" aria-busy={busy}>
            <div className="grid gap-1.5"><Label htmlFor="email">Usuário ou e-mail</Label><Input id="email" name="email" type="text" autoComplete="username" required placeholder="Nome do usuário ou nome@empresa.com" className="h-11" /></div>
            <div className="grid gap-1.5"><Label htmlFor="password">Palavra-passe</Label><div className="relative"><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 pr-11" /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 size-9" title={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>
            {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
            <Button type="submit" size="lg" disabled={busy || !hydrated} className="h-11 w-full" aria-disabled={busy || !hydrated}>{busy ? "A entrar..." : !hydrated ? "A carregar..." : <>Entrar <ArrowRight /></>}</Button>
          </form>
          <p className="mt-8 text-center text-xs text-muted-foreground">Problemas no acesso? Contacte o gestor do sistema.</p>
        </div>
      </main>
    </div>
  );
}
