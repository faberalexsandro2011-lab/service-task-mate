import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Play,
  Plus,
  Search,
  Upload,
  UserRound,
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

  return {
    user: authData.user,
    role,
    me,
    technicians,
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
  const [technicianOpen, setTechnicianOpen] = useState(false);
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
  const allOrders = data?.orders ?? [];
  // Técnico: "minhas" = atribuídas a si; "fila" = pendentes sem técnico
  const orders = useMemo(() => {
    if (isManager) return allOrders;
    return scope === "minhas"
      ? allOrders.filter((o) => o.tecnico_id === userId)
      : allOrders.filter((o) => !o.tecnico_id && o.status === "pendente");
  }, [allOrders, isManager, scope, userId]);
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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
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

      <main className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-7 lg:hidden">
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
        <div className="mx-auto max-w-[1500px] p-4 sm:p-7 lg:p-9">
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
                <TechnicianDialog open={technicianOpen} onOpenChange={setTechnicianOpen} onCreated={refresh} />
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
            <Metric label="Pendentes" value={orders.filter((o) => o.status === "pendente").length} icon={<Clock />} />
            <Metric label="Em andamento" value={orders.filter((o) => o.status === "em_andamento").length} icon={<Wrench />} accent />
            <Metric label="Concluídas" value={orders.filter((o) => o.status === "concluida").length} icon={<CheckCircle2 />} />
            <Metric label="Canceladas" value={orders.filter((o) => o.status === "cancelada").length} icon={<Ban />} />
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

function Metric({ label, value, icon, accent = false }: { label: string; value: number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-4 shadow-sm">
      <div><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p></div>
      <div className={accent ? "grid size-10 place-items-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5" : "grid size-10 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"}>{icon}</div>
    </div>
  );
}

const fmtDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
function OrderList({ orders, empty, actor, onChanged }: { orders: Ordem[]; empty: string; actor: Actor; onChanged: () => Promise<void> }) {
  if (orders.length === 0) return <div className="rounded-md border border-dashed py-14 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} actor={actor} onChanged={onChanged} />
      ))}
    </div>
  );
}

/** Regista uma entrada no histórico de auditoria da OS. */
async function logHistory(osId: string, actor: Actor, acao: string, detalhe: string) {
  await supabase.from("historico_edicoes").insert({ os_id: osId, acao, detalhe, usuario_id: actor.id, usuario_email: actor.email });
}

function OrderCard({ order, actor, onChanged }: { order: Ordem; actor: Actor; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const status = order.status as Status;
  const isMine = order.tecnico_id === actor.id;
  const canStart = status === "pendente" && (!order.tecnico_id || isMine);
  const canFinish = status === "em_andamento" && (isMine || actor.isManager);
  const canCancel = actor.isManager && (status === "pendente" || status === "em_andamento");

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
    await logHistory(order.id, actor, "iniciada", `Atendimento iniciado por ${actor.email}`);
    setBusy(false);
    toast.success(`OS ${order.numero_os} em andamento.`);
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
    await logHistory(order.id, actor, "cancelada", `Cancelada por ${actor.email}`);
    setBusy(false);
    toast.success(`OS ${order.numero_os} cancelada.`);
    await onChanged();
  }

  return (
    <article className="flex flex-col rounded-md border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">OS {order.numero_os}</div>
          <div className="text-xs text-muted-foreground">Frota {order.frota}</div>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{order.descricao || "Sem descrição"}</p>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex items-center gap-2"><MapPin className="size-3.5 text-muted-foreground" />{order.localizacao || "—"}</div>
        <div className="flex items-center gap-2"><UserRound className="size-3.5 text-muted-foreground" />{order.tecnico_nome || order.tecnico_email || "Sem técnico (fila geral)"}</div>
        <div className="text-muted-foreground">Aberta: {fmtDate(order.created_at)}{order.data_inicio && ` · Início: ${fmtDate(order.data_inicio)}`}{order.concluida_em && ` · Fim: ${fmtDate(order.concluida_em)}`}</div>
      </dl>
      {status === "concluida" && order.notas_fecho && (
        <div className="mt-3 space-y-1 rounded-md bg-muted/60 p-3 text-xs">
          {order.notas_fecho && <p><span className="font-semibold">Solução:</span> {order.notas_fecho}</p>}
        </div>
      )}
      {(canStart || canFinish || canCancel) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          {canStart && <Button size="sm" disabled={busy} onClick={start}><Play /> Iniciar atendimento</Button>}
          {canFinish && <Button size="sm" disabled={busy} onClick={() => setFinishOpen(true)}><CheckCircle2 /> Finalizar serviço</Button>}
          {canCancel && <Button size="sm" variant="outline" disabled={busy} onClick={cancel}><Ban /> Cancelar</Button>}
        </div>
      )}
      <FinishDialog open={finishOpen} onOpenChange={setFinishOpen} order={order} actor={actor} onDone={onChanged} />
    </article>
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

function TechnicianDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (value: boolean) => void; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nome = String(form.get("nome") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!nome || !email || password.length < 8) {
      toast.error("Preencha o nome, um e-mail válido e uma palavra-passe com pelo menos 8 caracteres.");
      return;
    }

    setSaving(true);
    const { data: managerSession } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome }, emailRedirectTo: window.location.origin },
    });

    if (error) {
      setSaving(false);
      toast.error(error.message.toLowerCase().includes("already registered") ? "Este e-mail já possui uma conta." : error.message);
      return;
    }

    const newUser = data.user;
    if (!newUser) {
      setSaving(false);
      toast.error("Não foi possível criar a conta do técnico.");
      return;
    }

    // O signUp pode trocar temporariamente a sessão quando a confirmação de e-mail está desativada.
    // Restauramos imediatamente a sessão do gestor para que ele continue no painel.
    if (managerSession.session && data.session?.user.id === newUser.id) {
      await supabase.auth.setSession({
        access_token: managerSession.session.access_token,
        refresh_token: managerSession.session.refresh_token,
      });
    }

    const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", newUser.id).maybeSingle();
    if (!existingProfile) {
      await supabase.from("profiles").insert({ id: newUser.id, email, nome });
    } else {
      await supabase.from("profiles").update({ email, nome }).eq("id", newUser.id);
    }

    const { data: existingRole } = await supabase.from("user_roles").select("user_id").eq("user_id", newUser.id).maybeSingle();
    if (!existingRole) {
      const { error: roleError } = await supabase.from("user_roles").insert({
        id: crypto.randomUUID(),
        user_id: newUser.id,
        role: "tecnico",
      });
      if (roleError) {
        console.error("[Cadastro técnico] Falha ao definir função:", roleError);
        setSaving(false);
        toast.error("Conta criada, mas não foi possível definir a função de técnico. Verifique as permissões do gestor.");
        return;
      }
    }

    setSaving(false);
    event.currentTarget.reset();
    onOpenChange(false);
    toast.success(data.session ? "Técnico cadastrado e pronto para acesso." : "Técnico cadastrado. Ele deverá confirmar o e-mail antes do primeiro acesso.");
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button variant="outline"><UserRound /> Cadastrar técnico</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar técnico</DialogTitle>
          <DialogDescription>Crie o acesso do técnico sem sair da conta do gestor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Nome do técnico"><Input name="nome" required placeholder="Nome completo" autoComplete="name" /></Field>
          <Field label="E-mail"><Input name="email" type="email" required placeholder="tecnico@empresa.com" autoComplete="email" /></Field>
          <Field label="Palavra-passe inicial"><Input name="password" type="password" required minLength={8} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" /></Field>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">A conta será criada com a função <strong>técnico</strong>. Se a confirmação de e-mail estiver ativa, o técnico receberá a confirmação antes de entrar.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A criar..." : "Cadastrar técnico"}</Button>
          </DialogFooter>
        </form>
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
    const { data: created, error } = await supabase.from("ordens_servico").insert({
      numero_os: String(form.get("numero_os") ?? "").trim(),
      frota: String(form.get("frota") ?? "").trim(),
      localizacao: String(form.get("localizacao") ?? "").trim() || null,
      descricao: String(form.get("descricao") ?? "").trim() || null,
      tecnico_id: technician.id,
      tecnico_email: technician.email,
      tecnico_nome: technician.nome || technician.email,
      criado_por_email: creator.email,
      status: "pendente",
    }).select("id");
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Já existe uma OS com esse número." : "Não foi possível criar a ordem.");
      return;
    }
    if (created?.[0]?.id) {
      await logHistory(created[0].id, creator, "aberta", `OS aberta por ${creator.email}`);
      await logHistory(created[0].id, creator, "enviada", `Enviada para ${technician.nome || technician.email}`);
    }
    toast.success(`Enviada para ${technician.nome || technician.email}.`);
    onOpenChange(false);
    setTechnicianId("");
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button><Plus /> Nova OS</Button></DialogTrigger>
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

  async function importRows() {
    if (!validRows.length) return;
    setSaving(true);
    const payload = validRows.map((row) => {
      const technician = technicians.find((item) => item.email.toLowerCase() === row.tecnico_email.toLowerCase());
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
    const { data: created, error } = await supabase.from("ordens_servico").insert(payload).select("id, tecnico_nome, tecnico_email");
    setSaving(false);
    if (error) {
      console.error("Import error", error);
      const msg = error.code === "23505" ? "Já existe uma OS com um destes números." : error.code === "42501" ? "Sem permissão: apenas gestores podem importar." : error.message;
      toast.error(`A importação falhou: ${msg}`);
      return;
    }
    if (created?.length) {
      await Promise.all(created.map((row) => logHistory(row.id, creator, "aberta", `OS aberta por ${creator.email} via importação`)));
      await Promise.all(created.filter((row) => row.tecnico_email).map((row) => logHistory(row.id, creator, "enviada", `Enviada para ${row.tecnico_nome || row.tecnico_email}`)));
    }
    toast.success(`${payload.length} ${payload.length === 1 ? "ordem importada" : "ordens importadas"} e registada no histórico.`);
    setRows([]);
    setFileName("");
    onOpenChange(false);
    await onImported();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button variant="outline"><Upload /> Importar ficheiro</Button></DialogTrigger>
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

function normalizeImportRow(record: Record<string, unknown>, technicians: Perfil[]): ImportRow {
  const clean: Record<string, string> = Object.fromEntries(Object.entries(record).map(([key, value]) => [normKey(key), String(value ?? "").trim()]));
  const numero = pick(clean, ["numero_os", "numero_da_os", "n_os", "no_os", "num_os", "numero", "os", "ordem", "ordem_servico", "ordem_de_servico"], ["numero", "ordem"]);
  const frota = pick(clean, ["frota", "viatura", "veiculo", "matricula"], ["frota"]);
  const tecnico = pick(clean, ["tecnico_email", "email_tecnico", "tecnico", "email", "tecnico_atribuido"], ["tecnico", "email"]);
  const valid = Boolean(numero && frota);
  let reason = "";
  if (!numero && !frota) reason = "Linha sem número da OS e frota";
  else if (!numero) reason = "Falta o número da OS";
  else if (!frota) reason = "Falta a frota";
  else if (tecnico && !technicians.some((item) => item.email.toLowerCase() === tecnico.toLowerCase())) reason = "Técnico não encontrado — será importada sem técnico";
  return { numero_os: numero, frota, localizacao: pick(clean, ["localizacao", "local", "morada"], ["local"]), descricao: pick(clean, ["descricao", "descricao_do_problema", "descricao_problema", "problema", "observacoes"], ["descri", "problema"]), tecnico_email: tecnico, valid, ...(reason ? { reason } : {}) };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />A carregar ordens...</div></div>;
}