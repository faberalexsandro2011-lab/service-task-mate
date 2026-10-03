import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  ClipboardPaste,
  Clock,
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
  History,
  Wifi,
  WifiOff,
  Wrench,
  X,
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
type Perfil = Tables<"profiles">;
type ImportRow = {
  numero_os: string;
  frota: string;
  localizacao: string;
  descricao: string;
  tecnico_email: string;
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
  const technicians = profileResult.data.filter((profile) =>
    roleResult.data.some((item) => item.user_id === profile.id && item.role === "tecnico"),
  );
  const me = profileResult.data.find((profile) => profile.id === authData.user.id);
  const team = profileResult.data
    .map((profile) => ({ profile, role: roleResult.data.find((item) => item.user_id === profile.id)?.role ?? "tecnico" }))
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
const OWNER_ADMIN_EMAIL = "faber.alexsandro2011@gmail.com";

/** Traduz erros do backend para mensagens claras, incluindo falhas de permissão. */
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

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
    name: data.me?.nome ?? data.user.email ?? "",
    isManager,
  };
  const connected = online && live;

  const tabs: { value: string; label: string; list: Ordem[] }[] = [
    { value: "todas", label: "Todas", list: filtered },
    { value: "pendente", label: "Pendentes", list: byStatus("pendente") },
    { value: "em_andamento", label: "Em andamento", list: byStatus("em_andamento") },
    { value: "concluida", label: "Concluídas", list: byStatus("concluida") },
    { value: "cancelada", label: "Canceladas", list: byStatus("cancelada") },
  ];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="hidden border-r bg-sidebar lg:flex lg:min-h-screen lg:flex-col">
        <Brand />
        <nav className="flex-1 px-3 py-7">
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase text-muted-foreground">Área de trabalho</div>
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent px-3 py-2.5 text-sm font-medium text-sidebar-accent-foreground">
            <ClipboardList className="size-4" /> Ordens de serviço
          </div>
          {isManager && (
            <button type="button" onClick={() => void navigate({ to: "/historico" })} className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <History className="size-4" /> Histórico
            </button>
          )}
        </nav>
        <UserPanel name={actor.name || "Utilizador"} email={actor.email} role={data.role} onSignOut={signOut} />
      </aside>

      <main className="min-w-0 dashboard-modern">
        <header className="flex h-14 items-center justify-between border-b px-3 sm:px-5 lg:hidden">
          <Brand compact />
          <div className="flex items-center gap-2">
            <ConnectionPill connected={connected} online={online} />
            <Button variant="ghost" size="icon" onClick={signOut} title="Terminar sessão"><LogOut /></Button>
          </div>
        </header>
        {!online && (
          <div className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
            Sem ligação à internet. As alterações serão mostradas quando a ligação voltar.
          </div>
        )}
        <div className="mx-auto w-full max-w-[1800px] p-3 sm:p-5 lg:p-6 agri-fade-up">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-3">
                <Tractor className="size-5 text-[var(--agri-leaf)]" />
                <p className="text-sm font-medium text-muted-foreground">{isManager ? "Painel central" : "Área do técnico"}</p>
                <span className="hidden lg:inline-flex"><ConnectionPill connected={connected} online={online} /></span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-normal sm:text-3xl">Ordens de serviço</h1>
              <p className="mt-2 text-sm text-muted-foreground">{isManager ? "Acompanhe e distribua o trabalho da equipa." : "Inicie e finalize os seus atendimentos."}</p>
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2">
                {userEmail === OWNER_ADMIN_EMAIL && <TechnicianManagerDialog team={data.team} actor={actor} onChanged={refresh} />}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
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
                        <span className="font-bold">Criar OS</span>
                        <span className="text-xs font-normal opacity-80">Cadastrar uma ordem</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-28 flex-col gap-2 rounded-xl p-4"
                        onClick={() => setImportOpen(true)}
                      >
                        <Upload className="size-7" />
                        <span className="font-bold">Importar planilha</span>
                        <span className="text-xs font-normal text-muted-foreground">Excel ou CSV</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-28 flex-col gap-2 rounded-xl p-4"
                        onClick={() => setPasteOpen(true)}
                      >
                        <ClipboardPaste className="size-7" />
                        <span className="font-bold">Colar planilha</span>
                        <span className="text-xs font-normal text-muted-foreground">Copiar e colar do Excel</span>
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

          <section className="mt-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Metric label="Pendentes" value={orders.filter((o) => o.status === "pendente").length} icon={<Clock />} tone="pending" />
            <Metric label="Em andamento" value={orders.filter((o) => o.status === "em_andamento").length} icon={<Wrench />} tone="progress" />
            <Metric label="Concluídas" value={orders.filter((o) => o.status === "concluida").length} icon={<CheckCircle2 />} tone="done" />
            <Metric label="Canceladas" value={orders.filter((o) => o.status === "cancelada").length} icon={<Ban />} tone="cancelled" />
          </section>

          <section className="mt-7 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b bg-gradient-to-r from-primary/10 via-card to-[var(--agri-wheat)]/10 p-4 sm:p-6">
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
                <div className="relative w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar OS, frota ou técnico..." className="h-11 bg-background pl-9 shadow-sm" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {tabs.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setActiveTab(t.value)}
                    className={activeTab === t.value ? "group rounded-lg border border-primary bg-primary p-3 text-left text-primary-foreground shadow-md transition-all duration-200" : "group rounded-lg border bg-background/80 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"}
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-80">{t.label}</span>
                    <span className="mt-1 block text-2xl font-bold tabular-nums">{t.list.length}</span>
                  </button>
                ))}
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="sr-only">
                {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              </TabsList>
              {tabs.map((t) => (
                <TabsContent key={t.value} value={t.value} className="m-0 p-4 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-xs text-muted-foreground">Mostrando {t.list.length} {t.list.length === 1 ? "registro" : "registros"}</p>
                    </div>
                    {search && <Button variant="ghost" size="sm" onClick={() => setSearch("")}>Limpar pesquisa <X /></Button>}
                  </div>
                  <OrderList orders={t.list} empty="Não existem ordens nesta vista." actor={actor} onChanged={refresh} />
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </div>
      </main>
    </div>
  );
}

function ConnectionPill({ connected, online }: { connected: boolean; online: boolean }) {
  return (
    <span className={connected ? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary" : "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"}>
      {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {connected ? "Online" : online ? "A ligar…" : "Offline"}
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-2" : "flex h-20 items-center gap-3 border-b px-6"}>
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
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{name}</div><div className="truncate text-xs text-muted-foreground">{email}</div></div>
        <Button variant="ghost" size="icon" onClick={onSignOut} title="Terminar sessão"><LogOut /></Button>
      </div>
      <div className="mt-3 inline-flex rounded-sm bg-secondary px-2 py-1 text-[11px] font-semibold uppercase text-secondary-foreground">{role}</div>
    </div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "pending" | "progress" | "done" | "cancelled" }) {
  const styles = {
    pending: {
      card: "border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20",
      icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    progress: {
      card: "border-blue-200/70 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20",
      icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    done: {
      card: "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20",
      icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    },
    cancelled: {
      card: "border-rose-200/70 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/20",
      icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    },
  }[tone];

  return (
    <div className={`flex min-h-16 items-center justify-between rounded-xl border px-3 py-2.5 shadow-sm transition-transform hover:-translate-y-0.5 ${styles.card}`}>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-extrabold tabular-nums">{value}</p>
      </div>
      <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${styles.icon} [&_svg]:size-4`}>{icon}</div>
    </div>
  );
}

const fmtDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
function OrderList({ orders, empty, actor, onChanged }: { orders: Ordem[]; empty: string; actor: Actor; onChanged: () => Promise<void> }) {
  if (orders.length === 0) {
    return <div className="rounded-xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">Ordens de serviço</p>
          <p className="text-xs text-muted-foreground">{orders.length} {orders.length === 1 ? "ordem encontrada" : "ordens encontradas"}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
          <span className="rounded-full bg-accent px-2 py-1 text-accent-foreground">Pendente</span>
          <span className="rounded-full bg-primary px-2 py-1 text-primary-foreground">Em andamento</span>
          <span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">Finalizada</span>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(130px,0.9fr)_minmax(90px,0.6fr)_minmax(170px,1.1fr)_minmax(240px,1.8fr)_minmax(120px,0.8fr)_115px_220px] items-center gap-3 border-b bg-muted/30 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <span>OS</span>
          <span>Frota</span>
          <span>Técnico</span>
          <span>Serviço</span>
          <span>Status</span>
          <span>Abertura</span>
          <span className="text-right">Ações</span>
        </div>
        <div className="divide-y">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} actor={actor} onChanged={onChanged} />
          ))}
        </div>
      </div>

      <div className="divide-y md:hidden">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} actor={actor} onChanged={onChanged} />
        ))}
      </div>
    </section>
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
  const label = String(value || "—").trim();
  return (
    <span
      title={`Frota ${label}`}
      className={compact
        ? "inline-flex max-w-[150px] items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-primary/15"
        : "inline-flex max-w-[180px] items-center rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-sm font-extrabold text-primary shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-primary/15"}
    >
      <span className="mr-1 shrink-0 opacity-70">Frota</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function OrderCard({ order, actor, onChanged }: { order: Ordem; actor: Actor; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const status = order.status as Status;
  const isMine = order.tecnico_id === actor.id;
  const canStart = status === "pendente" && (!order.tecnico_id || isMine);
  const canFinish = status === "em_andamento" && (isMine || actor.isManager);
  const canCancel = actor.isManager && (status === "pendente" || status === "em_andamento");
  const canDelete = actor.email.trim().toLowerCase() === OWNER_ADMIN_EMAIL;

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
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canStart && (
        <Button size="sm" className="h-8 px-2.5" disabled={busy} onClick={(event) => { event.stopPropagation(); void start(); }}>
          <Play /> Iniciar
        </Button>
      )}
      {canFinish && (
        <Button size="sm" className="h-8 px-2.5" disabled={busy} onClick={(event) => { event.stopPropagation(); setFinishOpen(true); }}>
          <CheckCircle2 /> Finalizar
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" className="h-8 px-2.5" disabled={busy} onClick={(event) => { event.stopPropagation(); void cancel(); }}>
          <Ban /> Cancelar
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="destructive" className="h-8 px-2.5" disabled={busy} onClick={(event) => { event.stopPropagation(); void deleteOrder(); }}>
          <Trash2 /> Excluir
        </Button>
      )}
    </div>
  );

  return (
    <>
      <article
        className="group cursor-pointer transition-colors hover:bg-muted/20"
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
        <div className="hidden grid-cols-[minmax(130px,0.9fr)_minmax(90px,0.6fr)_minmax(170px,1.1fr)_minmax(240px,1.8fr)_minmax(120px,0.8fr)_115px_220px] items-center gap-3 px-4 py-3.5 md:grid">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="size-3.5" /></span><p className="truncate text-lg font-black text-primary">Frota {order.frota}</p></div>
          </div>
          <p className="truncate text-xs font-medium text-muted-foreground">OS {order.numero_os}</p>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{order.tecnico_nome || order.tecnico_email || "Fila geral"}</p>
            {order.tecnico_email && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{order.tecnico_email}</p>}
          </div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{order.descricao || "Sem descrição"}</p></div>
          <div><StatusBadge status={status} /></div>
          <p className="text-[11px] text-muted-foreground">{fmtDate(order.created_at)}</p>
          <div onClick={(event) => event.stopPropagation()}>{actionButtons}</div>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-black text-primary">Frota {order.frota}</p>
                <StatusBadge status={status} />
              </div>
              <p className="mt-1 text-xs font-medium text-muted-foreground">OS {order.numero_os}</p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDate(order.created_at)}</span>
          </div>
          <div className="grid gap-2.5 text-xs">
            <div className="flex min-w-0 items-center gap-2"><UserRound className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{order.tecnico_nome || order.tecnico_email || "Fila geral"}</span></div>
            <div className="flex min-w-0 items-center gap-2"><MapPin className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{order.localizacao || "Localização não informada"}</span></div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="line-clamp-2 text-sm font-medium leading-5">{order.descricao || "Sem descrição"}</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <button type="button" className="text-xs font-bold text-primary" onClick={(event) => { event.stopPropagation(); setDetailsOpen(true); }}>Ver detalhes →</button>
            <div onClick={(event) => event.stopPropagation()}>{actionButtons}</div>
          </div>
        </div>
      </article>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <div><DialogTitle className="text-xl">OS {order.numero_os}</DialogTitle><DialogDescription className="mt-1">Detalhes completos da ordem de serviço</DialogDescription></div>
              <StatusBadge status={status} />
            </div>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Frota</p><p className="mt-1 font-semibold">{order.frota}</p></div>
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Técnico</p><p className="mt-1 truncate font-semibold">{order.tecnico_nome || order.tecnico_email || "Fila geral"}</p></div>
            </div>
            <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Localização</p><p className="mt-1 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{order.localizacao || "Não informada"}</p></div>
            <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Descrição</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{order.descricao || "Sem descrição."}</p></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-[11px] uppercase text-muted-foreground">Abertura</p><p className="mt-1 text-xs font-medium">{fmtDate(order.created_at)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-[11px] uppercase text-muted-foreground">Início</p><p className="mt-1 text-xs font-medium">{fmtDate(order.data_inicio)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-[11px] uppercase text-muted-foreground">Conclusão</p><p className="mt-1 text-xs font-medium">{fmtDate(order.concluida_em)}</p></div>
            </div>
            {status === "concluida" && order.notas_fecho && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-semibold uppercase text-primary">Serviço realizado</p><p className="mt-1 whitespace-pre-wrap text-sm">{order.notas_fecho}</p></div>}
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
  return <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${styles[status] ?? styles.pendente}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function TechnicianManagerDialog({ team, actor, onChanged }: { team: TeamMember[]; actor: Actor; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [adminAccess, setAdminAccess] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const canManage = actor.email.toLowerCase() === OWNER_ADMIN_EMAIL;

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
    if (member.profile.email.toLowerCase() === OWNER_ADMIN_EMAIL) {
      toast.error("A conta principal não pode ter o próprio privilégio alterado.");
      return;
    }
    const nextRole = member.role === "gestor" ? "tecnico" : "gestor";
    if (!confirm(`${nextRole === "gestor" ? "Tornar administrador" : "Retirar administrador de"} ${member.profile.nome || member.profile.email}?`)) return;

    setBusyId(member.profile.id);
    const { error } = await supabase.from("user_roles").update({ role: nextRole }).eq("user_id", member.profile.id);
    setBusyId(null);
    if (error) {
      toast.error(friendlyError(error, "Não foi possível alterar a função."));
      return;
    }
    toast.success(nextRole === "gestor" ? "Técnico promovido a administrador." : "Administrador voltou a ser técnico.");
    await onChanged();
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
    if (member.profile.email.toLowerCase() === OWNER_ADMIN_EMAIL) {
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
      <DialogTrigger asChild><Button variant="outline"><UserRound /> Técnicos</Button></DialogTrigger>
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
            const isOwner = member.profile.email.toLowerCase() === OWNER_ADMIN_EMAIL;
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
                  <div className="mt-1 truncate text-xs text-muted-foreground">{member.profile.email}</div>
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
    const unique = new Map<string, Record<string, unknown>>();
    for (const item of payload) unique.set(String(item.numero_os).trim(), item);
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
      : ["numero_os", "frota", "localizacao", "descricao", "tecnico_email"];
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
          Ordem das colunas: <strong>Número da OS → Frota → Localização → Descrição → Técnico</strong>
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
      const workbook = read(await file.arrayBuffer());
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("empty");
      const firstSheet = workbook.Sheets[firstSheetName];
      if (!firstSheet) throw new Error("empty");
      // Encontra a linha de cabeçalho (pode não ser a primeira linha da folha)
      const matrix = utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "" });
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
    const unique = new Map<string, Record<string, unknown>>();
    for (const item of payload) unique.set(String(item.numero_os).trim(), item);
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
        <DialogHeader><DialogTitle>Importar ordens em lote</DialogTitle><DialogDescription>Use Excel ou CSV com as colunas numero_os, frota, localizacao, descricao e tecnico_email.</DialogDescription></DialogHeader>
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
    Object.entries(record).map(([key, value]) => [normKey(key), String(value ?? "").trim()]),
  );

  const numero = pick(clean, [
    "numero_os", "numero_da_os", "n_os", "no_os", "num_os", "numero", "os",
    "ordem", "ordem_servico", "ordem_de_servico", "ordem_servico_numero",
  ], ["numero_os", "numero", "ordem", "_os", "os_"]);

  const frota = pick(clean, [
    "frota", "frota_numero", "numero_frota", "viatura", "veiculo", "veiculo_frota",
    "matricula", "prefixo", "equipamento",
  ], ["frota", "veiculo", "viatura", "matricula", "prefixo"]);

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