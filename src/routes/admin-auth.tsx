import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";
const ADMIN_AUTH_CALLBACK = "https://service-task-mate-git-feature-comercial-mult-5d6bdb-alexsandro5.vercel.app/admin-auth";

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
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "saved" | "mfa-setup" | "mfa-enabled">("loading");
  const [message, setMessage] = useState("Validando o convite...");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");

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
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashType = hashParams.get("type");

      let authError: Error | null = null;

      // Supabase magic links may return credentials in the URL fragment.
      // This client disables automatic URL detection, so restore that session explicitly.
      if (accessToken && refreshToken && (!hashType || hashType === "magiclink" || hashType === "invite")) {
        const { error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error;
      } else if (tokenHash && (type === "invite" || type === "recovery" || type === "email" || type === "magiclink")) {
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
    if (!client) {
      setMessage("Conexão do projeto isolado indisponível neste carregamento. Atualize a página; nenhuma conta foi alterada.");
      return;
    }

    setBusy(true);
    setMessage("Solicitando link de ativação...");
    try {
      const { error } = await client.auth.signInWithOtp({
        email: ADMIN_EMAIL,
        options: {
          emailRedirectTo: ADMIN_AUTH_CALLBACK,
          shouldCreateUser: false,
        },
      });

      setMessage(error
        ? `Falha ao solicitar o link: ${error.message}`
        : "Solicitação concluída. Verifique a caixa de entrada e o spam do e-mail autorizado.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "erro inesperado";
      setMessage(`Não foi possível concluir a solicitação: ${detail}`);
    } finally {
      setBusy(false);
    }
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
    setStatus("mfa-setup");
    setMessage("Senha definida. Configure agora o aplicativo autenticador.");
  }

  async function enrollMfa() {
    if (!client) return;
    setBusy(true);
    const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Central OS SaaS - Administrador" });
    if (result.error) { setBusy(false); setMessage("Não foi possível preparar o autenticador. Tente novamente."); return; }
    setFactorId(result.data.id);
    setQrCode(result.data.totp.qr_code);
    setTotpSecret(result.data.totp.secret);
    const challenge = await client.auth.mfa.challenge({ factorId: result.data.id });
    setBusy(false);
    if (challenge.error) { setMessage("Não foi possível iniciar a verificação do autenticador."); return; }
    setChallengeId(challenge.data.id);
    setMessage("Escaneie o QR Code e informe o código atual do autenticador.");
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !factorId || !challengeId) return;
    if (!/^\d{6,8}$/.test(mfaCode)) { setMessage("Informe o código numérico do autenticador."); return; }
    setBusy(true);
    const result = await client.auth.mfa.verify({ factorId, challengeId, code: mfaCode });
    const assurance = result.error ? null : await client.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (result.error || assurance?.data.currentLevel !== "aal2") { setMessage("Não foi possível confirmar o MFA. Confira o código e tente novamente."); return; }
    setMfaCode(""); setQrCode(""); setTotpSecret(""); setStatus("mfa-enabled");
    setMessage("MFA ativado e verificado nesta sessão.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {status === "saved" || status === "mfa-enabled" ? <ShieldCheck className="size-6" /> : <KeyRound className="size-6" />}
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
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
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

        {status === "mfa-setup" && (
          <div className="mt-6 grid gap-4">
            <p className="text-sm text-muted-foreground">Abra o Google Authenticator, Microsoft Authenticator ou outro app TOTP.</p>
            {!qrCode ? (
              <Button type="button" disabled={busy} onClick={enrollMfa} className="w-full">{busy ? "Preparando..." : "Gerar QR Code do autenticador"}</Button>
            ) : (
              <>
                <div className="grid justify-items-center gap-3 rounded-md border p-4">
                  <img src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrCode)} alt="QR Code do autenticador" className="h-52 w-52" />
                  <div className="w-full grid gap-1"><Label htmlFor="totp-secret">Chave manual (mantenha em segredo)</Label><Input id="totp-secret" value={totpSecret} readOnly /></div>
                </div>
                <form onSubmit={verifyMfa} className="grid gap-3">
                  <Label htmlFor="mfa-code">Código de verificação</Label>
                  <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/[^0-9]/g, ""))} />
                  <Button type="submit" disabled={busy} className="w-full">{busy ? "Verificando..." : "Confirmar e ativar MFA"}</Button>
                </form>
              </>
            )}
            <p role="status" className="text-sm text-muted-foreground">{message}</p>
          </div>
        )}

        {status === "mfa-enabled" && (
          <div className="mt-6 rounded-md border bg-muted/40 p-4 text-sm">
            <p className="font-medium">MFA ativado e verificado.</p>
            <p className="mt-1 text-muted-foreground">{message}</p>
            <p className="mt-3 text-xs text-muted-foreground">A exigência de MFA em todos os acessos ainda depende da integração do desafio no fluxo de login do painel.</p>
          </div>
        )}

        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Ambiente isolado de testes. Esta página não acessa bancos de empresas clientes nem o Central OS operacional.
        </p>
      </section>
    </main>
  );
}
