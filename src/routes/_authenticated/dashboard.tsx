import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Play,
  Plus,
  Pencil,
  Search,
  Upload,
  UserRound,
  ShieldCheck,
  Trash2,
  Tractor,
  Wrench,
  Ban,
  History,
  BarChart3,
  AlertTriangle,
  Clock3,
  UserX,
  Wifi,
  WifiOff,
  PackagePlus,
  X,
  Inbox,
} from "lucide-react";
import { read, utils } from "xlsx";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createTeamUser, deleteTeamUser, updateTeamUser } from "@/lib/users.functions";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Ordem = Tables<"ordens_servico">;
type Peca = Tables<"pecas_catalogo">;
type Perfil = Tables<"profiles">;
type ImportRow = {
  numero_os: string;
  frota: string;
  localizacao: string;
  descricao: string;
  tecnico_email: string;
  entrada: string;
  valid: boolean;
  reason?: string;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel de Ordens de Serviço — Central OS" },
      { name: "description", content: "Gestão, importação e acompanhamento de ordens de serviço." },
      { property: "og:title", content: "Painel de Ordens de Serviço — Central OS" },
      { property: "og:description", content: "Gestão, importação e acompanhamento de ordens de serviço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

async function getDashboardData() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("A sessão terminou. Entre novamente.");

  const [ordersResult, profileResult, roleResult] = await Promise.all([
    supabase.from("ordens_servico").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("nome", { ascending: true }),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (ordersResult.error) throw ordersResult.error;
  if (profileResult.error) throw profileResult.error;
  if (roleResult.error) throw roleResult.error;

  const role = roleResult.data.find((item) => item.user_id === authData.user.id)?.role ?? "tecnico";
  const technicians = profileResult.data
    .filter((profile) => roleResult.data.some((item) => item.user_id === profile.id && item.role === "tecnico"))
    .map((profile) => profile.nome?.trim().toLowerCase() === "alex" ? { ...profile, nome: "Alexsandro Faber" } : profile);
  const meRaw = profileResult.data.find((profile) => profile.id === authData.user.id);
  const me = meRaw && meRaw.nome?.trim().toLowerCase() === "alex" ? { ...meRaw, nome: "Alexsandro Faber" } : meRaw;
  const team = profileResult.data
    .map((rawProfile) => {
      const profile = rawProfile.nome?.trim().toLowerCase() === "alex" ? { ...rawProfile, nome: "Alexsandro Faber" } : rawProfile;
      return { profile, role: roleResult.data.find((item) => item.user_id === profile.id)?.role ?? "tecnico" };
    })
    .filter((item) => item.profile.id !== authData.user.id);

  return {
    user: authData.user,
    role,
    me,
    technicians,
    team,
    orders: ordersResult.data,
  };
}

type Status = "pendente" | "em_andamento" | "concluida" | "cancelada";
const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Finalizada",
  cancelada: "Cancelada",
};
type Actor = { id: string; email: string; name: string; isManager: boolean };
type TeamMember = { profile: Perfil; role: "gestor" | "tecnico" };

/** Traduz erros do backend para mensagens claras, incluindo falhas de permissão. */
function formatEntrada(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const text = value.trim();

  // Datas brasileiras: mantém explicitamente DD/MM/AA.
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    const year = br[3].length === 2 ? "20" + br[3] : br[3].slice(-4);
    return day + "/" + month + "/" + year.slice(-2);
  }

  // ISO/Date do Excel: interpreta sem conversão de fuso e mostra DD/MM/AA.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1].slice(-2);

  // Número serial do Excel (sistema 1900).
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "UTC",
    });
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "UTC",
    });
  }

  return null;
}

function formatDataAberturaFallback(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function friendlyError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42501" || /permission|row-level/i.test(error.message ?? "")) {
    return "Sem permissão para esta ação. Confirme se a OS lhe está atribuída.";
  }
  if (!navigator.onLine) return "Sem ligação à internet. Tente novamente quando voltar a estar online.";
  return fallback;
}

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"minhas" | "fila">("minhas");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("todas");
  const [online, setOnline] = useState(true);
  const [live, setLive] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardData });

  // Estado da ligação do navegador
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Atualização em tempo real: qualquer alteração em ordens_servico recarrega a lista
  useEffect(() => {
    const channel = supabase
      .channel("ordens_servico_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const data = dashboardQuery.data;
  const isManager = data?.role === "gestor";
  const userId = data?.user.id;
  const userEmail = data?.user.email?.trim().toLowerCase();
  const allOrders = data?.orders ?? [];
  const pendingSolicitations = isManager ? allOrders.filter((o) => o.solicitacao_os === true && o.solicitacao_status === "aguardando_os").length : 0;
  // Técnico: aceita atribuição pelo ID ou pelo e-mail para não perder OS
  // antigas/importadas que foram gravadas sem tecnico_id.
  const orders = useMemo(() => {
    if (isManager) return allOrders;
    return scope === "minhas"
      ? allOrders.filter((o) =>
          o.tecnico_id === userId ||
          (userEmail && o.tecnico_email?.trim().toLowerCase() === userEmail)
        )
      : allOrders.filter((o) => !o.tecnico_id && !o.tecnico_email && o.status === "pendente");
  }, [allOrders, isManager, scope, userId, userEmail]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt");
    if (!term) return orders;
    return orders.filter((order) =>
      [order.numero_os, order.frota, order.localizacao, order.tecnico_email, order.tecnico_nome, order.descricao]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("pt").includes(term)),
    );
  }, [orders, search]);
  const byStatus = (s: Status) => filtered.filter((o) => o.status === s);
  const operationalAlerts = useMemo(() => {
    if (!isManager) return { stalePending: 0, staleInProgress: 0, unassigned: 0 };
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    return {
      stalePending: orders.filter((o) => o.status === "pendente" && now - new Date(o.created_at).getTime() >= sevenDays).length,
      staleInProgress: orders.filter((o) => o.status === "em_andamento" && o.data_inicio && now - new Date(o.data_inicio).getTime() >= oneDay).length,
      unassigned: orders.filter((o) => o.status === "pendente" && !o.tecnico_id && !o.tecnico_email).length,
    };
  }, [isManager, orders]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const isPrimaryAdmin = userEmail === "faber.alexsandro2011@gmail.com";

  async function deleteSelectedOrders() {
    if (!isPrimaryAdmin || selectedOrderIds.length === 0) return;
    if (!confirm("Excluir permanentemente " + selectedOrderIds.length + " OS selecionada(s)? Esta ação não pode ser desfeita.")) return;
    const ids = [...selectedOrderIds];
    const { error } = await supabase.from("ordens_servico").delete().in("id", ids);
    if (error) {
      toast.error(friendlyError(error, "Não foi possível excluir as OS selecionadas."));
      return;
    }
    setSelectedOrderIds([]);
    toast.success(ids.length + " OS excluída(s) com sucesso.");
    await refresh();
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  if (dashboardQuery.isPending) return <LoadingScreen />;
  if (dashboardQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <p className="font-semibold">Não foi possível abrir o painel.</p>
          <p className="mt-2 text-sm text-muted-foreground">{friendlyError(dashboardQuery.error as { message?: string }, dashboardQuery.error.message)}</p>
          <Button className="mt-5" onClick={() => router.invalidate()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }
  if (!data) return <LoadingScreen />;

  const actor: Actor = {
    id: data.user.id,
    email: data.user.email ?? "",
    name: data.me?.nome?.trim().toLowerCase() === "alex" ? "Alexsandro Faber" : (data.me?.nome ?? data.user.email ?? ""),
    isManager,
  };
  const connected = online && live;

  const tabs: { value: string; label: string; list: Ordem[] }[] = [
    { value: "todas", label: "Todas", list: filtered },
    { value: "pendente", label: "Pendente", list: byStatus("pendente") },
    { value: "em_andamento", label: "Em andamento", list: byStatus("em_andamento") },
    { value: "concluida", label: "Concluídas", list: byStatus("concluida") },
    { value: "cancelada", label: "Canceladas", list: byStatus("cancelada") },
  ];
  const statusChipStyles: Record<string, { active: string; inactive: string }> = {
    todas: {
      active: "border-blue-600 bg-blue-600 text-white",
      inactive: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/60",
    },
    pendente: {
      active: "border-amber-500 bg-amber-500 text-amber-950",
      inactive: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60",
    },
    em_andamento: {
      active: "border-violet-600 bg-violet-600 text-white",
      inactive: "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/60",
    },
    concluida: {
      active: "border-emerald-600 bg-emerald-600 text-white",
      inactive: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60",
    },
    cancelada: {
      active: "border-rose-600 bg-rose-600 text-white",
      inactive: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/60",
    },
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[190px_1fr]">
      <aside className="hidden border-r bg-sidebar lg:flex lg:min-h-screen lg:flex-col">
        <Brand />
        <nav className="flex-1 px-2 py-3">
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Área de trabalho</div>
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-2.5 py-2 text-sm font-semibold transition-colors text-sidebar-accent-foreground">
            <ClipboardList className="size-4" /> Ordens de serviço
          </div>
          {isManager && (
            <>
              <button type="button" onClick={() => void navigate({ to: "/analises" })} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <BarChart3 className="size-4" /> Análise técnica
              </button>
              <button type="button" onClick={() => void navigate({ to: "/solicitacoes" })} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <Inbox className="size-4" /> Solicitações de OS {pendingSolicitations > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-black text-destructive-foreground">{pendingSolicitations}</span>}
              </button>
              <button type="button" onClick={() => void navigate({ to: "/historico" })} className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <History className="size-4" /> Histórico
              </button>
            </>
          )}
        </nav>
        <UserPanel name={actor.name || "Utilizador"} email={actor.email} role={data.role} onSignOut={signOut} />
      </aside>

      <main className="min-w-0 dashboard-modern">
        <header className="flex h-14 items-center justify-between border-b px-3 sm:px-5 lg:hidden">
          <Brand compact />
          <div className="flex items-center gap-2">
            {isManager && (
              <>
                <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/analises" })} title="Análise técnica">
                  <BarChart3 />
                </Button>
                <Button variant="ghost" size="icon" className="relative" onClick={() => void navigate({ to: "/solicitacoes" })} title="Solicitações de OS">
                  <Inbox />{pendingSolicitations > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-[10px] font-black leading-5 text-destructive-foreground">{pendingSolicitations}</span>}
                </Button>
              </>
            )}
            {!isManager && <ConnectionPill connected={connected} online={online} />}
            <Button variant="ghost" size="icon" onClick={signOut} title="Terminar sessão"><LogOut /></Button>
          </div>
        </header>
        {!online && (
          <div className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
            Sem ligação à internet. As alterações serão mostradas quando a ligação voltar.
          </div>
        )}
        <div className="mx-auto w-full max-w-[1800px] p-3 sm:p-5 lg:p-8 agri-fade-up">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-3">
                <Tractor className="size-5 text-[var(--agri-leaf)]" />
                <p className="text-sm font-semibold text-muted-foreground">{isManager ? "Painel central" : "Área do técnico"}</p>
                {!isManager && <span className="hidden lg:inline-flex"><ConnectionPill connected={connected} online={online} /></span>}
              </div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Ordens de serviço</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{isManager ? "Acompanhe e distribua o trabalho da equipa." : "Inicie e finalize os seus atendimentos."}</p>
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2 shadow-sm">
                {isManager && <TechnicianManagerDialog team={data.team} actor={actor} onChanged={refresh} />}
                {isManager && <PartsCatalogDialog />}
                {isManager && (
                  <Button variant="outline" className="gap-2 text-sm font-semibold" onClick={() => void navigate({ to: "/solicitacoes" })}>
                    <Inbox className="size-4" /> Solicitações de OS
                  </Button>
                )}
                {isPrimaryAdmin && selectedOrderIds.length > 0 && (
                  <Button variant="destructive" className="gap-2 text-sm font-semibold" onClick={() => void deleteSelectedOrders()}>
                    <Trash2 className="size-4" /> Excluir {selectedOrderIds.length} OS
                  </Button>
                )}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 text-sm font-semibold transition-all">
                      <ClipboardList className="size-4" /> Gestão de OS
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Gestão de ordens de serviço</DialogTitle>
                      <DialogDescription>
                        Escolha como deseja adicionar novas ordens ao sistema.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Button
                        type="button"
                        className="h-auto min-h-28 flex-col gap-2 rounded-xl p-4"
                        onClick={() => setCreateOpen(true)}
                      >
                        <Plus className="size-7" />
                        <span className="text-sm font-bold">Criar OS</span>
                        <span className="text-xs leading-5 opacity-80">Cadastrar uma ordem</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-28 flex-col gap-2 rounded-xl p-4"
                        onClick={() => setImportOpen(true)}
                      >
                        <Upload className="size-7" />
                        <span className="text-sm font-bold">Importar planilha</span>
                        <span className="text-xs leading-5 text-muted-foreground">Excel ou CSV</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-28 flex-col gap-2 rounded-xl p-4"
                        onClick={() => setPasteOpen(true)}
                      >
                        <ClipboardPaste className="size-7" />
                        <span className="text-sm font-bold">Colar planilha</span>
                        <span className="text-xs leading-5 text-muted-foreground">Copiar e colar do Excel</span>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <PasteOrdersDialog open={pasteOpen} onOpenChange={setPasteOpen} technicians={data.technicians} creator={actor} onImported={refresh} />
                <ImportDialog open={importOpen} onOpenChange={setImportOpen} technicians={data.technicians} creator={actor} onImported={refresh} />
                <CreateDialog open={createOpen} onOpenChange={setCreateOpen} technicians={data.technicians} creator={actor} onCreated={refresh} />
              </div>
            )}
          </div>

          {!isManager && (
            <div className="mt-6 inline-flex rounded-md border bg-card p-1">
              <Button size="sm" variant={scope === "minhas" ? "default" : "ghost"} onClick={() => setScope("minhas")}>As minhas OS</Button>
              <Button size="sm" variant={scope === "fila" ? "default" : "ghost"} onClick={() => setScope("fila")}>Fila geral</Button>
            </div>
          )}

          <div className="mt-8">
            <div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="size-5 text-primary" />
                    <h2 className="text-lg font-bold">Registo de ordens</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? "ordem encontrada" : "ordens encontradas"} · clique numa aba para filtrar rapidamente.
                  </p>
                </div>
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar OS, frota ou técnico..." className="h-12 bg-background pl-9 shadow-sm transition-shadow focus-within:shadow-md" />
                </div>
              </div>
              <div className="mt-5 border-y py-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <span className="font-bold uppercase tracking-[0.12em] text-muted-foreground">Monitoramento</span>
                  {isManager ? (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className={"size-3.5 " + (operationalAlerts.stalePending ? "text-amber-600" : "text-emerald-600")} />
                        <strong>{operationalAlerts.stalePending}</strong> pendente(s) há mais de 7 dias
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className={"size-3.5 " + (operationalAlerts.staleInProgress ? "text-violet-600" : "text-emerald-600")} />
                        <strong>{operationalAlerts.staleInProgress}</strong> atendimento(s) há mais de 24 h
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <UserX className={"size-3.5 " + (operationalAlerts.unassigned ? "text-rose-600" : "text-emerald-600")} />
                        <strong>{operationalAlerts.unassigned}</strong> OS pendente(s) sem técnico
                      </span>
                      <button type="button" onClick={() => void navigate({ to: "/analises" })} className="font-semibold text-primary hover:underline">
                        Abrir análise técnica →
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Acompanhe suas OS e atualizações diretamente nesta tela.</span>
                  )}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
                {tabs.map((t) => {
                  const selected = activeTab === t.value;
                  const tone = statusChipStyles[t.value] ?? statusChipStyles["todas"]!;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setActiveTab(t.value)}
                      className={[
                        "group flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2",
                        selected ? tone.active : tone.inactive,
                      ].join(" ")}
                    >
                      <span className="min-w-0 truncate">{t.label}</span>
                      <span className={"inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums " + (selected ? "bg-white/20" : "bg-white/80 dark:bg-black/10")}>
                        {t.list.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="sr-only">
                {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              </TabsList>
              {tabs.map((t) => (
                <TabsContent key={t.value} value={t.value} className="m-0 p-4 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{t.label}</p>
                      <p className="text-sm text-muted-foreground">Mostrando {t.list.length} {t.list.length === 1 ? "registro" : "registros"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isPrimaryAdmin && t.list.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={t.list.every((order) => selectedOrderIds.includes(order.id))}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedOrderIds((current) => Array.from(new Set([...current, ...t.list.map((order) => order.id)])));
                              } else {
                                const visibleIds = new Set(t.list.map((order) => order.id));
                                setSelectedOrderIds((current) => current.filter((id) => !visibleIds.has(id)));
                              }
                            }}
                            className="size-4 cursor-pointer accent-primary"
                          />
                          Excluir todas
                        </label>
                      )}
                      {search && <Button variant="ghost" size="sm" onClick={() => setSearch("")}>Limpar pesquisa <X /></Button>}
                    </div>
                  </div>
                  <OrderList orders={t.list} empty="Não existem ordens nesta vista." actor={actor} onChanged={refresh} selectedIds={selectedOrderIds} onToggleSelect={(id) => setSelectedOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} canSelect={isPrimaryAdmin} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

function ConnectionPill({ connected, online }: { connected: boolean; online: boolean }) {
  return (
    <span className={connected ? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" : "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"}>
      {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {connected ? "Online" : online ? "A ligar…" : "Offline"}
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-2" : "flex h-14 items-center gap-2 border-b px-4"}>
      <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Wrench className="size-4" /></div>
      <div><div className="text-sm font-bold">Central OS</div>{!compact && <div className="text-xs text-muted-foreground">Gestão operacional</div>}</div>
    </div>
  );
}

function UserPanel({ name, email, role, onSignOut }: { name: string; email: string; role: string; onSignOut: () => void }) {
  return (
    <div className="border-t p-4">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"><UserRound className="size-4" /></div>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{name}</div><div className="truncate text-xs text-muted-foreground">{email}</div></div>
        <Button variant="ghost" size="icon" onClick={onSignOut} title="Terminar sessão"><LogOut /></Button>
      </div>
      <div className="mt-3 inline-flex rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold uppercase text-secondary-foreground">{role}</div>
    </div>
  );
}

function getReplacedParts(value: string | null | undefined) {
  if (!value?.trim()) return [];
  return value.split(/\n/).map((part) => part.trim()).filter(Boolean).map((nome) => ({ nome, quantidade: 1 }));
}

const fmtDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
function OrderList({ orders, empty, actor, onChanged, selectedIds, onToggleSelect, canSelect }: { orders: Ordem[]; empty: string; actor: Actor; onChanged: () => Promise<void>; selectedIds: string[]; onToggleSelect: (id: string) => void; canSelect: boolean }) {
  if (orders.length === 0) {
    return <div className="rounded-xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <div className="divide-y divide-border">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} actor={actor} onChanged={onChanged} selected={selectedIds.includes(order.id)} onToggleSelect={onToggleSelect} canSelect={canSelect} />
      ))}
    </div>
  );
}

/** Regista uma entrada no histórico de auditoria da OS. */
async function logHistory(osId: string, actor: Actor, acao: string, detalhe: string) {
  const { error } = await supabase.from("historico_edicoes").insert({
    os_id: osId,
    acao,
    detalhe,
    usuario_id: actor.id,
    usuario_email: actor.email,
  });
  if (error) throw error;
}

function FleetBadge({ value, compact = false }: { value: string; compact?: boolean }) {
  const label = String(value || "—").replace(/^\s*frota\s*[:#-]?\s*/i, "").trim() || "—";
  return (
    <span
      title={`Frota ${label}`}
      className={compact
        ? "inline-flex max-w-[95px] items-center rounded border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary"
        : "inline-flex max-w-[110px] items-center rounded border border-primary/15 bg-primary/10 px-2 py-0.5 text-[13px] font-semibold leading-none text-primary"}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function OrderCard({ order, actor, onChanged, selected, onToggleSelect, canSelect }: { order: Ordem; actor: Actor; onChanged: () => Promise<void>; selected: boolean; onToggleSelect: (id: string) => void; canSelect: boolean }) {
  const [busy, setBusy] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const status = order.status as Status;
  const isMine = order.tecnico_id === actor.id;
  const isPrimaryAdmin = actor.email.trim().toLowerCase() === "faber.alexsandro2011@gmail.com";
  const canStart = status === "pendente" && (isPrimaryAdmin || (!actor.isManager && (!order.tecnico_id || isMine)));
  const canFinish = status === "em_andamento" && (isMine || actor.isManager);
  const canCancel = actor.isManager && (status === "pendente" || status === "em_andamento");
  const canDelete = isPrimaryAdmin;

  async function start() {
    setBusy(true);
    const { data, error } = await supabase
      .from("ordens_servico")
      .update({ status: "em_andamento", data_inicio: new Date().toISOString(), tecnico_id: actor.id, tecnico_email: actor.email, tecnico_nome: actor.name })
      .eq("id", order.id)
      .eq("status", "pendente")
      .select("id");
    if (error || !data?.length) {
      setBusy(false);
      toast.error(error ? friendlyError(error, "Não foi possível iniciar o atendimento.") : "Esta OS já foi assumida ou alterada por outra pessoa.");
      await onChanged();
      return;
    }
    try {
      await logHistory(order.id, actor, "iniciada", `Atendimento iniciado por ${actor.email}`);
      toast.success(`OS ${order.numero_os} em andamento.`);
    } catch (historyError) {
      console.error("[OS] Falha ao registrar histórico de início:", historyError);
      toast.warning(`OS ${order.numero_os} iniciada, mas o histórico ficou pendente.`);
    }
    setBusy(false);
    await onChanged();
  }

  async function cancel() {
    if (!confirm(`Cancelar a OS ${order.numero_os}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("ordens_servico").update({ status: "cancelada" }).eq("id", order.id);
    if (error) {
      setBusy(false);
      toast.error(friendlyError(error, "Não foi possível cancelar a OS."));
      return;
    }
    try {
      await logHistory(order.id, actor, "cancelada", `Cancelada por ${actor.email}`);
      toast.success(`OS ${order.numero_os} cancelada.`);
    } catch (historyError) {
      console.error("[OS] Falha ao registrar histórico de cancelamento:", historyError);
      toast.warning(`OS ${order.numero_os} cancelada, mas o histórico ficou pendente.`);
    }
    setBusy(false);
    await onChanged();
  }

  async function deleteOrder() {
    if (!canDelete) {
      toast.error("Somente o administrador principal pode excluir OS.");
      return;
    }
    if (!confirm(`Excluir permanentemente a OS ${order.numero_os}? Esta ação não pode ser desfeita.`)) return;

    setBusy(true);
    const { error } = await supabase.from("ordens_servico").delete().eq("id", order.id);
    if (error) {
      setBusy(false);
      toast.error(friendlyError(error, "Não foi possível excluir a OS."));
      return;
    }

    toast.success(`OS ${order.numero_os} excluída.`);
    setDetailsOpen(false);
    setBusy(false);
    await onChanged();
  }

  const actionButtons = (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2">
      {canStart && (
        <Button size="sm" className="h-9 w-full min-w-0 px-2" disabled={busy} onClick={(event) => { event.stopPropagation(); void start(); }}>
          <Play /> Iniciar
        </Button>
      )}
      {canFinish && (
        <Button size="sm" className="h-9 w-full min-w-0 px-2" disabled={busy} onClick={(event) => { event.stopPropagation(); setFinishOpen(true); }}>
          <CheckCircle2 /> Finalizar
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" className="h-9 w-full min-w-0 px-2" disabled={busy} onClick={(event) => { event.stopPropagation(); void cancel(); }}>
          <Ban /> Cancelar
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="destructive" className="h-9 w-full min-w-0 px-2" disabled={busy} onClick={(event) => { event.stopPropagation(); void deleteOrder(); }}>
          <Trash2 /> Excluir
        </Button>
      )}
    </div>
  );

  return (
    <>
      <article
        className="group cursor-pointer px-1.5 py-2 transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset"
        role="button"
        tabIndex={0}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDetailsOpen(true);
          }
        }}
        aria-label={`Abrir detalhes da OS ${order.numero_os}`}
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {canSelect && (
          <label className="flex shrink-0 items-center" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(order.id)}
              aria-label={"Selecionar OS " + order.numero_os}
              className="size-4 cursor-pointer rounded border-input accent-primary"
            />
          </label>
        )}
          <div className="flex min-w-[110px] items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-primary">
              <ClipboardList className="size-3" />
            </span>
            <span className="font-bold text-sm">OS {order.numero_os}</span>
          </div>

          <div className="min-w-[65px]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Frota</span>
            <p className="text-sm font-semibold text-primary">{order.frota || "—"}</p>
          </div>

          <div className="min-w-[125px] flex-1">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Técnico</span>
            <p className="break-words text-sm font-medium">{order.tecnico_nome || order.tecnico_email || "Fila geral"}</p>
          </div>

          <div className="min-w-[150px] flex-[1.2]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Serviço</span>
            <p className="break-words text-sm">{order.descricao || "Sem descrição"}</p>
          </div>

          <div className="shrink-0">
            <StatusBadge status={status} />
          </div>

          <div className="flex min-w-[190px] flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span><strong className="text-foreground/70">Abertura da OS:</strong> {formatEntrada(order.entrada) || formatDataAberturaFallback(order.created_at)}</span>
            <span><strong className="text-foreground/70">Início:</strong> {fmtDate(order.data_inicio)}</span>
            <span><strong className="text-foreground/70">Fim:</strong> {fmtDate(order.concluida_em)}</span>
          </div>

          <div className="ml-auto w-full sm:w-auto sm:min-w-[160px]" onClick={(event) => event.stopPropagation()}>
            {actionButtons}
          </div>
        </div>
      </article>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <div><DialogTitle className="text-2xl">OS {order.numero_os}</DialogTitle><DialogDescription className="mt-1">Detalhes completos da ordem de serviço</DialogDescription></div>
              <StatusBadge status={status} />
            </div>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frota</p><p className="mt-1 text-sm font-bold">{order.frota}</p></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Técnico</p><p className="mt-1 truncate font-semibold">{order.tecnico_nome || order.tecnico_email || "Fila geral"}</p></div>
            </div>
            <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Localização</p><p className="mt-1 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{order.localizacao || "Não informada"}</p></div>
            <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Descrição</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{order.descricao || "Sem descrição."}</p></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abertura da OS</p><p className="mt-1 text-sm font-medium">{formatEntrada(order.entrada) || formatDataAberturaFallback(order.created_at)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Início</p><p className="mt-1 text-sm font-medium">{fmtDate(order.data_inicio)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conclusão</p><p className="mt-1 text-sm font-medium">{fmtDate(order.concluida_em)}</p></div>
            </div>
            {status === "concluida" && order.notas_fecho && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-semibold uppercase text-primary">Serviço realizado</p><p className="mt-1 whitespace-pre-wrap text-sm">{order.notas_fecho}</p></div>}
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Peças trocadas pelo técnico</p>
              {getReplacedParts(order.pecas_utilizadas).length ? (
                <div className="mt-2 grid gap-2">
                  {getReplacedParts(order.pecas_utilizadas).map((part, index) => (
                    <div key={`${part.nome}-${index}`} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                      <span className="text-sm font-medium">{part.nome}</span>
                      <span className="text-xs text-muted-foreground">Qtd.: {part.quantidade}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma peça trocada</p>
              )}
            </div>
            {order.localizacao && <Button variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.localizacao ?? "")}`, "_blank", "noopener,noreferrer")}><MapPin /> Abrir localização no mapa</Button>}
            {(canStart || canFinish || canCancel || canDelete) && <div className="flex flex-wrap gap-2 border-t pt-4">
              {canStart && <Button disabled={busy} onClick={() => void start()}><Play /> Iniciar atendimento</Button>}
              {canFinish && <Button disabled={busy} onClick={() => setFinishOpen(true)}><CheckCircle2 /> Finalizar serviço</Button>}
              {canCancel && <Button variant="outline" disabled={busy} onClick={() => void cancel()}><Ban /> Cancelar OS</Button>}
              {canDelete && <Button variant="destructive" disabled={busy} onClick={() => void deleteOrder()}><Trash2 /> Excluir OS</Button>}
            </div>}
          </div>
        </DialogContent>
      </Dialog>
      <FinishDialog open={finishOpen} onOpenChange={setFinishOpen} order={order} actor={actor} onDone={onChanged} />
    </>
  );
}

function FinishDialog({ open, onOpenChange, order, actor, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; order: Ordem; actor: Actor; onDone: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const solucao = String(form.get("solucao") ?? "").trim();
    if (!solucao) {
      toast.error("Descreva o serviço realizado.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("ordens_servico")
      .update({ status: "concluida", notas_fecho: solucao, concluida_em: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "em_andamento")
      .select("id");
    if (error || !data?.length) {
      setSaving(false);
      toast.error(error ? friendlyError(error, "Não foi possível finalizar a OS.") : "Esta OS já não está em andamento.");
      return;
    }
    await logHistory(order.id, actor, "finalizada", `Finalizada por ${actor.email}: ${solucao}`);
    setSaving(false);
    toast.success(`OS ${order.numero_os} finalizada.`);
    onOpenChange(false);
    await onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar OS {order.numero_os}</DialogTitle>
          <DialogDescription>Registe o que foi feito para concluir o serviço.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="solucao">Serviço realizado / solução técnica *</Label>
            <Textarea id="solucao" name="solucao" required rows={4} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A gravar…" : "Concluir serviço"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    pendente: "bg-accent text-accent-foreground",
    em_andamento: "bg-primary text-primary-foreground",
    concluida: "bg-secondary text-secondary-foreground",
    cancelada: "bg-destructive/10 text-destructive",
  };
  return <span className={`shrink-0 rounded-sm px-2 py-1 text-xs font-semibold ${styles[status] ?? styles.pendente}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function PartsCatalogDialog() {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Array<Peca & { estoque_atual: number; estoque_minimo: number }>>([]);
  const [name, setName] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [replenish, setReplenish] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadParts() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("pecas_catalogo").select("*").order("nome", { ascending: true });
    setLoading(false);
    if (error) { toast.error("Não foi possível carregar o estoque de peças."); return; }
    setParts((data ?? []) as Array<Peca & { estoque_atual: number; estoque_minimo: number }>);
  }

  async function addPart(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const stock = Math.max(0, Math.floor(Number(initialStock) || 0));
    if (!trimmed) { toast.error("Informe o nome da peça."); return; }
    setSaving(true);
    const user = (await supabase.auth.getUser()).data.user;
    const { data, error } = await (supabase as any).from("pecas_catalogo").insert({
      nome: trimmed,
      estoque_atual: stock,
      estoque_minimo: 3,
      criado_por_email: user?.email ?? null,
    }).select("*").single();
    setSaving(false);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message) ? "Essa peça já está cadastrada." : "Não foi possível adicionar a peça: " + error.message);
      return;
    }
    setParts(current => [...current, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setName("");
    setInitialStock("0");
    toast.success(`Peça adicionada com ${stock} unidade(s) em estoque.`);
  }

  async function addStock(part: Peca & { estoque_atual: number; estoque_minimo: number }) {
    const quantity = Math.max(0, Math.floor(Number(replenish[part.id] || 0)));
    if (!quantity) { toast.error("Informe quantas unidades deseja adicionar."); return; }
    const nextStock = part.estoque_atual + quantity;
    const { data, error } = await (supabase as any)
      .from("pecas_catalogo")
      .update({ estoque_atual: nextStock, updated_at: new Date().toISOString() })
      .eq("id", part.id)
      .select("*")
      .single();
    if (error) { toast.error("Não foi possível atualizar o estoque: " + error.message); return; }
    setParts(current => current.map(item => item.id === part.id ? data : item));
    setReplenish(current => ({ ...current, [part.id]: "" }));
    toast.success(`Estoque de ${part.nome} atualizado para ${nextStock} unidade(s).`);
  }

  async function removePart(part: Peca) {
    const { error } = await (supabase as any).from("pecas_catalogo").delete().eq("id", part.id);
    if (error) { toast.error("Não foi possível excluir a peça."); return; }
    setParts(current => current.filter(item => item.id !== part.id));
    toast.success("Peça removida do catálogo.");
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) void loadParts(); }}>
    <DialogTrigger asChild><Button variant="outline"><PackagePlus /> Estoque / Peças</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Controle de estoque de peças</DialogTitle>
        <DialogDescription>Cadastre as peças, informe o estoque inicial e reponha o estoque quando necessário. O sistema baixa automaticamente as peças usadas nas OS.</DialogDescription>
      </DialogHeader>
      <form onSubmit={addPart} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Correia do alternador" className="h-11" />
        <Input type="number" min="0" step="1" value={initialStock} onChange={(event) => setInitialStock(event.target.value)} placeholder="Estoque inicial" className="h-11" />
        <Button type="submit" disabled={saving || !name.trim()} className="h-11">{saving ? "Adicionando..." : "Adicionar peça"}</Button>
      </form>
      <div className="rounded-2xl border bg-muted/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Estoque atual</h3><span className="text-xs text-muted-foreground">{parts.length} item(ns)</span></div>
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando estoque...</p>}
        {!loading && !parts.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma peça cadastrada.</p>}
        {!loading && parts.length > 0 && <div className="space-y-2">{parts.map(part => {
          const low = part.estoque_atual <= (part.estoque_minimo ?? 3);
          return <div key={part.id} className="rounded-2xl border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="truncate font-semibold">{part.nome}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className="font-bold">Disponível: {part.estoque_atual}</span><span className="text-muted-foreground">Mínimo: {part.estoque_minimo ?? 3}</span>{low && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 font-black text-destructive"><AlertTriangle className="size-3" /> ESTOQUE BAIXO</span>}</div></div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive" onClick={() => void removePart(part)}>Excluir</Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Input type="number" min="1" step="1" value={replenish[part.id] ?? ""} onChange={(event) => setReplenish(current => ({ ...current, [part.id]: event.target.value }))} placeholder="Qtd. para adicionar" className="h-10" />
              <Button type="button" variant="outline" className="h-10 whitespace-nowrap" onClick={() => void addStock(part)}>+ Adicionar estoque</Button>
            </div>
          </div>;
        })}</div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TechnicianManagerDialog({ team, actor, onChanged }: { team: TeamMember[]; actor: Actor; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [adminAccess, setAdminAccess] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const canManage = actor.email.trim().toLowerCase() === "faber.alexsandro2011@gmail.com";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const nome = String(form.get("nome") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!nome || !email || password.length < 8) {
      toast.error("Preencha o nome, um e-mail válido e uma palavra-passe com pelo menos 8 caracteres.");
      return;
    }

    setSaving(true);

    let result: Awaited<ReturnType<typeof createTeamUser>>;
    try {
      result = await createTeamUser({ data: { nome, email, password, adminAccess } });
    } catch (requestError) {
      console.error("[createTeamUser]", requestError);
      setSaving(false);
      const msg = requestError instanceof Error ? requestError.message : "";
      toast.error(msg.includes("Unauthorized") ? "Sua sessão expirou. Saia e entre novamente." : msg || "Não foi possível cadastrar o usuário.");
      return;
    }
    if (!result.ok) {
      setSaving(false);
      toast.error(result.error);
      return;
    }

    setSaving(false);
    formEl.reset();
    setEmailValue("");
    setAdminAccess(false);
    toast.success(adminAccess ? "Administrador cadastrado." : "Técnico cadastrado e pronto para acesso.");
    await onChanged();
  }

  async function changeRole(member: TeamMember) {
    if (!canManage) {
      toast.error("Somente o administrador principal pode alterar privilégios.");
      return;
    }
    if (member.profile.id === actor.id) {
      toast.error("A conta principal não pode ter o próprio privilégio alterado.");
      return;
    }
    const nextRole = member.role === "gestor" ? "tecnico" : "gestor";
    if (!confirm(nextRole === "gestor" ? "Tornar administrador " + (member.profile.nome || member.profile.email) + "?" : "Retirar administrador de " + (member.profile.nome || member.profile.email) + "?")) return;

    setBusyId(member.profile.id);
    try {
      const result = await updateTeamUser({ data: { userId: member.profile.id, nome: member.profile.nome || member.profile.email || "Usuário", password: "", role: nextRole } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(nextRole === "gestor" ? "Técnico promovido a administrador." : "Administrador voltou a ser técnico.");
      await onChanged();
    } catch (error) {
      console.error("[changeRole]", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a função.");
    } finally { setBusyId(null); }
  }

  async function editTechnician(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMember || !canManage) return;
    const form = new FormData(event.currentTarget);
    const nome = String(form.get("edit_nome") ?? "").trim();
    const password = String(form.get("edit_password") ?? "").trim();
    if (!nome) {
      toast.error("Informe o nome do técnico.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setBusyId(editMember.profile.id);
    try {
      const result = await updateTeamUser({
        data: { userId: editMember.profile.id, nome, password },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(password ? "Nome e senha do técnico atualizados." : "Nome do técnico atualizado.");
      setEditMember(null);
      await onChanged();
    } catch (error) {
      console.error("[updateTeamUser]", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível editar o técnico.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAccess(member: TeamMember) {
    if (!canManage) {
      toast.error("Somente o administrador principal pode excluir acessos.");
      return;
    }
    if (member.profile.id === actor.id) {
      toast.error("A conta principal não pode ser excluída.");
      return;
    }
    if (!confirm(`Excluir o acesso de ${member.profile.nome || member.profile.email}? A conta de autenticação continuará existente, mas ficará sem acesso ao sistema.`)) return;

    setBusyId(member.profile.id);
    try {
      const result = await deleteTeamUser({ data: { userId: member.profile.id } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Técnico excluído do sistema.");
      await onChanged();
    } catch (error) {
      console.error("[deleteTeamUser]", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o técnico.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {canManage && (
        <DialogTrigger asChild><Button variant="outline"><UserRound /> Técnicos</Button></DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Técnicos e administradores</DialogTitle>
          <DialogDescription>Cadastre novos técnicos, veja a equipa e altere o nível de acesso.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="size-5 text-primary" />
            <div>
              <h3 className="font-semibold">Cadastrar técnico</h3>
              <p className="text-xs text-muted-foreground">O novo acesso entra como técnico. Você também pode cadastrá-lo como administrador.</p>
            </div>
          </div>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nome"><Input name="nome" required placeholder="Nome completo" autoComplete="name" /></Field>
              <Field label="E-mail"><Input name="email" type="email" required placeholder="tecnico@empresa.com" autoComplete="email" value={emailValue} onChange={(event) => setEmailValue(event.target.value.toLowerCase())} /></Field>
              <Field label="Palavra-passe inicial"><Input name="password" type="password" required minLength={8} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" /></Field>
            </div>
            {canManage && <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm">
              <input type="checkbox" checked={adminAccess} onChange={(event) => setAdminAccess(event.target.checked)} className="size-4 accent-primary" />
              <span><strong>Cadastrar como administrador</strong><span className="ml-1 text-xs text-muted-foreground">— terá acesso ao Painel Central</span></span>
            </label>}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>{saving ? "A cadastrar..." : "Cadastrar"}</Button>
            </div>
          </form>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Lista da equipa</h3>
              <p className="text-xs text-muted-foreground">{team.length} {team.length === 1 ? "utilizador" : "utilizadores"} cadastrados</p>
            </div>
            {canManage && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Gestão de acesso</span>}
          </div>
          {!team.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum técnico cadastrado.</div>}
          {team.map((member) => {
            const isOwner = member.profile.id === actor.id;
            const busy = busyId === member.profile.id;
            return (
              <div key={member.profile.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <UserRound className="size-4 text-primary" />
                    <span className="truncate">{member.profile.nome || member.profile.email}</span>
                    <span className={member.role === "gestor" ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary" : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"}>
                      {member.role === "gestor" ? "ADMIN" : "TÉCNICO"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">{member.profile.email}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && !isOwner && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditMember(member)}>
                    <Pencil /> Editar
                  </Button>}
                  {canManage && !isOwner && <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeRole(member)}>
                    <ShieldCheck /> {member.role === "gestor" ? "Tornar técnico" : "Tornar ADM"}
                  </Button>}
                  {isOwner && <span className="self-center text-xs font-medium text-muted-foreground">Administrador principal</span>}
                  {!isOwner && <Button size="sm" variant="destructive" disabled={busy || !canManage} onClick={() => void removeAccess(member)}>
                    <Trash2 /> Excluir acesso
                  </Button>}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button></DialogFooter>
        <Dialog open={!!editMember} onOpenChange={(value) => { if (!value) setEditMember(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar técnico</DialogTitle>
              <DialogDescription>
                Altere o nome e, se necessário, defina uma nova senha para {editMember?.profile.email}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={editTechnician} className="grid gap-4">
              <Field label="Nome do técnico">
                <Input name="edit_nome" defaultValue={editMember?.profile.nome ?? ""} required autoComplete="name" />
              </Field>
              <Field label="Nova senha">
                <Input name="edit_password" type="password" minLength={8} placeholder="Deixe em branco para manter a senha atual" autoComplete="new-password" />
              </Field>
              <p className="text-xs text-muted-foreground">A senha deve ter pelo menos 8 caracteres. O e-mail do técnico não será alterado.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditMember(null)}>Cancelar</Button>
                <Button type="submit" disabled={!!busyId}>{busyId ? "Salvando..." : "Salvar alterações"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ open, onOpenChange, technicians, creator, onCreated }: { open: boolean; onOpenChange: (value: boolean) => void; technicians: Perfil[]; creator: Actor; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [technicianId, setTechnicianId] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const technician = technicians.find((item) => item.id === technicianId);
    if (!technician) {
      toast.error("Selecione um técnico.");
      return;
    }
    setSaving(true);
    const numero_os = String(form.get("numero_os") ?? "").trim();
    const payload = {
      numero_os,
      frota: String(form.get("frota") ?? "").trim(),
      localizacao: String(form.get("localizacao") ?? "").trim() || null,
      descricao: String(form.get("descricao") ?? "").trim() || null,
      tecnico_id: technician.id,
      tecnico_email: technician.email,
      tecnico_nome: technician.nome || technician.email,
      criado_por_email: creator.email,
      status: "pendente",
    };

    const { data: existing, error: lookupError } = await supabase
      .from("ordens_servico")
      .select("id, tecnico_email, tecnico_nome")
      .eq("numero_os", numero_os)
      .maybeSingle();

    if (lookupError) {
      setSaving(false);
      toast.error("Não foi possível consultar a OS existente.");
      return;
    }

    if (existing) {
      const { error } = await supabase
        .from("ordens_servico")
        .update(payload)
        .eq("id", existing.id);

      setSaving(false);
      if (error) {
        toast.error("Não foi possível atualizar a OS.");
        return;
      }

      try {
        await logHistory(existing.id, creator, "atualizada", `OS ${numero_os} atualizada e atribuída a ${technician.nome || technician.email}`);
        if (existing.tecnico_email !== technician.email) {
          await logHistory(existing.id, creator, "enviada", `Transferida para ${technician.nome || technician.email}`);
        }
      } catch (historyError) {
        console.error("[OS] Falha ao registrar histórico:", historyError);
        toast.warning("OS atualizada, mas o histórico não foi registrado.");
      }

      toast.success(`OS ${numero_os} atualizada e transferida para ${technician.nome || technician.email}.`);
    } else {
      const { data: created, error } = await supabase
        .from("ordens_servico")
        .insert(payload)
        .select("id")
        .single();

      setSaving(false);
      if (error) {
        toast.error("Não foi possível criar a ordem.");
        return;
      }

      try {
        await logHistory(created.id, creator, "aberta", `OS aberta por ${creator.email}`);
        await logHistory(created.id, creator, "enviada", `Enviada para ${technician.nome || technician.email}`);
      } catch (historyError) {
        console.error("[OS] Falha ao registrar histórico:", historyError);
        toast.warning("OS criada, mas o histórico não foi registrado.");
      }

      toast.success(`OS ${numero_os} criada e enviada para ${technician.nome || technician.email}.`);
    }
    onOpenChange(false);
    setTechnicianId("");
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Abrir ordem de serviço</DialogTitle><DialogDescription>Registe o trabalho e atribua-o a um técnico.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Número da OS"><Input name="numero_os" required placeholder="OS-2026-001" /></Field><Field label="Frota"><Input name="frota" required placeholder="FT-024" /></Field></div>
          <Field label="Localização"><Input name="localizacao" placeholder="Oficina Norte" /></Field>
          <Field label="Técnico"><Select value={technicianId} onValueChange={setTechnicianId}><SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger><SelectContent>{technicians.map((person) => <SelectItem key={person.id} value={person.id}>{person.nome || person.email} · {person.email}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Descrição do problema"><Textarea name="descricao" rows={4} placeholder="Descreva o problema identificado..." /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Criar ordem"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasteOrdersDialog({ open, onOpenChange, technicians, creator, onImported }: { open: boolean; onOpenChange: (value: boolean) => void; technicians: Perfil[]; creator: Actor; onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function upsertImportedOrders(payload: Array<Record<string, unknown>>) {
    let updatedCount = 0;
    let createdCount = 0;
    const unique = new Map<string, any>();
    for (const item of payload) unique.set(String(item["numero_os"]).trim(), item);
    for (const item of unique.values()) {
      const { data: existing, error: lookupError } = await supabase.from("ordens_servico").select("id, tecnico_email, tecnico_nome").eq("numero_os", String(item.numero_os)).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { error } = await supabase.from("ordens_servico").update(item).eq("id", existing.id);
        if (error) throw error;
        updatedCount++;
        await logHistory(existing.id, creator, "atualizada", "OS " + item.numero_os + " atualizada via importação por " + creator.email);
        if (item.tecnico_email && item.tecnico_email !== existing.tecnico_email) {
          const de = existing.tecnico_nome || existing.tecnico_email;
          const para = String(item.tecnico_nome || item.tecnico_email);
          await logHistory(existing.id, creator, "transferida", de ? "Transferida de " + de + " para " + para : "Enviada para " + para);
        }
      } else {
        const { data: created, error } = await supabase.from("ordens_servico").insert(item).select("id, tecnico_nome, tecnico_email").single();
        if (error) throw error;
        createdCount++;
        await logHistory(created.id, creator, "aberta", "OS aberta por " + creator.email + " via importação");
        if (created.tecnico_email) await logHistory(created.id, creator, "enviada", "Enviada para " + (created.tecnico_nome || created.tecnico_email));
      }
    }
    return { updatedCount, createdCount };
  }

  async function importPastedRows(value: string) {
    const lines = value.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) {
      toast.error("Cole primeiro as linhas do Excel.");
      return;
    }

    const matrix = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
    const first = matrix[0] ?? [];
    const normalizedHeaders = first.map((cell) => normKey(cell));
    const hasHeader = normalizedHeaders.some((key) => key.includes("frota") || key.includes("numero") || key === "os");
    const headers = hasHeader
      ? first.map((cell, index) => cell || `col_${index}`)
      : ["numero_os", "frota", "localizacao", "descricao", "tecnico_email", "entrada"];
    const dataRows = hasHeader ? matrix.slice(1) : matrix;
    const records = dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    const rows = records.map((record) => normalizeImportRow(record, technicians));
    const validRows = rows.filter((row) => row.valid);

    if (!validRows.length) {
      toast.error("Nenhuma linha válida. Confira o número da OS e a frota.");
      return;
    }

    setSaving(true);
    const payload = validRows.map((row) => {
      const technician = findTechnician(row.tecnico_email, technicians);
      return {
        numero_os: row.numero_os,
        entrada: row.entrada || null,
        frota: row.frota,
        localizacao: row.localizacao || null,
        descricao: row.descricao || null,
        tecnico_id: technician?.id ?? null,
        tecnico_email: technician?.email ?? null,
        tecnico_nome: technician?.nome ?? technician?.email ?? null,
        criado_por_email: creator.email,
        status: "pendente",
      };
    });

    try {
      const { createdCount, updatedCount } = await upsertImportedOrders(payload);
      toast.success(createdCount + " nova(s) e " + updatedCount + " atualizada(s). Nenhuma OS duplicada.");
    } catch (error) {
      toast.error("A importação falhou: " + (error instanceof Error ? error.message : "erro desconhecido"));
      setSaving(false);
      return;
    }
    setSaving(false);
    setText("");
    onOpenChange(false);
    await onImported();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar OS do Excel</DialogTitle>
          <DialogDescription>
            No Excel: selecione as linhas, pressione Ctrl+C e depois cole aqui. Não precisa montar arquivo nem preencher os campos um por um.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (pasted) {
              event.preventDefault();
              setText(pasted);
            }
          }}
          rows={10}
          placeholder={"Cole aqui as linhas copiadas do Excel...\n\nExemplo:\n12345\tTR-001\tFazenda Norte\tMotor sem força\ttecnico@empresa.com"}
          className="font-mono text-sm"
        />

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Colunas reconhecidas: <strong>Número da OS · Frota · Localização · Descrição · Técnico · ENTRADA</strong>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setText(""); onOpenChange(false); }}>Cancelar</Button>
          <Button disabled={!text.trim() || saving} onClick={() => void importPastedRows(text)}>
            {saving ? "Adicionando..." : "Colar e adicionar OS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, technicians, creator, onImported }: { open: boolean; onOpenChange: (value: boolean) => void; technicians: Perfil[]; creator: Actor; onImported: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const validRows = rows.filter((row) => row.valid);

  async function pickFile(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O ficheiro excede o limite de 20 MB.");
      return;
    }
    try {
      const workbook = read(await file.arrayBuffer(), { cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("empty");
      const firstSheet = workbook.Sheets[firstSheetName];
      if (!firstSheet) throw new Error("empty");
      // Encontra a linha de cabeçalho (pode não ser a primeira linha da folha)
      const matrix = utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: true });
      let headerIdx = matrix.findIndex((r) => r.map((c) => normKey(String(c))).some((k) => k.includes("frota") || k.includes("numero") || k === "os"));
      if (headerIdx < 0) headerIdx = 0;
      const headers = (matrix[headerIdx] ?? []).map((c, i) => String(c).trim() || `col_${i}`);
      const records = matrix.slice(headerIdx + 1)
        .filter((r) => r.some((c) => String(c).trim() !== ""))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      const normalized = records.map((record) => normalizeImportRow(record, technicians));
      setRows(normalized);
      setFileName(file.name);
      if (!normalized.length) toast.error("O ficheiro não contém linhas de dados.");
    } catch {
      toast.error("Não foi possível ler o ficheiro.");
    }
  }

  async function upsertImportedOrders(payload: Array<Record<string, unknown>>) {
    let updatedCount = 0;
    let createdCount = 0;
    const unique = new Map<string, any>();
    for (const item of payload) unique.set(String(item["numero_os"]).trim(), item);
    for (const item of unique.values()) {
      const { data: existing, error: lookupError } = await supabase.from("ordens_servico").select("id, tecnico_email, tecnico_nome").eq("numero_os", String(item.numero_os)).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { error } = await supabase.from("ordens_servico").update(item).eq("id", existing.id);
        if (error) throw error;
        updatedCount++;
        await logHistory(existing.id, creator, "atualizada", "OS " + item.numero_os + " atualizada via importação por " + creator.email);
        if (item.tecnico_email && item.tecnico_email !== existing.tecnico_email) {
          const de = existing.tecnico_nome || existing.tecnico_email;
          const para = String(item.tecnico_nome || item.tecnico_email);
          await logHistory(existing.id, creator, "transferida", de ? "Transferida de " + de + " para " + para : "Enviada para " + para);
        }
      } else {
        const { data: created, error } = await supabase.from("ordens_servico").insert(item).select("id, tecnico_nome, tecnico_email").single();
        if (error) throw error;
        createdCount++;
        await logHistory(created.id, creator, "aberta", "OS aberta por " + creator.email + " via importação");
        if (created.tecnico_email) await logHistory(created.id, creator, "enviada", "Enviada para " + (created.tecnico_nome || created.tecnico_email));
      }
    }
    return { updatedCount, createdCount };
  }

  async function importRows() {
    if (!validRows.length) return;
    setSaving(true);
    const payload = validRows.map((row) => {
      const technician = findTechnician(row.tecnico_email, technicians);
      return {
        numero_os: row.numero_os,
        entrada: row.entrada || null,
        frota: row.frota,
        localizacao: row.localizacao || null,
        descricao: row.descricao || null,
        tecnico_id: technician?.id ?? null,
        tecnico_email: technician?.email ?? null,
        tecnico_nome: technician?.nome ?? technician?.email ?? null,
      };
    });
    try {
      const { createdCount, updatedCount } = await upsertImportedOrders(payload);
      toast.success(createdCount + " nova(s) e " + updatedCount + " atualizada(s). Nenhuma OS duplicada.");
    } catch (error) {
      toast.error("A importação falhou: " + (error instanceof Error ? error.message : "erro desconhecido"));
      setSaving(false);
      return;
    }
    setSaving(false);
    setRows([]);
    setFileName("");
    onOpenChange(false);
    await onImported();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Importar ordens em lote</DialogTitle><DialogDescription>Use Excel ou CSV com as colunas numero_os, frota, localizacao, descricao, tecnico_email e ENTRADA.</DialogDescription></DialogHeader>
        {!rows.length ? (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-52 w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 p-8 text-center transition-colors hover:bg-muted/60">
            <div className="grid size-12 place-items-center rounded-md bg-background shadow-sm"><FileSpreadsheet className="size-6 text-primary" /></div>
            <span className="mt-4 text-sm font-semibold">Escolher ficheiro Excel ou CSV</span>
            <span className="mt-1 text-xs text-muted-foreground">.xlsx ou .csv · máximo 20 MB</span>
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-medium">{fileName}</div><div className="text-xs text-muted-foreground">{validRows.length} válidas · {rows.length - validRows.length} com erros</div></div><Button variant="ghost" size="icon" onClick={() => { setRows([]); setFileName(""); }} title="Remover ficheiro"><X /></Button></div>
            <div className="mt-3 max-h-72 overflow-auto rounded-md border">
              <table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">Estado</th><th className="p-2">OS</th><th className="p-2">Frota</th><th className="p-2">Técnico</th><th className="p-2">Observação</th></tr></thead><tbody className="divide-y">{rows.slice(0, 100).map((row, index) => <tr key={`${row.numero_os}-${index}`}><td className="p-2">{row.valid ? <CheckCircle2 className="size-4 text-primary" /> : <X className="size-4 text-destructive" />}</td><td className="p-2 font-medium">{row.numero_os || "—"}</td><td className="p-2">{row.frota || "—"}</td><td className="p-2">{row.tecnico_email || "—"}</td><td className="p-2 text-muted-foreground">{row.reason || "Pronta"}</td></tr>)}</tbody></table>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { void pickFile(event.target.files?.[0]); event.target.value = ""; }} />
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!validRows.length || saving} onClick={importRows}>{saving ? "A importar..." : `Importar ${validRows.length || ""}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normKey(key: string) {
  return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pick(clean: Record<string, string>, keys: string[], contains?: string[]) {
  for (const k of keys) if (clean[k]) return clean[k];
  if (contains) for (const [k, v] of Object.entries(clean)) if (v && contains.some((c) => k.includes(c))) return v;
  return "";
}

function normalizePerson(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function findTechnician(value: string, technicians: Perfil[]) {
  const target = normalizePerson(value);
  if (!target) return undefined;

  return technicians.find((item) => {
    const email = normalizePerson(item.email);
    const name = normalizePerson(item.nome || "");
    return target === email || target === name;
  }) ?? technicians.find((item) => {
    const email = normalizePerson(item.email);
    const name = normalizePerson(item.nome || "");
    return target.includes(email) || (name && target.includes(name));
  });
}

function normalizeImportRow(record: Record<string, unknown>, technicians: Perfil[]): ImportRow {
  // A importação nunca depende da posição das colunas: primeiro normalizamos os nomes
  // e depois procuramos cada campo por aliases. Assim "Frota | OS | Técnico" funciona
  // exatamente como "OS | Técnico | Frota".
  const clean: Record<string, string> = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      normKey(key),
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value ?? "").trim(),
    ]),
  );

  const numero = pick(clean, [
    "numero_os", "numero_da_os", "n_os", "no_os", "num_os", "numero", "os",
    "ordem", "ordem_servico", "ordem_de_servico", "ordem_servico_numero",
  ], ["numero_os", "numero", "ordem", "_os", "os_"]);

  const frota = pick(clean, [
    "frota", "frota_numero", "numero_frota", "viatura", "veiculo", "veiculo_frota",
    "matricula", "prefixo", "equipamento",
  ], ["frota", "veiculo", "viatura", "matricula", "prefixo"])
    .replace(/^\s*frota\s*[:#-]?\s*/i, "")
    .trim();

  const entrada = pick(clean, [
    "entrada", "data_entrada", "entrada_data", "data_de_entrada",
  ], ["entrada"]);

  const tecnico = pick(clean, [
    "tecnico_email", "email_tecnico", "tecnico", "tecnico_atribuido",
    "nome_tecnico", "tecnico_nome", "responsavel", "responsavel_tecnico",
    "responsavel_nome", "mecanico", "mecanico_nome", "executor",
  ], ["tecnico", "responsavel", "mecanico", "executor"]);

  const technician = findTechnician(tecnico, technicians);
  const valid = Boolean(numero && frota);
  let reason = "";
  if (!numero && !frota) reason = "Não foi possível identificar OS e frota";
  else if (!numero) reason = "Não foi possível identificar a coluna de OS";
  else if (!frota) reason = "Não foi possível identificar a coluna de frota";
  else if (tecnico && !technician) reason = "Técnico não encontrado — será importada sem técnico";

  return {
    numero_os: numero,
    frota,
    entrada,
    localizacao: pick(clean, ["localizacao", "local", "morada", "endereco", "fazenda"], ["local", "endereco", "fazenda"]),
    descricao: pick(clean, [
      "descricao", "descricao_do_problema", "descricao_problema", "problema",
      "observacoes", "observacao", "servico", "servico_descricao",
    ], ["descri", "problema", "observ", "servico"]),
    tecnico_email: technician?.email ?? tecnico,
    valid,
    ...(reason ? { reason } : {}),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />A carregar ordens...</div></div>;
}