import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  ChevronRight,
  Gauge,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Tractor,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Ordem = Tables<"ordens_servico">;
type Period = "all" | "30" | "90" | "365";

export const Route = createFileRoute("/_authenticated/analises")({
  head: () => ({
    meta: [
      { title: "Análise Técnica — Central OS" },
      { name: "description", content: "Indicadores técnicos, serviços, peças e recorrências da manutenção." },
    ],
  }),
  component: TechnicalAnalysis,
});

async function getAnalysisData() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("A sessão terminou. Entre novamente.");

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("user_id", authData.user.id);

  if (roleError) throw roleError;
  const role = roleRows?.[0]?.role ?? "tecnico";
  if (role !== "gestor") throw new Error("A análise técnica está disponível apenas para gestores.");

  const { data: orders, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  return { user: authData.user, orders: orders ?? [] };
}

function TechnicalAnalysis() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [selectedFleet, setSelectedFleet] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["technical-analysis"],
    queryFn: getAnalysisData,
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("analises_tecnicas_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, () => {
        queryClient.invalidateQueries({ queryKey: ["technical-analysis"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const allOrders = query.data?.orders ?? [];
  const scopedOrders = useMemo(() => {
    const now = new Date();
    if (period === "all") return allOrders;

    const days = Number(period);
    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() - days);
    return allOrders.filter((order) => new Date(order.created_at) >= minDate);
  }, [allOrders, period]);

  const orders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return scopedOrders;
    return scopedOrders.filter((order) =>
      [
        order.numero_os,
        order.frota,
        order.localizacao,
        order.descricao,
        order.tecnico_nome,
        order.tecnico_email,
        order.notas_fecho,
        order.pecas_utilizadas,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [scopedOrders, search]);

  const metrics = useMemo(() => buildMetrics(scopedOrders), [scopedOrders]);
  const monthly = useMemo(() => buildMonthly(allOrders), [allOrders]);
  const serviceRows = useMemo(() => buildServiceRows(scopedOrders), [scopedOrders]);
  const partRows = useMemo(() => buildPartRows(scopedOrders), [scopedOrders]);
  const recurrenceRows = useMemo(() => buildRecurrenceRows(scopedOrders), [scopedOrders]);
  const technicianRows = useMemo(() => buildTechnicianRows(scopedOrders), [scopedOrders]);
  const fleetRows = useMemo(
    () => buildFleetRows(allOrders.filter((order) => order.status === "concluida")),
    [allOrders],
  );
  const selectedFleetOrders = useMemo(
    () => selectedFleet
      ? allOrders
          .filter((order) => String(order.frota).trim().toLocaleLowerCase("pt-BR") === selectedFleet.toLocaleLowerCase("pt-BR"))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : [],
    [allOrders, selectedFleet],
  );

  if (query.isPending) return <AnalysisLoading />;
  if (query.isError) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-lg font-bold">Não foi possível abrir a análise</h1>
          <p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p>
          <Button className="mt-5" onClick={() => void navigate({ to: "/dashboard" })}>Voltar ao painel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-3 py-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void navigate({ to: "/dashboard" })}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
              aria-label="Voltar ao painel"
            >
              <Wrench className="size-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Gauge className="size-3.5" />
                Central OS · Inteligência de manutenção
              </div>
              <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight sm:text-2xl">Análise técnica</h1>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0 gap-2"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["technical-analysis"] })}
          >
            <RefreshCw className="size-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] space-y-5 p-3 sm:p-5 lg:p-8">
        <section className="rounded-2xl border bg-gradient-to-br from-card via-card to-muted/40 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Activity className="size-4" />
                Visão geral da manutenção
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Leitura operacional das ordens armazenadas: execução, peças utilizadas, produtividade e sinais de recorrência por frota e tipo de serviço.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar OS, frota, técnico..."
                  className="h-10 bg-background pl-9"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
                <Filter className="ml-2 size-4 text-muted-foreground" />
                {(
                  [
                    ["all", "Todo o histórico"],
                    ["30", "30 dias"],
                    ["90", "90 dias"],
                    ["365", "12 meses"],
                  ] as Array<[Period, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    className={
                      value === period
                        ? "rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                        : "rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi icon={<ClipboardList />} label="OS analisadas" value={formatNumber(metrics.total)} detail={periodLabel(period)} />
          <Kpi icon={<CheckCircle2 />} label="Serviços realizados" value={formatNumber(metrics.completed)} detail={metrics.total ? metrics.completionRate + "% concluídas" : "Sem registros"} />
          <Kpi icon={<Activity />} label="OS abertas" value={formatNumber(metrics.open)} detail={metrics.inProgress + " em andamento"} />
          <Kpi icon={<Package />} label="Peças lançadas" value={formatNumber(metrics.partsLines)} detail={metrics.uniqueParts + " tipos diferentes"} />
          <Kpi icon={<TrendingUpIcon />} label="OS em recorrência" value={formatNumber(metrics.recurrentOrders)} detail={metrics.recurrenceRate + "% do período"} />
          <Kpi icon={<Clock3 />} label="Tempo médio" value={formatDuration(metrics.averageHours)} detail="Início → fechamento" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Panel
            title="Volume de OS por mês"
            subtitle="Evolução das ordens abertas nos últimos 12 meses."
            icon={<BarChart3 className="size-4" />}
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pendentes" name="Pendentes" stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Situação atual"
            subtitle="Distribuição do período selecionado."
            icon={<Settings2 className="size-4" />}
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.statusRows} layout="vertical" margin={{ top: 5, right: 18, left: 16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.35} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="label" width={84} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="OS" radius={[0, 7, 7, 0]} fill="#334155" barSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Panel
            title="Serviços realizados"
            subtitle="Classificação automática da descrição e notas de fechamento."
            icon={<Wrench className="size-4" />}
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceRows} layout="vertical" margin={{ top: 5, right: 18, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.35} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="service" width={118} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="OS" fill="#0f766e" radius={[0, 6, 6, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Peças mais utilizadas"
            subtitle="Cada linha gravada em 'Peças trocadas' representa um lançamento."
            icon={<Package className="size-4" />}
          >
            {partRows.length ? (
              <div className="space-y-3">
                {partRows.slice(0, 8).map((row, index) => (
                  <div key={row.name} className="grid grid-cols-[20px_1fr_auto] items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{row.name}</div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: Math.max(8, (row.total / partRows[0].total) * 100) + "%" }} />
                      </div>
                    </div>
                    <span className="text-sm font-bold">{row.total}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Nenhuma peça foi registrada nas OS deste período." />
            )}
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Panel
            title="Recorrências de manutenção"
            subtitle="Mesmo tipo de serviço na mesma frota aparece como recorrência a partir da 2ª ocorrência."
            icon={<ShieldAlert className="size-4" />}
            tone={recurrenceRows.length ? "warning" : "normal"}
          >
            {recurrenceRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">Frota</th>
                      <th className="px-2 py-2 font-semibold">Serviço</th>
                      <th className="px-2 py-2 font-semibold">Ocorr.</th>
                      <th className="px-2 py-2 font-semibold">Última OS</th>
                      <th className="px-2 py-2 font-semibold">Último registro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recurrenceRows.slice(0, 10).map((row) => (
                      <tr key={row.key} className="hover:bg-muted/30">
                        <td className="px-2 py-3 font-bold">{row.frota}</td>
                        <td className="px-2 py-3">{row.service}</td>
                        <td className="px-2 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{row.total}x</span></td>
                        <td className="px-2 py-3 font-semibold">{row.numeroOs}</td>
                        <td className="px-2 py-3 text-xs text-muted-foreground">{formatDate(row.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-7 text-center">
                <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
                <p className="mt-2 text-sm font-semibold">Nenhuma recorrência identificada</p>
                <p className="mt-1 text-xs text-muted-foreground">O período selecionado não possui duas ocorrências do mesmo serviço na mesma frota.</p>
              </div>
            )}
          </Panel>

          <Panel
            title="Produtividade por técnico"
            subtitle="Volume de OS concluídas no período selecionado."
            icon={<Tractor className="size-4" />}
          >
            {technicianRows.length ? (
              <div className="space-y-3">
                {technicianRows.slice(0, 8).map((row, index) => (
                  <div key={row.name} className="flex items-center gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{row.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.completed} concluídas · {row.total} atribuídas</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{row.rate}%</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">conclusão</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Ainda não há técnicos com OS atribuídas." />
            )}
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.6fr]">
          <Panel
            title="Histórico por frota"
            subtitle="Clique em qualquer frota para abrir todo o histórico de manutenção dela, sem limitar pelo período."
            icon={<Tractor className="size-4" />}
          >
            {fleetRows.length ? (
              <div className="max-h-[520px] overflow-y-auto">
                <div className="space-y-1">
                  {fleetRows.map((row) => {
                    const active = selectedFleet?.toLocaleLowerCase("pt-BR") === row.frota.toLocaleLowerCase("pt-BR");
                    return (
                      <button
                        key={row.frota}
                        type="button"
                        onClick={() => setSelectedFleet(row.frota)}
                        className={[
                          "grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:border-border hover:bg-muted/40",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{row.frota}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.total} {row.total === 1 ? "manutenção" : "manutenções"} · última {formatDateOnly(row.lastDate)}
                          </div>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold">{row.completed} concluída(s)</span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState text="Nenhuma frota cadastrada nas OS." />
            )}
          </Panel>

          <Panel
            title={selectedFleet ? "Histórico completo · " + selectedFleet : "Selecione uma frota"}
            subtitle={selectedFleet ? "Todas as ordens registradas para esta frota, da mais recente para a mais antiga." : "A seleção mostra OS, problema, serviço, peças, técnico e datas de atendimento."}
            icon={<ClipboardList className="size-4" />}
          >
            {!selectedFleet ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <div>
                  <Tractor className="mx-auto size-9 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold">Escolha uma frota ao lado</p>
                  <p className="mt-1 text-xs text-muted-foreground">O sistema carregará todo o histórico de manutenção armazenado.</p>
                </div>
              </div>
            ) : selectedFleetOrders.length ? (
              <div className="space-y-2">
                {selectedFleetOrders.map((order, index) => {
                  const parts = extractParts(order.pecas_utilizadas);
                  return (
                    <div key={order.id} className="rounded-xl border p-3 transition-colors hover:bg-muted/25">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">OS {order.numero_os}</span>
                            <StatusBadge status={order.status} />
                            {index === 0 && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">Mais recente</span>}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{formatDate(order.created_at)} · {serviceCategory(order)}</div>
                        </div>
                        <div className="text-left text-xs text-muted-foreground sm:text-right">
                          <div><strong className="text-foreground">Técnico:</strong> {order.tecnico_nome || order.tecnico_email || "Sem técnico"}</div>
                          <div className="mt-1"><strong className="text-foreground">Atendimento:</strong> {order.data_inicio ? formatDate(order.data_inicio) : "Não iniciado"} → {order.concluida_em ? formatDate(order.concluida_em) : "Em aberto"}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Problema / serviço</div>
                          <p className="mt-1 text-sm leading-5">{order.descricao || order.notas_fecho || "Sem descrição registrada."}</p>
                          {order.notas_fecho && order.descricao && <p className="mt-1 text-xs text-muted-foreground"><strong>Fechamento:</strong> {order.notas_fecho}</p>}
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Peças trocadas</div>
                          {parts.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {parts.map((part) => <span key={part} className="rounded-md bg-muted px-2 py-1 text-xs">{part}</span>)}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">Nenhuma peça registrada.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Não há OS registradas para esta frota." />
            )}
          </Panel>
        </section>

        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-primary" />
                  <h2 className="font-bold">Base técnica · todas as OS</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{orders.length} registros exibidos · dados persistidos na base oficial do Central OS.</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">{periodLabel(period)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">OS</th>
                  <th className="px-3 py-2.5">Frota</th>
                  <th className="px-3 py-2.5">Serviço / problema</th>
                  <th className="px-3 py-2.5">Peças</th>
                  <th className="px-3 py-2.5">Técnico</th>
                  <th className="px-3 py-2.5">Abertura</th>
                  <th className="px-3 py-2.5">Início</th>
                  <th className="px-3 py-2.5">Fechamento</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((order) => {
                  const partCount = extractParts(order.pecas_utilizadas).length;
                  return (
                    <tr key={order.id} className="hover:bg-muted/25">
                      <td className="px-3 py-3 font-bold">{order.numero_os}</td>
                      <td className="px-3 py-3 font-semibold">{order.frota}</td>
                      <td className="max-w-[320px] px-3 py-3">
                        <div className="truncate font-medium">{order.descricao || "Sem descrição"}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{serviceCategory(order)}</div>
                      </td>
                      <td className="px-3 py-3">{partCount ? partCount + " lançada(s)" : "—"}</td>
                      <td className="px-3 py-3">{order.tecnico_nome || order.tecnico_email || "Sem técnico"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatDate(order.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{order.data_inicio ? formatDate(order.data_inicio) : "Não iniciado"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{order.concluida_em ? formatDate(order.concluida_em) : "Em andamento"}</td>
                      <td className="px-3 py-3"><StatusBadge status={order.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!orders.length && <div className="p-10"><EmptyState text="Nenhuma OS encontrada para o filtro atual." /></div>}
        </section>
      </main>
    </div>
  );
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
  tone = "normal",
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "normal" | "warning";
}) {
  return (
    <section className={[
      "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
      tone === "warning" ? "border-amber-200 dark:border-amber-900/60" : "",
    ].join(" ")}>
      <div className="mb-4 flex items-start gap-3">
        <span className={[
          "grid size-9 shrink-0 place-items-center rounded-xl",
          tone === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-primary",
        ].join(" ")}>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    em_andamento: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
    concluida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    cancelada: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  const label: Record<string, string> = {
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluida: "Concluída",
    cancelada: "Cancelada",
  };

  return (
    <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (map[status] ?? "bg-muted text-foreground")}>
      {label[status] ?? status}
    </span>
  );
}

function TrendingUpIcon() {
  return <TrendingUp className="size-4" />;
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function AnalysisLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        Carregando análise técnica...
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  if (hours < 1) return Math.round(hours * 60) + " min";
  if (hours < 24) return hours.toFixed(1) + " h";
  return (hours / 24).toFixed(1) + " d";
}

function periodLabel(period: Period) {
  return ({
    all: "Todo o histórico",
    "30": "Últimos 30 dias",
    "90": "Últimos 90 dias",
    "365": "Últimos 12 meses",
  } as Record<Period, string>)[period];
}

function extractParts(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serviceCategory(order: Ordem) {
  const text = (
    (order.descricao ?? "") +
    " " +
    (order.notas_fecho ?? "")
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/motor|oleo|injec|combust|turbo|bomba/.test(text)) return "Motor";
  if (/eletr|eletric|chicote|sensor|fusivel|bateria|alternador|arranque/.test(text)) return "Elétrica";
  if (/hidraul|valvula|mangue|cilindro|pressao/.test(text)) return "Hidráulica";
  if (/transmiss|embreagem|cambio|diferencial|eixo/.test(text)) return "Transmissão";
  if (/ar.?cond|climat|compressor/.test(text)) return "Ar-condicionado";
  if (/pneu|roda|direcao|freio/.test(text)) return "Rodagem / freios";
  if (/lubr|graxa|filtro|engrax/.test(text)) return "Lubrificação";
  if (/plantad|colheit|pulveriz|implement|semead|agricol/.test(text)) return "Implemento agrícola";
  return "Manutenção geral";
}

function buildMetrics(orders: Ordem[]) {
  const total = orders.length;
  const completed = orders.filter((o) => o.status === "concluida").length;
  const inProgress = orders.filter((o) => o.status === "em_andamento").length;
  const pending = orders.filter((o) => o.status === "pendente").length;
  const canceled = orders.filter((o) => o.status === "cancelada").length;
  const open = pending + inProgress;
  const partsLines = orders.reduce((sum, order) => sum + extractParts(order.pecas_utilizadas).length, 0);
  const uniqueParts = new Set(
    orders.flatMap((order) => extractParts(order.pecas_utilizadas).map((part) => part.toLocaleLowerCase("pt-BR"))),
  ).size;

  const durations = orders
    .filter((order) => order.data_inicio && order.concluida_em)
    .map((order) => (new Date(order.concluida_em!).getTime() - new Date(order.data_inicio!).getTime()) / 3_600_000)
    .filter((hours) => Number.isFinite(hours) && hours > 0);
  const averageHours = durations.length ? durations.reduce((sum, hours) => sum + hours, 0) / durations.length : 0;

  const recurrenceRows = buildRecurrenceRows(orders);
  const recurrentOrders = recurrenceRows.reduce((sum, row) => sum + row.total, 0);

  return {
    total,
    completed,
    inProgress,
    pending,
    canceled,
    open,
    partsLines,
    uniqueParts,
    averageHours,
    recurrentOrders,
    recurrenceRate: total ? Math.round((recurrentOrders / total) * 100) : 0,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    statusRows: [
      { label: "Pendente", total: pending },
      { label: "Em andamento", total: inProgress },
      { label: "Concluída", total: completed },
      { label: "Cancelada", total: canceled },
    ],
  };
}

function buildMonthly(orders: Ordem[]) {
  const months: Array<{ key: string; month: string; total: number; concluidas: number; pendentes: number }> = [];
  const now = new Date();

  for (let offset = 11; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
    months.push({
      key,
      month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      total: 0,
      concluidas: 0,
      pendentes: 0,
    });
  }

  for (const order of orders) {
    const date = new Date(order.created_at);
    const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
    const row = months.find((item) => item.key === key);
    if (!row) continue;
    row.total++;
    if (order.status === "concluida") row.concluidas++;
    if (order.status === "pendente") row.pendentes++;
  }

  return months;
}

function buildServiceRows(orders: Ordem[]) {
  const completedOrders = orders.filter((order) => order.status === "concluida");
  const source = completedOrders.length ? completedOrders : orders;
  const counts = new Map<string, number>();

  for (const order of source) {
    const category = serviceCategory(order);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([service, total]) => ({ service, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function buildPartRows(orders: Ordem[]) {
  const counts = new Map<string, number>();

  for (const order of orders) {
    for (const part of extractParts(order.pecas_utilizadas)) {
      const key = part.toLocaleLowerCase("pt-BR");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, total]) => ({ name: restorePartDisplayName(name, orders), total }))
    .sort((a, b) => b.total - a.total);
}

function restorePartDisplayName(key: string, orders: Ordem[]) {
  for (const order of orders) {
    const part = extractParts(order.pecas_utilizadas).find((value) => value.toLocaleLowerCase("pt-BR") === key);
    if (part) return part;
  }
  return key;
}

function buildRecurrenceRows(orders: Ordem[]) {
  const groups = new Map<string, { key: string; frota: string; service: string; total: number; lastDate: string; numeroOs: string }>();

  for (const order of orders) {
    const frota = String(order.frota || "Sem frota").trim();
    const service = serviceCategory(order);
    const key = frota.toLocaleLowerCase("pt-BR") + "||" + service.toLocaleLowerCase("pt-BR");
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        key,
        frota,
        service,
        total: 1,
        lastDate: order.created_at,
        numeroOs: order.numero_os,
      });
      continue;
    }

    current.total++;
    if (new Date(order.created_at) > new Date(current.lastDate)) {
      current.lastDate = order.created_at;
      current.numeroOs = order.numero_os;
    }
  }

  return [...groups.values()]
    .filter((row) => row.total >= 2)
    .sort((a, b) => b.total - a.total || new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
}

function buildFleetRows(orders: Ordem[]) {
  const groups = new Map<string, { frota: string; total: number; completed: number; lastDate: string }>();

  for (const order of orders) {
    const frota = String(order.frota ?? "").trim() || "Sem frota";
    const key = frota.toLocaleLowerCase("pt-BR");
    const current = groups.get(key) ?? { frota, total: 0, completed: 0, lastDate: order.created_at };
    current.total++;
    current.completed++;
    if (new Date(order.created_at).getTime() > new Date(current.lastDate).getTime()) current.lastDate = order.created_at;
    groups.set(key, current);
  }

  return [...groups.values()].sort(
    (a, b) => b.total - a.total || new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime(),
  );
}

function buildTechnicianRows(orders: Ordem[]) {
  const groups = new Map<string, { name: string; total: number; completed: number }>();

  for (const order of orders) {
    const name = order.tecnico_nome?.trim() || order.tecnico_email?.trim() || "Sem técnico";
    const current = groups.get(name) ?? { name, total: 0, completed: 0 };
    current.total++;
    if (order.status === "concluida") current.completed++;
    groups.set(name, current);
  }

  return [...groups.values()]
    .map((row) => ({ ...row, rate: row.total ? Math.round((row.completed / row.total) * 100) : 0 }))
    .sort((a, b) => b.completed - a.completed || b.total - a.total);
}
