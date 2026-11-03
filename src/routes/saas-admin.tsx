import { useCallback, useEffect, useMemo, useState } from "react";
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
  RefreshCw,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Plano = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  limite_usuarios: number | null;
  limite_unidades: number | null;
  recursos: Record<string, boolean>;
  ativo: boolean;
};

type Empresa = {
  id: string;
  nome_legal: string;
  nome_exibicao: string;
  slug: string;
  documento_fiscal: string | null;
  email_administrativo: string;
  status: "ativa" | "suspensa" | "encerrada" | "provisionando";
  created_at: string;
};


type Assinatura = {
  id: string;
  empresa_id: string;
  plano_id: string;
  status: "trial" | "ativa" | "atrasada" | "suspensa" | "cancelada" | "encerrada";
  inicio_em: string;
  periodo_atual_inicio: string | null;
  periodo_atual_fim: string | null;
  cancelada_em: string | null;
  referencia_pagamento: string | null;
  empresa?: { nome_exibicao: string } | null;
  plano?: { nome: string } | null;
};

function createSaasAuthClient() {
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
    if (assurance.error || assurance.data.currentLevel !== "aal2") {
      throw redirect({ to: "/admin-login" });
    }
  },
  component: SaasAdminHome,
});

function SaasAdminHome() {
  const [search, setSearch] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [nomeLegal, setNomeLegal] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [slug, setSlug] = useState("");
  const [documentoFiscal, setDocumentoFiscal] = useState("");
  const [emailAdministrativo, setEmailAdministrativo] = useState("");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planosLoading, setPlanosLoading] = useState(true);
  const [planosError, setPlanosError] = useState("");
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planCodigo, setPlanCodigo] = useState("");
  const [planNome, setPlanNome] = useState("");
  const [planDescricao, setPlanDescricao] = useState("");
  const [planUsuarios, setPlanUsuarios] = useState("10");
  const [planUnidades, setPlanUnidades] = useState("1");
  const [planAtivo, setPlanAtivo] = useState(true);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [assinaturasLoading, setAssinaturasLoading] = useState(true);
  const [assinaturasError, setAssinaturasError] = useState("");
  const [showAssinaturaForm, setShowAssinaturaForm] = useState(false);
  const [savingAssinatura, setSavingAssinatura] = useState(false);
  const [assinaturaError, setAssinaturaError] = useState("");
  const [editingAssinaturaId, setEditingAssinaturaId] = useState<string | null>(null);
  const [assinaturaEmpresa, setAssinaturaEmpresa] = useState("");
  const [assinaturaPlano, setAssinaturaPlano] = useState("");
  const [assinaturaStatus, setAssinaturaStatus] = useState<Assinatura["status"]>("trial");
  const [assinaturaInicio, setAssinaturaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [assinaturaFim, setAssinaturaFim] = useState("");
  const [assinaturaReferencia, setAssinaturaReferencia] = useState("");


  const client = useMemo(() => createSaasAuthClient(), []);


  const loadPlanos = useCallback(async () => {
    if (!client) { setPlanosError("Banco de controle não configurado."); setPlanosLoading(false); return; }
    setPlanosLoading(true); setPlanosError("");
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      setPlanosError("A verificação MFA (AAL2) é necessária."); setPlanosLoading(false); return;
    }
    const { data, error } = await client.from("planos")
      .select("id,codigo,nome,descricao,limite_usuarios,limite_unidades,recursos,ativo")
      .order("nome");
    if (error) { setPlanosError("Não foi possível carregar os planos: " + error.message); setPlanos([]); }
    else setPlanos((data ?? []) as Plano[]);
    setPlanosLoading(false);
  }, [client]);

  function resetPlanForm() {
    setEditingPlanId(null); setPlanCodigo(""); setPlanNome(""); setPlanDescricao("");
    setPlanUsuarios("10"); setPlanUnidades("1"); setPlanAtivo(true); setPlanError("");
  }
  function editPlan(plan: Plano) {
    setEditingPlanId(plan.id); setPlanCodigo(plan.codigo); setPlanNome(plan.nome);
    setPlanDescricao(plan.descricao ?? ""); setPlanUsuarios(plan.limite_usuarios?.toString() ?? "");
    setPlanUnidades(plan.limite_unidades?.toString() ?? ""); setPlanAtivo(plan.ativo);
    setPlanError(""); setShowPlanForm(true);
  }
  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || savingPlan) return;
    setSavingPlan(true); setPlanError("");
    const { data: userData, error: userError } = await client.auth.getUser();
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (userError || userData.user?.email?.toLowerCase() !== "faber.alexsandro2011@gmail.com" || assuranceError || assurance.currentLevel !== "aal2") {
      setPlanError("Sessão administrativa inválida ou MFA AAL2 ausente."); setSavingPlan(false); return;
    }
    const payload = {
      codigo: planCodigo.trim(), nome: planNome.trim(), descricao: planDescricao.trim() || null,
      limite_usuarios: planUsuarios.trim() === "" ? null : Number(planUsuarios),
      limite_unidades: planUnidades.trim() === "" ? null : Number(planUnidades), ativo: planAtivo,
    };
    const query = editingPlanId
      ? client.from("planos").update(payload).eq("id", editingPlanId)
      : client.from("planos").insert(payload);
    const { error } = await query;
    if (error) { setPlanError(error.code === "23505" ? "Esse código já está cadastrado." : "Não foi possível salvar: " + error.message); setSavingPlan(false); return; }
    resetPlanForm(); setShowPlanForm(false); setSavingPlan(false); await loadPlanos();
  }

  const loadEmpresas = useCallback(async () => {
    if (!client) {
      setLoadError("Configuração do banco de controle não encontrada neste ambiente.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || userData.user?.email?.toLowerCase() !== "faber.alexsandro2011@gmail.com") {
      setLoadError("Sessão administrativa inválida. Entre novamente.");
      setEmpresas([]);
      setLoading(false);
      return;
    }

    const { data: assurance, error: assuranceError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      setLoadError("A verificação MFA (AAL2) é necessária para consultar as empresas.");
      setEmpresas([]);
      setLoading(false);
      return;
    }

    const { data, error } = await client
      .from("empresas")
      .select("id,nome_legal,nome_exibicao,slug,documento_fiscal,email_administrativo,status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(
        error.code === "42501"
          ? "Acesso negado pelas políticas de segurança do banco."
          : `Não foi possível carregar as empresas: ${error.message}`,
      );
      setEmpresas([]);
    } else {
      setEmpresas((data ?? []) as Empresa[]);
    }
    setLoading(false);
  }, [client]);

  async function createEmpresa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || saving) return;
    setSaving(true);
    setCreateError("");

    const { data: userData, error: userError } = await client.auth.getUser();
    const { data: assurance, error: assuranceError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      userError ||
      userData.user?.email?.toLowerCase() !== "faber.alexsandro2011@gmail.com" ||
      assuranceError ||
      assurance.currentLevel !== "aal2"
    ) {
      setCreateError("Sessão administrativa inválida ou MFA AAL2 ausente. Entre novamente.");
      setSaving(false);
      return;
    }

    const normalizedSlug = slug.trim().toLowerCase();
    const { error } = await client.from("empresas").insert({
      nome_legal: nomeLegal.trim(),
      nome_exibicao: nomeExibicao.trim(),
      slug: normalizedSlug,
      documento_fiscal: documentoFiscal.trim() || null,
      email_administrativo: emailAdministrativo.trim().toLowerCase(),
      status: "provisionando",
    });

    if (error) {
      setCreateError(
        error.code === "23505"
          ? "Esse identificador já está em uso. Escolha outro."
          : error.code === "42501"
            ? "O banco recusou o cadastro pelas políticas de segurança."
            : `Não foi possível cadastrar: ${error.message}`,
      );
      setSaving(false);
      return;
    }

    setNomeLegal("");
    setNomeExibicao("");
    setSlug("");
    setDocumentoFiscal("");
    setEmailAdministrativo("");
    setShowCreate(false);
    setSaving(false);
    await loadEmpresas();
  }


  const loadAssinaturas = useCallback(async () => {
    if (!client) { setAssinaturasError("Banco de controle não configurado."); setAssinaturasLoading(false); return; }
    setAssinaturasLoading(true); setAssinaturasError("");
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      setAssinaturasError("A verificação MFA (AAL2) é necessária."); setAssinaturasLoading(false); return;
    }
    const { data, error } = await client.from("assinaturas")
      .select("id,empresa_id,plano_id,status,inicio_em,periodo_atual_inicio,periodo_atual_fim,cancelada_em,referencia_pagamento,empresa:empresas(nome_exibicao),plano:planos(nome)")
      .order("created_at", { ascending: false });
    if (error) { setAssinaturasError("Não foi possível carregar assinaturas: " + error.message); setAssinaturas([]); }
    else setAssinaturas((data ?? []) as unknown as Assinatura[]);
    setAssinaturasLoading(false);
  }, [client]);

  useEffect(() => {
    void loadEmpresas();
    void loadPlanos();
    void loadAssinaturas();
  }, [loadEmpresas, loadPlanos, loadAssinaturas]);

  function resetAssinaturaForm() {
    setEditingAssinaturaId(null); setAssinaturaEmpresa(""); setAssinaturaPlano("");
    setAssinaturaStatus("trial"); setAssinaturaInicio(new Date().toISOString().slice(0, 10));
    setAssinaturaFim(""); setAssinaturaReferencia(""); setAssinaturaError("");
  }
  function editAssinatura(item: Assinatura) {
    setEditingAssinaturaId(item.id); setAssinaturaEmpresa(item.empresa_id); setAssinaturaPlano(item.plano_id);
    setAssinaturaStatus(item.status); setAssinaturaInicio(item.inicio_em.slice(0, 10));
    setAssinaturaFim(item.periodo_atual_fim?.slice(0, 10) ?? "");
    setAssinaturaReferencia(item.referencia_pagamento ?? "");
    setAssinaturaError(""); setShowAssinaturaForm(true);
  }
  async function saveAssinatura(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || savingAssinatura) return;
    setSavingAssinatura(true); setAssinaturaError("");
    const { data: userData, error: userError } = await client.auth.getUser();
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (userError || userData.user?.email?.toLowerCase() !== "faber.alexsandro2011@gmail.com" || assuranceError || assurance.currentLevel !== "aal2") {
      setAssinaturaError("Sessão administrativa inválida ou MFA AAL2 ausente."); setSavingAssinatura(false); return;
    }
    if (!assinaturaEmpresa || !assinaturaPlano) {
      setAssinaturaError("Selecione uma empresa e um plano."); setSavingAssinatura(false); return;
    }
    const payload = {
      empresa_id: assinaturaEmpresa, plano_id: assinaturaPlano, status: assinaturaStatus,
      inicio_em: new Date(assinaturaInicio + "T12:00:00").toISOString(),
      periodo_atual_inicio: new Date(assinaturaInicio + "T12:00:00").toISOString(),
      periodo_atual_fim: assinaturaFim ? new Date(assinaturaFim + "T23:59:59").toISOString() : null,
      referencia_pagamento: assinaturaReferencia.trim() || null,
      cancelada_em: assinaturaStatus === "cancelada" ? new Date().toISOString() : null,
    };
    const query = editingAssinaturaId
      ? client.from("assinaturas").update(payload).eq("id", editingAssinaturaId)
      : client.from("assinaturas").insert(payload);
    const { error } = await query;
    if (error) {
      setAssinaturaError(error.code === "42501"
        ? "O banco ainda não autorizou o acesso a assinaturas. É necessário configurar as políticas RLS."
        : "Não foi possível salvar: " + error.message);
      setSavingAssinatura(false); return;
    }
    resetAssinaturaForm(); setShowAssinaturaForm(false); setSavingAssinatura(false); await loadAssinaturas();
  }

  async function signOut() {
    await client?.auth.signOut();
    window.location.assign("/admin-login");
  }

  const filteredEmpresas = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return empresas;
    return empresas.filter((empresa) =>
      [
        empresa.nome_exibicao,
        empresa.nome_legal,
        empresa.slug,
        empresa.documento_fiscal ?? "",
        empresa.email_administrativo,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [empresas, search]);

  const modules = [
    { label: "Empresas", detail: "Cadastro e situação das empresas clientes", icon: Building2, active: true },
    { label: "Planos", detail: "Recursos e limites de cada plano", icon: Layers3, active: true },
    { label: "Assinaturas", detail: "Vigência, vencimentos e situação comercial", icon: CreditCard, active: true },
    { label: "Instâncias", detail: "Ambientes e conexões isoladas por empresa", icon: Users, active: false },
  ];

  const statusLabels: Record<Empresa["status"], string> = {
    ativa: "Ativa",
    suspensa: "Suspensa",
    encerrada: "Encerrada",
    provisionando: "Provisionando",
  };

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
                {active ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Conectado</span> : <span className="text-xs text-muted-foreground">Etapa futura</span>}
              </div>
              <h2 className="mt-3 font-semibold">{label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>


        <section id="assinaturas" className="mt-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-xl font-semibold">Assinaturas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Vincule uma empresa a um plano e acompanhe a vigência. Sem cobrança automática.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadAssinaturas()} disabled={assinaturasLoading}>
                <RefreshCw className={`mr-2 size-4 ${assinaturasLoading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button onClick={() => { resetAssinaturaForm(); setShowAssinaturaForm((v) => !v); }}>
                {showAssinaturaForm ? <X className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
                {showAssinaturaForm ? "Cancelar" : "Nova assinatura"}
              </Button>
            </div>
          </div>
          <div className="p-5">
            {showAssinaturaForm && (
              <form onSubmit={saveAssinatura} className="mb-5 rounded-lg border p-4">
                <h3 className="font-semibold">{editingAssinaturaId ? "Editar assinatura" : "Cadastrar assinatura"}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">Empresa
                    <select required className="h-10 rounded-md border bg-background px-3" value={assinaturaEmpresa} onChange={(e) => setAssinaturaEmpresa(e.target.value)}>
                      <option value="">Selecione uma empresa</option>
                      {empresas.filter((e) => e.status !== "encerrada").map((e) => <option key={e.id} value={e.id}>{e.nome_exibicao}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">Plano
                    <select required className="h-10 rounded-md border bg-background px-3" value={assinaturaPlano} onChange={(e) => setAssinaturaPlano(e.target.value)}>
                      <option value="">Selecione um plano</option>
                      {planos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">Situação
                    <select className="h-10 rounded-md border bg-background px-3" value={assinaturaStatus} onChange={(e) => setAssinaturaStatus(e.target.value as Assinatura["status"])}>
                      <option value="trial">Período de teste</option><option value="ativa">Ativa</option>
                      <option value="atrasada">Atrasada</option><option value="suspensa">Suspensa</option>
                      <option value="cancelada">Cancelada</option><option value="encerrada">Encerrada</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">Início
                    <Input type="date" required value={assinaturaInicio} onChange={(e) => setAssinaturaInicio(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">Fim do período atual (opcional)
                    <Input type="date" min={assinaturaInicio} value={assinaturaFim} onChange={(e) => setAssinaturaFim(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">Referência comercial / pagamento (opcional)
                    <Input maxLength={120} value={assinaturaReferencia} onChange={(e) => setAssinaturaReferencia(e.target.value)} placeholder="Identificador interno, sem dados de cartão" />
                  </label>
                </div>
                {assinaturaError && <p role="alert" className="mt-3 text-sm text-destructive">{assinaturaError}</p>}
                <div className="mt-4 flex justify-end"><Button type="submit" disabled={savingAssinatura}>{savingAssinatura ? "Salvando..." : "Salvar assinatura"}</Button></div>
              </form>
            )}
            {assinaturasError ? <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{assinaturasError}</p>
              : assinaturasLoading ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando assinaturas com validação MFA…</p>
              : assinaturas.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><CreditCard className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Nenhuma assinatura cadastrada</p><p className="mt-1 text-sm text-muted-foreground">Cadastre uma assinatura após definir empresas e planos.</p></div>
              : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Plano</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3 font-medium">Início</th><th className="px-4 py-3 font-medium">Fim do período</th><th className="px-4 py-3 font-medium">Ação</th></tr></thead>
                <tbody className="divide-y">{assinaturas.map((item) => <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">{item.empresa?.nome_exibicao ?? "Empresa"}</td><td className="px-4 py-3">{item.plano?.nome ?? "Plano"}</td>
                  <td className="px-4 py-3">{({trial:"Teste",ativa:"Ativa",atrasada:"Atrasada",suspensa:"Suspensa",cancelada:"Cancelada",encerrada:"Encerrada"} as Record<Assinatura["status"],string>)[item.status]}</td>
                  <td className="px-4 py-3">{new Date(item.inicio_em).toLocaleDateString("pt-BR")}</td><td className="px-4 py-3">{item.periodo_atual_fim ? new Date(item.periodo_atual_fim).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => editAssinatura(item)}>Editar</Button></td>
                </tr>)}</tbody>
              </table></div>}
          </div>
        </section>

        <section id="planos" className="mt-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-xl font-semibold">Planos comerciais</h2>
              <p className="mt-1 text-sm text-muted-foreground">Defina os limites de usuários e unidades. Campo em branco significa sem limite definido.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadPlanos()} disabled={planosLoading}>
                <RefreshCw className={`mr-2 size-4 ${planosLoading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button onClick={() => { resetPlanForm(); setShowPlanForm((v) => !v); }}>
                {showPlanForm ? <X className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
                {showPlanForm ? "Cancelar" : "Novo plano"}
              </Button>
            </div>
          </div>
          <div className="p-5">
            {showPlanForm && (
              <form onSubmit={savePlan} className="mb-5 rounded-lg border p-4">
                <h3 className="font-semibold">{editingPlanId ? "Editar plano" : "Cadastrar plano"}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">Código único
                    <Input required maxLength={40} pattern="[a-z0-9-]+" value={planCodigo} onChange={(e) => setPlanCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="essencial" />
                  </label>
                  <label className="grid gap-1 text-sm">Nome do plano
                    <Input required maxLength={100} value={planNome} onChange={(e) => setPlanNome(e.target.value)} placeholder="Essencial" />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">Descrição
                    <Input maxLength={500} value={planDescricao} onChange={(e) => setPlanDescricao(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">Limite de usuários
                    <Input type="number" min="0" value={planUsuarios} onChange={(e) => setPlanUsuarios(e.target.value)} placeholder="Sem limite definido" />
                  </label>
                  <label className="grid gap-1 text-sm">Limite de unidades
                    <Input type="number" min="0" value={planUnidades} onChange={(e) => setPlanUnidades(e.target.value)} placeholder="Sem limite definido" />
                  </label>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={planAtivo} onChange={(e) => setPlanAtivo(e.target.checked)} />
                    Plano ativo para novas contratações
                  </label>
                </div>
                {planError && <p role="alert" className="mt-3 text-sm text-destructive">{planError}</p>}
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={savingPlan}>{savingPlan ? "Salvando..." : "Salvar plano"}</Button>
                </div>
              </form>
            )}
            {planosError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{planosError}</p>
            ) : planosLoading ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando planos com validação MFA…</p>
            ) : planos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Layers3 className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Nenhum plano cadastrado</p>
                <p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro plano para estruturar as opções comerciais.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground"><tr>
                    <th className="px-4 py-3 font-medium">Plano</th>
                    <th className="px-4 py-3 font-medium">Código</th>
                    <th className="px-4 py-3 font-medium">Usuários</th>
                    <th className="px-4 py-3 font-medium">Unidades</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3 font-medium">Ação</th>
                  </tr></thead>
                  <tbody className="divide-y">{planos.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-4 py-3"><p className="font-medium">{plan.nome}</p><p className="text-xs text-muted-foreground">{plan.descricao || "—"}</p></td>
                      <td className="px-4 py-3 font-mono text-xs">{plan.codigo}</td>
                      <td className="px-4 py-3">{plan.limite_usuarios ?? "—"}</td>
                      <td className="px-4 py-3">{plan.limite_unidades ?? "—"}</td>
                      <td className="px-4 py-3">{plan.ativo ? "Ativo" : "Inativo"}</td>
                      <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => editPlan(plan)}>Editar</Button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-xl font-semibold">Empresas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Consulta protegida das empresas cadastradas no banco de controle SaaS.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadEmpresas()} disabled={loading}>
                <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button onClick={() => { setShowCreate((value) => !value); setCreateError(""); }}>
                {showCreate ? <X className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
                {showCreate ? "Cancelar" : "Nova empresa"}
              </Button>
            </div>
          </div>

          <div className="p-5">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, CNPJ ou identificador"
                className="pl-9"
              />
            </label>

            {showCreate && (
              <form onSubmit={createEmpresa} className="mt-5 rounded-lg border p-4">
                <h3 className="font-semibold">Cadastrar empresa</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  O cadastro cria somente o registro comercial, com situação “Provisionando”. Não cria usuários nem provisiona uma instância.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Razão social
                    <Input required maxLength={180} value={nomeLegal} onChange={(event) => setNomeLegal(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Nome de exibição
                    <Input required maxLength={120} value={nomeExibicao} onChange={(event) => setNomeExibicao(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Identificador (slug)
                    <Input
                      required
                      maxLength={60}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      title="Use letras minúsculas, números e hífens."
                      value={slug}
                      onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
                      placeholder="ex.: empresa-exemplo"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    CNPJ / documento fiscal (opcional)
                    <Input maxLength={30} value={documentoFiscal} onChange={(event) => setDocumentoFiscal(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    E-mail administrativo
                    <Input required type="email" maxLength={254} value={emailAdministrativo} onChange={(event) => setEmailAdministrativo(event.target.value)} />
                  </label>
                </div>
                {createError && <p role="alert" className="mt-3 text-sm text-destructive">{createError}</p>}
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvando..." : "Cadastrar empresa"}
                  </Button>
                </div>
              </form>
            )}

            {loadError ? (
              <div className="mt-5 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">Não foi possível consultar o banco</p>
                  <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                </div>
              </div>
            ) : loading ? (
              <div className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Carregando empresas com validação MFA…
              </div>
            ) : empresas.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed p-8 text-center">
                <Building2 className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Nenhuma empresa cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">O banco de controle está conectado e ainda não possui empresas.</p>
              </div>
            ) : filteredEmpresas.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma empresa corresponde à busca.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Empresa</th>
                      <th className="px-4 py-3 font-medium">Identificador</th>
                      <th className="px-4 py-3 font-medium">Documento</th>
                      <th className="px-4 py-3 font-medium">E-mail administrativo</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredEmpresas.map((empresa) => (
                      <tr key={empresa.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{empresa.nome_exibicao}</p>
                          <p className="text-xs text-muted-foreground">{empresa.nome_legal}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{empresa.slug}</td>
                        <td className="px-4 py-3">{empresa.documento_fiscal || "—"}</td>
                        <td className="px-4 py-3">{empresa.email_administrativo}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{statusLabels[empresa.status]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !loadError && empresas.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Exibindo {filteredEmpresas.length} de {empresas.length} empresa(s).
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
