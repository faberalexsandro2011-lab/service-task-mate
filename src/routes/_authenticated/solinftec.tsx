import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock3,
  RefreshCw,
  Search,
  SatelliteDish,
  CheckCircle2,
  FilePlus2,
  LoaderCircle,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EquipamentoSolinftec = Tables<"solinftec_monitoramento">;

// A criação de OS fica bloqueada por padrão até validar o backend de TESTE.
const PODE_CRIAR_OS = import.meta.env.VITE_SOLINFTEC_ENABLE_OS_CREATION === "true";

export const Route = createFileRoute("/_authenticated/solinftec")({
  head: () => ({
    meta: [
      { title: "Monitoramento Solinftec — Central OS" },
      { name: "description", content: "Acompanhamento de equipamentos sem comunicação." },
    ],
  }),
  component: SolinftecPage,
});

function formatarColeta(value: string | null | undefined) {
  if (!value) return "Sem coleta registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data de coleta inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function horasFormatadas(hours: number | null) {
  if (hours == null || !Number.isFinite(hours)) return "Tempo indisponível";
  const totalMinutes = Math.floor(hours * 60);
  const days = Math.floor(totalMinutes / 1440);
  const remainingHours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} d ${String(remainingHours).padStart(2, "0")} h ${String(minutes).padStart(2, "0")} min`;
  if (remainingHours > 0) return `${remainingHours} h ${String(minutes).padStart(2, "0")} min`;
  return `${minutes} min`;
}

function SolinftecPage() {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<EquipamentoSolinftec[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [grupoOperacaoSelecionado, setGrupoOperacaoSelecionado] = useState<string[]>([]);
  const [somenteAlertas, setSomenteAlertas] = useState(false);
  const [alertaOS, setAlertaOS] = useState<EquipamentoSolinftec | null>(null);
  const [numeroOS, setNumeroOS] = useState("");
  const [salvandoOS, setSalvandoOS] = useState(false);

  const carregar = useCallback(async (manual = false) => {
    if (manual) setAtualizando(true);
    try {
      const { data, error: queryError } = await supabase
        .from("solinftec_monitoramento")
        .select("*")
        .order("horas_sem_comunicacao", { ascending: false, nullsFirst: false });

      if (queryError) throw queryError;
      setRegistros(data ?? []);
      setErro("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao consultar o monitoramento.";
      setErro(message);
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), 60_000);
    const channel = supabase
      .channel("solinftec-monitoramento-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solinftec_monitoramento" },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [carregar]);

  const alertas = useMemo(
    () => registros.filter((item) => item.horas_sem_comunicacao != null && item.horas_sem_comunicacao >= 72),
    [registros],
  );

  const ultimaColeta = useMemo(() => {
    let latest = 0;
    for (const item of registros) {
      const timestamp = new Date(item.coletado_em).getTime();
      if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
    }
    return latest ? new Date(latest).toISOString() : null;
  }, [registros]);

  const coletaAtrasada = ultimaColeta
    ? Date.now() - new Date(ultimaColeta).getTime() > 60 * 60 * 1000
    : true;

  const opcoesGrupoOperacao = useMemo(() => {
    const combinacoes = new Map<string, { valor: string; rotulo: string }>();
    for (const item of registros) {
      const grupo = item.grupo?.trim() || "";
      const operacao = item.operacao?.trim() || "";
      if (!grupo && !operacao) continue;
      const valor = JSON.stringify([grupo, operacao]);
      const rotulo = [grupo, operacao].filter(Boolean).join(" / ");
      combinacoes.set(valor, { valor, rotulo });
    }
    return [...combinacoes.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [registros]);

  useEffect(() => {
    if (opcoesGrupoOperacao.length === 0) return;
    setGrupoOperacaoSelecionado((selecionados) => {
      if (selecionados.length === 0) return opcoesGrupoOperacao.map((opcao) => opcao.valor);
      const valoresDisponiveis = new Set(opcoesGrupoOperacao.map((opcao) => opcao.valor));
      return selecionados.filter((valor) => valoresDisponiveis.has(valor));
    });
  }, [opcoesGrupoOperacao]);

  const registrosVisiveis = useMemo(() => {
    const term = pesquisa.trim().toLocaleLowerCase("pt-BR");
    return registros.filter((item) => {
      const matchesTerm = !term || [
        item.codigo,
        item.equipamento,
        item.regional,
        item.unidade,
        item.grupo,
        item.operacao,
        item.tipo,
        item.funcionario,
      ].some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(term));
      const combinacao = JSON.stringify([item.grupo?.trim() || "", item.operacao?.trim() || ""]);
      const matchesGrupoOperacao = grupoOperacaoSelecionado.includes(combinacao);
      const matchesAlert = !somenteAlertas ||
        (item.horas_sem_comunicacao != null && item.horas_sem_comunicacao >= 72);
      return matchesTerm && matchesGrupoOperacao && matchesAlert;
    });
  }, [registros, pesquisa, grupoOperacaoSelecionado, somenteAlertas]);

  function iniciarOS(item: EquipamentoSolinftec) {
    if (!PODE_CRIAR_OS) {
      toast.error("A abertura de OS será habilitada após validar a base de teste.");
      return;
    }
    setAlertaOS(item);
    setNumeroOS("");
  }

  async function criarOS() {
    if (!PODE_CRIAR_OS) {
      toast.error("A abertura de OS está bloqueada até validar a base de teste.");
      return;
    }
    if (!alertaOS) return;
    const numero = numeroOS.trim();
    if (!numero) {
      toast.error("Informe o número da OS antes de continuar.");
      return;
    }

    setSalvandoOS(true);
    try {
      const { data: duplicadas, error: lookupError } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status")
        .eq("numero_os", numero)
        .limit(1);
      if (lookupError) throw lookupError;
      if (duplicadas?.length) {
        toast.error(`A OS ${numero} já existe no Central OS. Confira o número informado.`);
        return;
      }

      const { data: abertas, error: openError } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status")
        .eq("frota", alertaOS.equipamento)
        .in("status", ["pendente", "em_andamento"])
        .limit(1);
      if (openError) throw openError;
      if (abertas?.length) {
        toast.error(
          `Já existe uma OS aberta para ${alertaOS.equipamento}: nº ${abertas[0].numero_os}. Não foi criada outra.`,
        );
        return;
      }

      const descricao = [
        "Alerta de comunicação recebido da Solinftec.",
        `Tempo sem comunicação: ${alertaOS.tempo_sem_comunicacao}.`,
        alertaOS.grupo ? `Grupo: ${alertaOS.grupo}.` : "",
        alertaOS.operacao ? `Operação: ${alertaOS.operacao}.` : "",
        alertaOS.data_final ? `Último registro informado pela Solinftec: ${alertaOS.data_final}.` : "",
      ].filter(Boolean).join(" ");

      const { error: insertError } = await supabase.from("ordens_servico").insert({
        numero_os: numero,
        frota: alertaOS.equipamento,
        localizacao: [alertaOS.unidade, alertaOS.regional].filter(Boolean).join(" — ") || null,
        descricao,
        classe_manutencao: "SOLINFTEC",
        setor: alertaOS.grupo || null,
        status: "pendente",
      });
      if (insertError) throw insertError;

      toast.success(`OS ${numero} criada para ${alertaOS.equipamento}.`);
      setAlertaOS(null);
      setNumeroOS("");
      await navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a OS.";
      toast.error(message);
    } finally {
      setSalvandoOS(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <SatelliteDish className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-xl">Monitoramento Solinftec</h1>
              <p className="text-xs text-muted-foreground">Central OS · Conectividade dos equipamentos</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: "/dashboard" })}>
              <ArrowLeft className="mr-2 size-4" /> <span className="hidden sm:inline">Painel central</span>
            </Button>
            <Button variant="outline" size="icon" title="Atualizar agora" onClick={() => void carregar(true)} disabled={atualizando}>
              <RefreshCw className={`size-4 ${atualizando ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-5 p-3 sm:p-6 lg:p-8">
        {erro && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <WifiOff className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-bold">Os dados do monitoramento ainda não estão disponíveis.</p>
                <p className="mt-1">Verifique se a migration foi aplicada no banco de teste e se o backend de ingestão foi publicado. Detalhe técnico: {erro}</p>
              </div>
            </div>
          </section>
        )}

        <section className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${coletaAtrasada ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"}`}>
          <div className="flex items-start gap-3">
            {coletaAtrasada
              ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
              : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />}
            <div>
              <p className="font-semibold">{coletaAtrasada ? "Aguardando atualização recente da Solinftec" : "Dados atualizados recentemente"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Última coleta recebida: {formatarColeta(ultimaColeta)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">O painel atualiza automaticamente a cada minuto quando há dados novos.</p>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric icon={<Activity className="size-5" />} label="Equipamentos recebidos" value={loading ? "—" : String(registros.length)} detail="Registros armazenados no backend" tone="green" />
          <Metric icon={<AlertTriangle className="size-5" />} label="72 horas ou mais" value={loading ? "—" : String(alertas.length)} detail="Precisam de verificação operacional" tone="red" />
          <Metric icon={<Clock3 className="size-5" />} label="Tempo da coleta" value={ultimaColeta ? formatarColeta(ultimaColeta) : "—"} detail="Horário informado pelo coletor" tone="neutral" />
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <h2 className="font-bold">Equipamentos</h2>
              <p className="text-sm text-muted-foreground">{registrosVisiveis.length} de {registros.length} registros exibidos</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <div className="relative min-w-0 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={pesquisa} onChange={(event) => setPesquisa(event.target.value)} placeholder="Buscar frota, código..." className="pl-9" />
              </div>
              <details className="relative min-w-0 sm:w-64">
                <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <span className="truncate">{grupoOperacaoSelecionado.length === opcoesGrupoOperacao.length ? "Todos os grupos/operações" : `${grupoOperacaoSelecionado.length} grupo(s)/operação(ões) selecionado(s)`}</span>
                  <span aria-hidden="true">▾</span>
                </summary>
                <div className="absolute right-0 z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b pb-2">
                    <span className="text-xs text-muted-foreground">Marque todos que deseja exibir</span>
                    <button type="button" className="text-xs font-medium underline" onClick={() => setGrupoOperacaoSelecionado(opcoesGrupoOperacao.map((opcao) => opcao.valor))}>Marcar todos</button>
                  </div>
                  {opcoesGrupoOperacao.map((opcao) => (
                    <label key={opcao.valor} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={grupoOperacaoSelecionado.includes(opcao.valor)}
                        onChange={(event) => setGrupoOperacaoSelecionado((selecionados) => event.target.checked
                          ? [...selecionados, opcao.valor]
                          : selecionados.filter((valor) => valor !== opcao.valor))}
                        className="size-4 accent-primary"
                      />
                      <span>{opcao.rotulo}</span>
                    </label>
                  ))}
                </div>
              </details>
              <Button
                variant={somenteAlertas ? "default" : "outline"}
                onClick={() => setSomenteAlertas((value) => !value)}
              >
                <AlertTriangle className="mr-2 size-4" />
                {somenteAlertas ? "Mostrar todos" : "Somente alertas"}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Carregando equipamentos...
            </div>
          ) : registrosVisiveis.length === 0 ? (
            <div className="p-10 text-center">
              <SatelliteDish className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">{registros.length === 0 ? "A integração ainda não enviou equipamentos." : "Nenhum equipamento corresponde à pesquisa."}</p>
              <p className="mt-1 text-sm text-muted-foreground">Depois de configurar o coletor e o backend, os registros aparecerão aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Equipamento</th>
                    <th className="px-4 py-3">Grupo / operação</th>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Último registro</th>
                    <th className="px-4 py-3">Sem comunicação</th>
                    <th className="px-4 py-3">Funcionário</th>
                    <th className="px-4 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {registrosVisiveis.map((item) => {
                    const critical = item.horas_sem_comunicacao != null && item.horas_sem_comunicacao >= 72;
                    return (
                      <tr key={item.codigo} className={critical ? "bg-rose-50/50 dark:bg-rose-950/10" : "hover:bg-muted/30"}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{item.equipamento}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">Código {item.codigo} · {item.tipo || "Tipo não informado"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.grupo || "—"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{item.operacao || "—"}</div>
                        </td>
                        <td className="px-4 py-3">{item.unidade || item.regional || "—"}</td>
                        <td className="px-4 py-3">{item.data_final || item.data_inicial || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${critical ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200" : "bg-muted text-muted-foreground"}`}>
                            {critical && <AlertTriangle className="size-3.5" />}
                            {horasFormatadas(item.horas_sem_comunicacao)}
                          </span>
                          <div className="mt-1 text-xs text-muted-foreground">{item.tempo_sem_comunicacao || ""}</div>
                        </td>
                        <td className="px-4 py-3">{item.funcionario || "—"}</td>
                        <td className="px-4 py-3">
                          {critical ? (
                            <Button size="sm" onClick={() => iniciarOS(item)} disabled={!PODE_CRIAR_OS} title={!PODE_CRIAR_OS ? "Abertura de OS será habilitada após validar a base de teste" : "Abrir OS pendente para este equipamento"} className="whitespace-nowrap">
                              <FilePlus2 className="mr-1.5 size-4" /> {PODE_CRIAR_OS ? "Abrir OS" : "OS bloqueada no teste"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem ação</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="px-1 text-xs text-muted-foreground">
          A abertura de OS é feita somente após informar o número e verificar se já existe OS com o mesmo número ou uma OS aberta para o equipamento. Confirme o alerta com a equipe antes de encaminhar manutenção.
        </p>
      </main>

      <Dialog open={Boolean(alertaOS)} onOpenChange={(open) => { if (!open && !salvandoOS) setAlertaOS(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrir OS a partir do alerta Solinftec</DialogTitle>
            <DialogDescription>
              Confira o equipamento e informe o número da OS. Os dados disponíveis da Solinftec serão incluídos na descrição.
            </DialogDescription>
          </DialogHeader>
          {alertaOS && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-semibold">{alertaOS.equipamento}</p>
                <p className="mt-1 text-sm text-destructive">Sem comunicação: {alertaOS.tempo_sem_comunicacao}</p>
                <p className="mt-1 text-xs text-muted-foreground">{alertaOS.grupo} · {alertaOS.operacao}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="solinftec-numero-os">Número da OS</Label>
                <Input
                  id="solinftec-numero-os"
                  value={numeroOS}
                  onChange={(event) => setNumeroOS(event.target.value)}
                  placeholder="Digite o número oficial da OS"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">A nova OS ficará como pendente e sem técnico atribuído, para a gestão distribuir depois.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertaOS(null)} disabled={salvandoOS}>
              <X className="mr-2 size-4" /> Cancelar
            </Button>
            <Button onClick={() => void criarOS()} disabled={!PODE_CRIAR_OS || salvandoOS || !numeroOS.trim()}>
              {salvandoOS && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Criar OS pendente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "red" | "neutral";
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100",
    red: "border-rose-200 bg-rose-50/60 text-rose-950 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100",
    neutral: "border-border bg-card text-foreground",
  };
  return (
    <section className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 ${styles[tone]}`}>
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-background/80">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="mt-0.5 break-words text-2xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-xs opacity-70">{detail}</p>
      </div>
    </section>
  );
}
