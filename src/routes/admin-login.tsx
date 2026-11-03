import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";

function createSaasAuthClient() {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SAAS_CONTROL_SUPABASE_URL;
  const key = env.VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}

export const Route = createFileRoute("/admin-login")({
  head: () => ({ meta: [{ title: "Acesso administrativo — Central OS SaaS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const client = useMemo(() => createSaasAuthClient(), []);
  const navigate = useNavigate();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [stage, setStage] = useState<"credentials" | "mfa">("credentials");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) { setMessage("Conexão isolada do SaaS não configurada neste preview."); return; }
    setBusy(true); setMessage("");
    const result = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (result.error || result.data.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      await client.auth.signOut();
      setBusy(false); setMessage("Não foi possível autenticar a identidade administrativa autorizada."); return;
    }
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) {
      await client.auth.signOut(); setBusy(false); setMessage("Não foi possível validar o nível de segurança da sessão."); return;
    }
    if (assurance.data.currentLevel === "aal2") {
      setBusy(false); await navigate({ to: "/saas-admin", replace: true }); return;
    }
    const factors = await client.auth.mfa.listFactors();
    const verified = factors.data?.totp?.find((factor) => factor.status === "verified");
    if (factors.error || !verified) {
      await client.auth.signOut(); setBusy(false);
      setMessage("Não há um autenticador TOTP verificado nesta conta. Acesso ao painel bloqueado.");
      return;
    }
    const challenge = await client.auth.mfa.challenge({ factorId: verified.id });
    if (challenge.error) {
      await client.auth.signOut(); setBusy(false); setMessage("Não foi possível iniciar o desafio MFA. Tente novamente."); return;
    }
    setFactorId(verified.id); setChallengeId(challenge.data.id); setStage("mfa"); setBusy(false);
    setMessage("Informe o código atual do aplicativo autenticador.");
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !factorId || !challengeId || !/^\d{6,8}$/.test(code)) {
      setMessage("Informe o código numérico de verificação."); return;
    }
    setBusy(true); setMessage("");
    const verified = await client.auth.mfa.verify({ factorId, challengeId, code });
    const assurance = verified.error ? null : await client.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (verified.error || assurance?.data.currentLevel !== "aal2") {
      setCode(""); setMessage("Código inválido ou expirado. Confira o aplicativo e tente novamente."); return;
    }
    setCode("");
    await navigate({ to: "/saas-admin", replace: true });
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{stage === "mfa" ? <ShieldCheck className="size-6" /> : <KeyRound className="size-6" />}</div>
      <p className="text-sm font-semibold text-primary">Central OS · Administração SaaS</p>
      <h1 className="mt-2 text-2xl font-bold">Acesso do administrador</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ambiente administrativo separado das contas das empresas clientes.</p>
      {stage === "credentials" ? <form onSubmit={signIn} className="mt-6 grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="admin-email">E-mail</Label><Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="admin-password">Senha</Label><Input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Validando..." : "Continuar"}</Button>
      </form> : <form onSubmit={verifyCode} className="mt-6 grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="admin-totp">Código do autenticador</Label><Input id="admin-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Verificando..." : "Verificar e entrar"}</Button>
      </form>}
      {message && <p role="status" aria-live="polite" className="mt-4 rounded-md bg-muted p-3 text-sm">{message}</p>}
      <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">Acesso protegido por senha e MFA. Não compartilhe códigos de autenticação.</p>
    </section>
  </main>;
}
