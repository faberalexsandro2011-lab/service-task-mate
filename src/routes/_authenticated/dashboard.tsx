import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Plus,
  Search,
  Upload,
  UserRound,
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

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardData });

  const data = dashboardQuery.data;
  const orders = data?.orders ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt");
    if (!term) return orders;
    return orders.filter((order) =>
      [order.numero_os, order.frota, order.localizacao, order.tecnico_email, order.descricao]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("pt").includes(term)),
    );
  }, [orders, search]);
  const active = filtered.filter((order) => order.status !== "concluida");
  const completed = filtered.filter((order) => order.status === "concluida");
  const isManager = data?.role === "gestor";

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
          <p className="mt-2 text-sm text-muted-foreground">{dashboardQuery.error.message}</p>
          <Button className="mt-5" onClick={() => router.invalidate()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }
  if (!data) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r bg-sidebar lg:flex lg:min-h-screen lg:flex-col">
        <Brand />
        <nav className="flex-1 px-3 py-7">
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase text-muted-foreground">Área de trabalho</div>
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent px-3 py-2.5 text-sm font-medium text-sidebar-accent-foreground">
            <ClipboardList className="size-4" /> Ordens de serviço
          </div>
        </nav>
        <UserPanel name={data.me?.nome ?? data.user.email ?? "Utilizador"} email={data.user.email ?? ""} role={data.role} onSignOut={signOut} />
      </aside>

      <main className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-7 lg:hidden">
          <Brand compact />
          <Button variant="ghost" size="icon" onClick={signOut} title="Terminar sessão"><LogOut /></Button>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-7 lg:p-9">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{isManager ? "Painel central" : "Área do técnico"}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal sm:text-3xl">Ordens de serviço</h1>
              <p className="mt-2 text-sm text-muted-foreground">{isManager ? "Acompanhe e distribua o trabalho da equipa." : "Consulte as ordens que lhe foram atribuídas."}</p>
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2">
                <ImportDialog open={importOpen} onOpenChange={setImportOpen} technicians={data.technicians} onImported={refresh} />
                <CreateDialog open={createOpen} onOpenChange={setCreateOpen} technicians={data.technicians} creatorEmail={data.user.email ?? ""} onCreated={refresh} />
              </div>
            )}
          </div>

          <section className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric label="Total de OS" value={orders.length} icon={<ClipboardList />} />
            <Metric label="Ativas" value={orders.filter((order) => order.status !== "concluida").length} icon={<Wrench />} accent />
            <Metric label="Concluídas" value={orders.filter((order) => order.status === "concluida").length} icon={<CheckCircle2 />} />
          </section>

          <section className="mt-7 border-t pt-6">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Registo de ordens</h2>
                <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "ordem encontrada" : "ordens encontradas"}</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar OS, frota ou técnico" className="pl-9" />
              </div>
            </div>
            <Tabs defaultValue="ativas">
              <TabsList className="grid w-full grid-cols-2 sm:w-80">
                <TabsTrigger value="ativas">Ativas <span className="ml-1 text-xs text-muted-foreground">{active.length}</span></TabsTrigger>
                <TabsTrigger value="concluidas">Concluídas <span className="ml-1 text-xs text-muted-foreground">{completed.length}</span></TabsTrigger>
              </TabsList>
              <TabsContent value="ativas" className="mt-4"><OrderList orders={active} empty="Não existem ordens ativas." /></TabsContent>
              <TabsContent value="concluidas" className="mt-4"><OrderList orders={completed} empty="Ainda não existem ordens concluídas." /></TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </div>
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

function OrderList({ orders, empty }: { orders: Ordem[]; empty: string }) {
  if (orders.length === 0) return <div className="rounded-md border border-dashed py-14 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="hidden grid-cols-[1.1fr_1fr_1.1fr_1.5fr_120px] gap-4 border-b bg-muted/50 px-4 py-3 text-[11px] font-semibold uppercase text-muted-foreground md:grid">
        <span>OS / Frota</span><span>Localização</span><span>Técnico</span><span>Descrição</span><span>Data</span>
      </div>
      <div className="divide-y">
        {orders.map((order) => (
          <article key={order.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[1.1fr_1fr_1.1fr_1.5fr_120px] md:items-center md:gap-4">
            <div><div className="flex items-center gap-2"><span className="font-semibold">{order.numero_os}</span><StatusBadge completed={order.status === "concluida"} /></div><div className="mt-1 text-xs text-muted-foreground">Frota {order.frota}</div></div>
            <div className="flex items-center gap-2 text-sm"><MapPin className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{order.localizacao || "—"}</span></div>
            <div className="min-w-0 text-sm"><div className="truncate">{order.tecnico_email || "Sem técnico"}</div></div>
            <div className="line-clamp-2 text-sm text-muted-foreground">{order.descricao || "Sem descrição"}</div>
            <time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(order.created_at))}</time>
          </article>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ completed }: { completed: boolean }) {
  return <span className={completed ? "rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground" : "rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary"}>{completed ? "Concluída" : "Ativa"}</span>;
}

function CreateDialog({ open, onOpenChange, technicians, creatorEmail, onCreated }: { open: boolean; onOpenChange: (value: boolean) => void; technicians: Perfil[]; creatorEmail: string; onCreated: () => Promise<void> }) {
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
    const { error } = await supabase.from("ordens_servico").insert({
      numero_os: String(form.get("numero_os") ?? "").trim(),
      frota: String(form.get("frota") ?? "").trim(),
      localizacao: String(form.get("localizacao") ?? "").trim() || null,
      descricao: String(form.get("descricao") ?? "").trim() || null,
      tecnico_id: technician.id,
      tecnico_email: technician.email,
      criado_por_email: creatorEmail,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Já existe uma OS com esse número." : "Não foi possível criar a ordem.");
      return;
    }
    toast.success("Ordem de serviço criada.");
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

function ImportDialog({ open, onOpenChange, technicians, onImported }: { open: boolean; onOpenChange: (value: boolean) => void; technicians: Perfil[]; onImported: () => Promise<void> }) {
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
      const records = utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
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
      };
    });
    const { error } = await supabase.from("ordens_servico").insert(payload);
    setSaving(false);
    if (error) {
      console.error("Import error", error);
      const msg = error.code === "23505" ? "Já existe uma OS com um destes números." : error.code === "42501" ? "Sem permissão: apenas gestores podem importar." : error.message;
      toast.error(`A importação falhou: ${msg}`);
      return;
    }
    toast.success(`${payload.length} ${payload.length === 1 ? "ordem importada" : "ordens importadas"}.`);
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
  let reason = "";
  if (!numero || !frota) reason = "Faltam número da OS ou frota";
  else if (tecnico && !technicians.some((item) => item.email.toLowerCase() === tecnico.toLowerCase())) reason = "Técnico não encontrado";
  return { numero_os: numero, frota, localizacao: pick(clean, ["localizacao", "local", "morada"], ["local"]), descricao: pick(clean, ["descricao", "descricao_do_problema", "descricao_problema", "problema", "observacoes"], ["descri", "problema"]), tecnico_email: tecnico, valid: !reason, ...(reason ? { reason } : {}) };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />A carregar ordens...</div></div>;
}