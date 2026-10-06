import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Inbox,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  UserCircle,
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
type Solicitacao = Tables<"solicitacoes_os">;
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

  const { data: managerByRpc, error: rpcError } = await supabase.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "gestor",
  });

  let isManager = rpcError ? false : managerByRpc === true;

  if (rpcError) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    isManager = roleRow?.role === "gestor";
  }

  const requestsResult = isManager
    ? await supabase
        .from("solicitacoes_os")
        .select("*")
        .order("status", { ascending: true })
        .order("criada_em", { ascending: false })
    : await supabase
        .from("solicitacoes_os")
        .select("*")
        .eq("solicitante_id", authData.user.id)
        .order("criada_em", { ascending: false });

  if (requestsResult.error) throw requestsResult.error;

  const techniciansResult = isManager
    ? await supabase
        .from("profiles")
        .select("*")
        .order("nome", { ascending: true })
    : { data: [] as Perfil[], error: null };

  if (techniciansResult.error) throw techniciansResult.error;

  let technicians = techniciansResult.data ?? [];
  if (isManager) {
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "tecnico");
    if (roleError) throw roleError;
    const ids = new Set((roleRows ?? []).map((row) => row.user_id));
    technicians = technicians.filter((person) => ids.has(person.id));
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("id,nome,email")
    .eq("id", authData.user.id)
    .maybeSingle();

  return {
    user: authData.user,
    isManager,
    requests: requestsResult.data ?? [],
    technicians,
    me,
  };
}

function SolicitacoesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState<Solicitacao | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["solicitacoes-os"],
    queryFn: getPageData,
    staleTime: 10_000,
  });

  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-lg font-bold">Não foi possível abrir as solicitações</h1>
          <p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p>
          <Button className="mt-5" onClick={() => void navigate({ to: query.data?.isManager ? "/dashboard" : "/tecnico" })}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const data = query.data;
  const pendingCount = data.requests.filter((request) => request.status === "pendente").length;
  const handledCount = data.requests.filter((request) => request.status === "atendida").length;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["solicitacoes-os"] });
  }

  async function registerAndSend(values: RegisterValues) {
    if (!data.isManager || !selected || saving) return;

    setSaving(true);
    try {
      const { data: existing, error: lookupError } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("numero_os", values.numero_os.trim())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (lookupError) throw lookupError;

      let order: Ordem | null = existing ?? null;
      const technician = data.technicians.find((person) => person.id === values.tecnico_id);

      if (existing) {
        const updatePayload = {
          frota: values.frota.trim(),
          localizacao: values.localizacao.trim() || null,
          descricao: values.descricao.trim() || null,
          tecnico_id: technician?.id ?? null,
          tecnico_email: technician?.email ?? values.tecnico_email.trim(),
          tecnico_nome: technician?.nome ?? values.tecnico_nome.trim() ?? null,
        };

        const { data: updated, error } = await supabase
          .from("ordens_servico")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("*")
          .single();

        if (error) throw error;
        order = updated;
      } else {
        const { data: created, error } = await supabase
          .from("ordens_servico")
          .insert({
            numero_os: values.numero_os.trim(),
            frota: values.frota.trim(),
            localizacao: values.localizacao.trim() || null,
            descricao: values.descricao.trim() || null,
            tecnico_id: technician?.id ?? null,
            tecnico_email: technician?.email ?? (values.tecnico_email.trim() || null),
            tecnico_nome: technician?.nome ?? (values.tecnico_nome.trim() || null),
            criado_por_email: data.user.email ?? null,
            status: "pendente",
          })
          .select("*")
          .single();

        if (error) throw error;
        order = created;
      }

      if (!order) throw new Error("A OS não foi criada.");

      await supabase.from("historico_edicoes").insert({
        os_id: order.id,
        acao: existing ? "atualizada" : "aberta",
        detalhe: existing
          ? "OS " + values.numero_os + " vinculada à solicitação do técnico e atualizada pelo gestor."
          : "OS " + values.numero_os + " criada a partir de solicitação do técnico.",
        usuario_id: data.user.id,
        usuario_email: data.user.email ?? null,
      });

      if (values.tecnico_email.trim()) {
        await supabase.from("historico_edicoes").insert({
          os_id: order.id,
          acao: "enviada",
          detalhe: "OS enviada novamente para " + (technician?.nome || values.tecnico_email.trim()),
          usuario_id: data.user.id,
          usuario_email: data.user.email ?? null,
        });
      }

      const { error: requestError } = await supabase
        .from("solicitacoes_os")
        .update({
          numero_os: values.numero_os.trim(),
          frota: values.frota.trim(),
          localizacao: values.localizacao.trim() || null,
          descricao: values.descricao.trim() || null,
          tecnico_id: technician?.id ?? selected.tecnico_id,
          tecnico_email: technician?.email ?? values.tecnico_email.trim(),
          tecnico_nome: technician?.nome ?? (values.tecnico_nome.trim() || selected.tecnico_nome || null),
          status: "atendida",
          ordem_id: order.id,
          detalhe_gestor: "OS registrada/reencaminhada pelo gestor " + (data.user.email ?? ""),
          atendida_em: new Date().toISOString(),
        })
        .eq("id", selected.id);

      if (requestError) throw requestError;

      toast.success(existing ? "OS existente atualizada e vinculada à solicitação." : "OS registrada e enviada ao técnico.");
      setSelected(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a OS.");
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
              <ClipboardList className="size-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Central OS
              </div>
              <h1 className="truncate text-xl font-bold tracking-tight">
                {data.isManager ? "Solicitações de OS" : "Solicitar OS"}
              </h1>
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
                {data.isManager ? "Caixa de entrada operacional" : "Trabalho realizado fora da fila"}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {data.isManager
                  ? "Receba solicitações dos técnicos, confira os dados e transforme a solicitação em uma OS oficial para o técnico."
                  : "Registre um trabalho que foi realizado e não apareceu na sua lista de OS. A solicitação será enviada ao gestor para cadastro e reencaminhamento."}
              </p>
            </div>

            {!data.isManager && (
              <Button className="gap-2" onClick={() => setOpenForm(true)}>
                <PlusCircle className="size-4" /> Solicitar OS
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendentes</div>
              <div className="mt-1 text-2xl font-bold">{pendingCount}</div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendidas</div>
              <div className="mt-1 text-2xl font-bold">{handledCount}</div>
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
        <RequestForm
          open={openForm}
          onOpenChange={setOpenForm}
          user={data.user}
          profile={data.me}
          onCreated={refresh}
        />
      )}

      {data.isManager && selected && (
        <ManagerRequestDialog
          request={selected}
          technicians={data.technicians}
          open={Boolean(selected)}
          onOpenChange={(open) => !open && setSelected(null)}
          saving={saving}
          onRegister={registerAndSend}
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
  tecnico_email: string;
  tecnico_nome: string;
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
    const numero_os = String(form.get("numero_os") ?? "").trim();
    const frota = String(form.get("frota") ?? "").trim();
    const localizacao = String(form.get("localizacao") ?? "").trim();
    const descricao = String(form.get("descricao") ?? "").trim();

    if (!numero_os || !frota || !descricao) {
      toast.error("Preencha Número da OS, Frota e o serviço realizado.");
      return;
    }

    setSaving(true);
    try {
      const { error: existingError } = await supabase
        .from("ordens_servico")
        .select("id")
        .eq("numero_os", numero_os)
        .limit(1)
        .maybeSingle();

      if (!existingError && existingError !== null) {
        // mantém a consulta em uma única etapa; qualquer erro é tratado abaixo
      }

      const { count, error: requestError } = await supabase
        .from("solicitacoes_os")
        .select("id", { count: "exact", head: true })
        .eq("numero_os", numero_os)
        .eq("status", "pendente");

      if (requestError) throw requestError;
      if ((count ?? 0) > 0) {
        toast.error("Já existe uma solicitação pendente para esta OS.");
        return;
      }

      const payload = {
        numero_os,
        frota,
        localizacao: localizacao || null,
        descricao,
        tecnico_id: profile?.id ?? user.id,
        tecnico_email: profile?.email?.trim() || user.email || "",
        tecnico_nome: profile?.nome?.trim() || user.email || "Técnico",
        solicitante_id: user.id,
        solicitante_email: user.email || "",
        solicitante_nome: profile?.nome?.trim() || user.email || "Técnico",
        status: "pendente",
      };

      const { error } = await supabase.from("solicitacoes_os").insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe uma solicitação pendente com este número de OS.");
        } else {
          throw error;
        }
        return;
      }

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
            Preencha os mesmos dados usados na abertura manual de uma OS. O gestor receberá a solicitação e poderá cadastrar/reencaminhar para você.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número da OS"><Input name="numero_os" required placeholder="OS-2026-001" /></Field>
            <Field label="Frota"><Input name="frota" required placeholder="TR-024" /></Field>
          </div>
          <Field label="Localização"><Input name="localizacao" placeholder="Fazenda / Oficina / Talhão" /></Field>
          <Field label="Serviço realizado"><Textarea name="descricao" required rows={5} placeholder="Descreva o trabalho que foi realizado e o motivo..." /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              <Send className="size-4" /> {saving ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagerRequests({
  requests,
  onSelect,
}: {
  requests: Solicitacao[];
  onSelect: (request: Solicitacao) => void;
}) {
  if (!requests.length) {
    return <EmptyState text="Nenhuma solicitação de OS foi recebida." />;
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => {
        const pending = request.status === "pendente";
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
                  <span className="text-sm font-bold">OS {request.numero_os}</span>
                  <StatusRequestBadge status={request.status} />
                  {pending && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Aguardando gestor</span>}
                </div>
                <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span><strong className="text-foreground">Frota:</strong> {request.frota}</span>
                  <span><strong className="text-foreground">Técnico:</strong> {request.tecnico_nome || request.tecnico_email}</span>
                  <span><strong className="text-foreground">Local:</strong> {request.localizacao || "—"}</span>
                  <span><strong className="text-foreground">Enviada:</strong> {formatDate(request.criada_em)}</span>
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

function TechnicianRequests({ requests }: { requests: Solicitacao[] }) {
  if (!requests.length) {
    return <EmptyState text="Você ainda não enviou nenhuma solicitação." />;
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">OS {request.numero_os}</span>
                <StatusRequestBadge status={request.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Frota {request.frota} · enviada em {formatDate(request.criada_em)}
              </div>
            </div>
            {request.ordem_id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="size-3.5" /> OS cadastrada
              </span>
            )}
          </div>
          <p className="mt-3 text-sm">{request.descricao || "Sem descrição."}</p>
          {request.detalhe_gestor && (
            <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Gestor:</strong> {request.detalhe_gestor}
            </div>
          )}
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
  request: Solicitacao;
  technicians: Perfil[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onRegister: (values: RegisterValues) => Promise<void>;
}) {
  const [numeroOs, setNumeroOs] = useState(request.numero_os);
  const [frota, setFrota] = useState(request.frota);
  const [localizacao, setLocalizacao] = useState(request.localizacao || "");
  const [descricao, setDescricao] = useState(request.descricao || "");
  const [technicianId, setTechnicianId] = useState(request.tecnico_id || technicians[0]?.id || "");

  const technician = technicians.find((item) => item.id === technicianId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!numeroOs.trim() || !frota.trim() || !descricao.trim()) {
      toast.error("Preencha Número da OS, Frota e serviço realizado.");
      return;
    }

    await onRegister({
      numero_os: numeroOs,
      frota,
      localizacao,
      descricao,
      tecnico_id: technicianId,
      tecnico_email: technician?.email || request.tecnico_email,
      tecnico_nome: technician?.nome || request.tecnico_nome || request.tecnico_email,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar e enviar OS</DialogTitle>
          <DialogDescription>
            Confira os dados enviados pelo técnico. Ao confirmar, a OS será criada (ou atualizada, caso já exista) e enviada novamente ao técnico selecionado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="rounded-xl border bg-muted/35 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground"><UserCircle className="size-4" /> Solicitação de {request.tecnico_nome || request.tecnico_email}</div>
            <div className="mt-1">Recebida em {formatDate(request.criada_em)}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número da OS"><Input value={numeroOs} onChange={(event) => setNumeroOs(event.target.value)} required /></Field>
            <Field label="Frota"><Input value={frota} onChange={(event) => setFrota(event.target.value)} required /></Field>
          </div>
          <Field label="Localização"><Input value={localizacao} onChange={(event) => setLocalizacao(event.target.value)} /></Field>
          <Field label="Serviço realizado"><Textarea value={descricao} onChange={(event) => setDescricao(event.target.value)} required rows={5} /></Field>

          <Field label="Enviar para técnico">
            <Select value={technicianId} onValueChange={setTechnicianId}>
              <SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
              <SelectContent>
                {technicians.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {(person.nome || person.email) + " · " + person.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              <Send className="size-4" /> {saving ? "Registrando..." : "Registrar e enviar ao técnico"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusRequestBadge({ status }: { status: string }) {
  if (status === "atendida") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5" /> Atendida
      </span>
    );
  }
  if (status === "cancelada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        <XCircle className="size-3.5" /> Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <Clock3 className="size-3.5" /> Pendente
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><label className="text-sm font-medium">{label}</label>{children}</div>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground">
      <Inbox className="mx-auto size-8" />
      <p className="mt-2">{text}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        Carregando solicitações...
      </div>
    </div>
  );
}
