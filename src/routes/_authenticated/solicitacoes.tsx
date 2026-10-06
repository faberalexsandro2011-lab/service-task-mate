import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FilePlus2,
  Inbox,
  RefreshCw,
  Send,
  ShieldAlert,
  UserCircle,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Perfil = Tables<"profiles">;
type Ordem = Tables<"ordens_servico">;

export const Route = createFileRoute("/_authenticated/solicitacoes")({
  head: () => ({
    meta: [
      { title: "Solicitações de OS — Central OS" },
      { name: "description", content: "Solicitações de ordens de serviço enviadas pelos técnicos." },
    ],
  }),
  component: SolicitacoesPage,
});

async function getPageData() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("A sessão terminou. Entre novamente.");

  const { data: manager, error: managerError } = await supabase.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "gestor",
  });
  if (managerError) throw managerError;

  const isManager = manager === true;
  const email = (authData.user.email ?? "").trim().toLowerCase();

  const requestsQuery = supabase
    .from("ordens_servico")
    .select("*")
    .eq("solicitacao_os", true)
    .order("solicitacao_status", { ascending: true })
    .order("solicitada_em", { ascending: false });

  const requestsResult = isManager
    ? await requestsQuery
    : await requestsQuery.eq("tecnico_id", authData.user.id);

  if (requestsResult.error) throw requestsResult.error;

  const techniciansResult = isManager
    ? await supabase.from("profiles").select("*").order("nome", { ascending: true })
    : { data: [] as Perfil[], error: null };

  if (techniciansResult.error) throw techniciansResult.error;

  let technicians = techniciansResult.data ?? [];
  if (isManager) {
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "tecnico");
    if (rolesError) throw rolesError;

    const technicianIds = new Set((roles ?? []).map((row) => row.user_id));
    technicians = technicians.filter((person) => technicianIds.has(person.id));
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("id,nome,email")
    .eq("id", authData.user.id)
    .maybeSingle();

  return {
    user: authData.user,
    email,
    isManager,
    requests: (requestsResult.data ?? []) as Ordem[],
    technicians,
    me,
  };
}

function SolicitacoesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState<Ordem | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["solicitacoes-os"],
    queryFn: getPageData,
    staleTime: 5_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("solicitacoes_os_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, () => {
        queryClient.invalidateQueries({ queryKey: ["solicitacoes-os"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-lg font-bold">Não foi possível abrir as solicitações</h1>
          <p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p>
          <Button className="mt-5" onClick={() => void navigate({ to: "/dashboard" })}>Voltar ao painel</Button>
        </div>
      </div>
    );
  }

  const data = query.data;
  const pending = data.requests.filter((item) => item.solicitacao_status === "aguardando_os");
  const handled = data.requests.filter((item) => item.solicitacao_status === "regularizada");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["solicitacoes-os"] });
  }

  async function regularize(values: RegisterValues) {
    if (!data.isManager || !selected || saving) return;
    setSaving(true);

    try {
      const number = values.numero_os.trim();
      const { data: duplicate, error: duplicateError } = await supabase
        .from("ordens_servico")
        .select("id")
        .eq("numero_os", number)
        .neq("id", selected.id)
        .limit(1)
        .maybeSingle();

      if (duplicateError) throw duplicateError;
      if (duplicate) {
        toast.error("Já existe uma OS com este número. Para não duplicar, informe outro número.");
        return;
      }

      const technician = data.technicians.find((person) => person.id === values.tecnico_id);
      const now = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from("ordens_servico")
        .update({
          numero_os: number,
          frota: values.frota.trim(),
          localizacao: values.localizacao.trim() || null,
          descricao: values.descricao.trim() || null,
          tecnico_id: technician?.id ?? selected.tecnico_id,
          tecnico_email: technician?.email ?? selected.tecnico_email,
          tecnico_nome: technician?.nome ?? selected.tecnico_nome,
          status: "pendente",
          solicitacao_os: false,
          solicitacao_status: "regularizada",
          regularizada_em: now,
          regularizada_por_email: data.email,
        })
        .eq("id", selected.id)
        .eq("solicitacao_os", true)
        .select("*")
        .single();

      if (error) throw error;

      await supabase.from("historico_edicoes").insert({
        os_id: updated.id,
        acao: "regularizada",
        detalhe: "Solicitação de OS regularizada pelo gestor e enviada novamente ao técnico.",
        usuario_id: data.user.id,
        usuario_email: data.email,
      });

      await supabase.from("historico_edicoes").insert({
        os_id: updated.id,
        acao: "enviada",
        detalhe: "OS " + number + " enviada novamente para " + (technician?.nome || technician?.email || selected.tecnico_email),
        usuario_id: data.user.id,
        usuario_email: data.email,
      });

      toast.success("OS " + number + " regularizada e enviada novamente ao técnico.");
      setSelected(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível regularizar a solicitação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void navigate({ to: data.isManager ? "/dashboard" : "/tecnico" })}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"
              aria-label="Voltar"
            >
              <Wrench className="size-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Central OS</div>
              <h1 className="truncate text-xl font-bold tracking-tight">{data.isManager ? "Solicitações de OS" : "Solicitar OS"}</h1>
            </div>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 p-3 sm:p-5 lg:p-8">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Inbox className="size-4" />
                {data.isManager ? "Caixa de entrada operacional" : "Solicitação de cadastro de OS"}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {data.isManager
                  ? "As solicitações são registros de OS provisórios. Confira, informe o número da OS e regularize para enviar novamente ao técnico, sem criar duplicidade."
                  : "Use esta área quando você realizou um serviço que não apareceu na sua lista. O gestor receberá os dados e colocará a OS na sua fila."}
              </p>
            </div>
            {!data.isManager && (
              <Button className="gap-2" onClick={() => setOpenForm(true)}>
                <FilePlus2 className="size-4" /> Nova solicitação
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aguardando OS</div>
              <div className="mt-1 text-2xl font-bold">{pending.length}</div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regularizadas</div>
              <div className="mt-1 text-2xl font-bold">{handled.length}</div>
            </div>
          </div>
        </section>

        {data.isManager ? (
          <ManagerRequests requests={data.requests} onSelect={setSelected} />
        ) : (
          <TechnicianRequests requests={data.requests} />
        )}
      </main>

      {!data.isManager && (
        <RequestForm open={openForm} onOpenChange={setOpenForm} user={data.user} profile={data.me} onCreated={refresh} />
      )}

      {data.isManager && selected && (
        <ManagerRequestDialog
          request={selected}
          technicians={data.technicians}
          open={Boolean(selected)}
          onOpenChange={(open) => !open && setSelected(null)}
          saving={saving}
          onRegister={regularize}
        />
      )}
    </div>
  );
}

type RegisterValues = {
  numero_os: string;
  frota: string;
  localizacao: string;
  descricao: string;
  tecnico_id: string;
};

function RequestForm({
  open,
  onOpenChange,
  user,
  profile,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email?: string };
  profile: Pick<Perfil, "id" | "nome" | "email"> | null;
  onCreated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const form = new FormData(event.currentTarget);
    const frota = String(form.get("frota") ?? "").trim();
    const localizacao = String(form.get("localizacao") ?? "").trim();
    const descricao = String(form.get("descricao") ?? "").trim();

    if (!frota || !descricao) {
      toast.error("Preencha Frota e o serviço realizado.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        numero_os: null,
        frota,
        localizacao: localizacao || null,
        descricao,
        tecnico_id: profile?.id ?? user.id,
        tecnico_email: profile?.email?.trim() || user.email || "",
        tecnico_nome: profile?.nome?.trim() || user.email || "Técnico",
        status: "pendente",
        solicitacao_os: true,
        solicitacao_status: "aguardando_os",
        solicitada_em: new Date().toISOString(),
      };

      const { error } = await supabase.from("ordens_servico").insert(payload);
      if (error) throw error;

      toast.success("Solicitação enviada ao gestor.");
      onOpenChange(false);
      event.currentTarget.reset();
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Solicitar cadastro de OS</DialogTitle>
          <DialogDescription>
            Informe a frota, localização e o serviço realizado. O gestor completará o número da OS e enviará a OS para você.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Número da OS (se houver)">
            <Input name="numero_os" placeholder="Pode deixar em branco se a OS ainda não existir." disabled />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Frota"><Input name="frota" required placeholder="TR-024" /></Field>
            <Field label="Localização"><Input name="localizacao" placeholder="Fazenda / Oficina / Talhão" /></Field>
          </div>
          <Field label="Serviço realizado"><Textarea name="descricao" required rows={5} placeholder="Descreva o trabalho realizado..." /></Field>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Solicitante: <strong>{profile?.nome || profile?.email || user.email}</strong>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2"><Send className="size-4" /> {saving ? "Enviando..." : "Enviar solicitação"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagerRequests({ requests, onSelect }: { requests: Ordem[]; onSelect: (request: Ordem) => void }) {
  if (!requests.length) return <EmptyState text="Nenhuma solicitação de OS foi recebida." />;

  return (
    <div className="space-y-3">
      {requests.map((request) => {
        const pending = request.solicitacao_status === "aguardando_os";
        return (
          <button
            key={request.id}
            type="button"
            onClick={() => onSelect(request)}
            className="group w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-5"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{request.numero_os ? "OS " + request.numero_os : "OS sem número"}</span>
                  <RequestStatus status={request.solicitacao_status} />
                  {pending && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Aguardando cadastro</span>}
                </div>
                <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span><strong className="text-foreground">Frota:</strong> {request.frota}</span>
                  <span><strong className="text-foreground">Técnico:</strong> {request.tecnico_nome || request.tecnico_email}</span>
                  <span><strong className="text-foreground">Local:</strong> {request.localizacao || "—"}</span>
                  <span><strong className="text-foreground">Solicitada:</strong> {formatDate(request.solicitada_em || request.created_at)}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm">{request.descricao || "Sem descrição."}</p>
              </div>
              <ChevronRight className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 lg:block" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TechnicianRequests({ requests }: { requests: Ordem[] }) {
  if (!requests.length) return <EmptyState text="Você ainda não enviou nenhuma solicitação." />;

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{request.numero_os ? "OS " + request.numero_os : "OS aguardando número"}</span>
                <RequestStatus status={request.solicitacao_status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Frota {request.frota} · enviada em {formatDate(request.solicitada_em || request.created_at)}
              </div>
            </div>
            {request.solicitacao_status === "regularizada" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="size-3.5" /> OS devolvida à fila
              </span>
            )}
          </div>
          <p className="mt-3 text-sm">{request.descricao || "Sem descrição."}</p>
        </div>
      ))}
    </div>
  );
}

function ManagerRequestDialog({
  request,
  technicians,
  open,
  onOpenChange,
  saving,
  onRegister,
}: {
  request: Ordem;
  technicians: Perfil[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onRegister: (values: RegisterValues) => Promise<void>;
}) {
  const [numeroOs, setNumeroOs] = useState(request.numero_os || "");
  const [frota, setFrota] = useState(request.frota);
  const [localizacao, setLocalizacao] = useState(request.localizacao || "");
  const [descricao, setDescricao] = useState(request.descricao || "");
  const [technicianId, setTechnicianId] = useState(request.tecnico_id || technicians[0]?.id || "");

  const technician = technicians.find((item) => item.id === technicianId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserir OS e enviar ao técnico</DialogTitle>
          <DialogDescription>
            A solicitação provisória será transformada na OS oficial. Nenhuma segunda OS será criada.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!numeroOs.trim() || !frota.trim() || !descricao.trim() || !technicianId) {
              toast.error("Preencha Número da OS, Frota, serviço e técnico.");
              return;
            }
            void onRegister({
              numero_os: numeroOs,
              frota,
              localizacao,
              descricao,
              tecnico_id: technicianId,
            });
          }}
          className="grid gap-4"
        >
          <div className="rounded-xl border bg-muted/35 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <UserCircle className="size-4" /> Solicitação de {request.tecnico_nome || request.tecnico_email}
            </div>
            <div className="mt-1">Recebida em {formatDate(request.solicitada_em || request.created_at)}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número da OS"><Input value={numeroOs} onChange={(event) => setNumeroOs(event.target.value)} required /></Field>
            <Field label="Frota"><Input value={frota} onChange={(event) => setFrota(event.target.value)} required /></Field>
          </div>
          <Field label="Localização"><Input value={localizacao} onChange={(event) => setLocalizacao(event.target.value)} /></Field>
          <Field label="Serviço realizado"><Textarea value={descricao} onChange={(event) => setDescricao(event.target.value)} required rows={5} /></Field>
          <Field label="Enviar novamente para técnico">
            <Select value={technicianId} onValueChange={setTechnicianId}>
              <SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
              <SelectContent>
                {technicians.map((person) => (
                  <SelectItem key={person.id} value={person.id}>{(person.nome || person.email) + " · " + person.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2"><Send className="size-4" /> {saving ? "Salvando..." : "Inserir OS e enviar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestStatus({ status }: { status: string | null }) {
  if (status === "regularizada") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-3.5" /> Regularizada</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"><Clock3 className="size-3.5" /> Pendente</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><label className="text-sm font-medium">{label}</label>{children}</div>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground"><Inbox className="mx-auto size-8" /><p className="mt-2">{text}</p></div>;
}

function Loading() {
  return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />Carregando solicitações...</div></div>;
}
