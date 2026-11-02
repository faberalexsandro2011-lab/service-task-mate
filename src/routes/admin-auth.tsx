import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";

function createControlAuthClient() {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SAAS_CONTROL_SUPABASE_URL;
  const key = env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export const Route = createFileRoute("/admin-auth")({
  head: () => ({
    meta: [
      { title: "Ativação do administrador — Central OS SaaS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminAuthCallback,
});

function AdminAuthCallback() {
  const client = useMemo(() => createControlAuthClient(), []);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "saved">("loading");
  const [message, setMessage] = useState("Validando o convite...");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function validateInvite() {
      if (!client) {
        setStatus("error");
        setMessage("A conexão isolada do SaaS ainda não foi configurada neste ambiente. Nenhuma conexão operacional foi utilizada.");
        return;
      }

      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");

      let authError: Error | null = null;

      if (tokenHash && (type === "invite" || type === "recovery" || type === "email" || type === "magiclink")) {
        const { error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "invite" | "recovery" | "email" | "magiclink",
        });
        authError = error;
      } else if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        authError = error;
      } else {
        const { data } = await client.auth.getSession();
        if (!data.session) {
          authError = new Error("O link não contém um código de convite válido ou expirou.");
        }
      }

      if (authError) {
        if (active) {
          setStatus("error");
          setMessage("Não foi possível validar o convite. Solicite um novo convite ao administrador da plataforma.");
        }
        return;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      const userEmail = userData.user?.email?.toLowerCase() ?? "";

      if (userError || userEmail !== ADMIN_EMAIL) {
        await client.auth.signOut();
        if (active) {
          setStatus("error");
          setMessage("Este convite não pertence à identidade de administrador autorizada.");
        }
        return;
      }

      if (active) {
        setEmail(userEmail);
        setStatus("ready");
        setMessage("Convite validado. Defina uma senha forte para concluir a ativação.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    void validateInvite();
    return () => {
      active = false;
    };
  }, [client]);

  async function requestActivationLink() {
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email: ADMIN_EMAIL,
      options: {
        emailRedirectTo: `${window.location.origin}/admin-auth`,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    setMessage(error
      ? "Não foi possível enviar o link. Confira a configuração de e-mail do projeto isolado."
      : "Link de ativação enviado. Abra o e-mail mais recente e use o link uma única vez.");
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;

    if (password.length < 12) {
      setMessage("Use uma senha com pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não conferem.");
      return;
    }

    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage("Não foi possível salvar a senha. Confira os requisitos e tente novamente.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setStatus("saved");
    setMessage("Senha definida. O próximo passo será ativar e exigir o MFA do administrador.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {status === "saved" ? <ShieldCheck className="size-6" /> : <KeyRound className="size-6" />}
        </div>
        <p className="text-sm font-semibold text-primary">Central OS · Administração SaaS</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Ativação do administrador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acesso restrito à identidade administrativa previamente autorizada.
        </p>

        {status === "loading" && (
          <p role="status" className="mt-6 rounded-md bg-muted p-3 text-sm">{message}</p>
        )}

        {status === "error" && (
          <div className="mt-6 grid gap-3">
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {message}
            </div>
            <Button type="button" disabled={busy} onClick={requestActivationLink} className="w-full">
              {busy ? "Enviando..." : "Enviar link de ativação"}
            </Button>
            <p className="text-xs text-muted-foreground">O link será enviado somente para a identidade administrativa autorizada e retornará a esta página.</p>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={savePassword} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="admin-email">E-mail autorizado</Label>
              <Input id="admin-email" value={email} readOnly />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-password">Nova senha</Label>
              <Input id="admin-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-password-confirm">Confirmar senha</Label>
              <Input id="admin-password-confirm" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Use pelo menos 12 caracteres. Não compartilhe sua senha ou códigos de autenticação.</p>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Salvando..." : "Definir senha"}</Button>
            <p role="status" className="text-sm text-muted-foreground">{message}</p>
          </form>
        )}

        {status === "saved" && (
          <div className="mt-6 rounded-md border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Senha cadastrada com sucesso.</p>
            <p className="mt-1 text-muted-foreground">{message}</p>
          </div>
        )}

        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Ambiente isolado de testes. Esta página não acessa bancos de empresas clientes nem o Central OS operacional.
        </p>
      </section>
    </main>
  );
}
