import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, History, Search } from "lucide-react";
import { utils, writeFile } from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/historico")({ component: HistoryPage });
type Ordem = Tables<"ordens_servico">;
type Historico = Tables<"historico_edicoes">;

function HistoryPage() {
  const [orders, setOrders] = useState<Ordem[]>([]);
  const [logs, setLogs] = useState<Historico[]>([]);
  const [search, setSearch] = useState("");
  const [tech, setTech] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", auth.user.id).maybeSingle();
      if (role?.role !== "gestor") return;
      const [{ data: os }, { data: history }] = await Promise.all([
        supabase.from("ordens_servico").select("*").order("created_at", { ascending: false }),
        supabase.from("historico_edicoes").select("*").order("created_at", { ascending: false }),
      ]);
      setOrders(os ?? []); setLogs(history ?? []);
    })();
  }, []);

  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const technicians = useMemo(() => [...new Set(orders.map(o => o.tecnico_nome || o.tecnico_email).filter(Boolean))], [orders]);
  const filteredOrders = useMemo(() => orders.filter(o => {
    const hay = [o.numero_os, o.frota, o.localizacao, o.descricao, o.tecnico_nome, o.tecnico_email].join(" ").toLowerCase();
    return (!search || hay.includes(search.toLowerCase())) && (!tech || (o.tecnico_nome || o.tecnico_email) === tech) && (!status || o.status === status) && (!from || o.created_at >= from) && (!to || o.created_at <= to + "T23:59:59");
  }), [orders, search, tech, status, from, to]);
  const filteredLogs = useMemo(() => logs.filter(l => {
    const o = orderMap.get(l.os_id);
    return o && filteredOrders.some(x => x.id === o.id);
  }), [logs, orderMap, filteredOrders]);

  function exportExcel() {
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(filteredOrders.map(o => ({
      OS: o.numero_os, Frota: o.frota, Localização: o.localizacao, Técnico: o.tecnico_nome || o.tecnico_email,
      Status: o.status === "concluida" ? "Finalizada" : o.status, Aberta: o.created_at, Início: o.data_inicio, Fim: o.concluida_em, Serviço: o.notas_fecho
    }))), "OS");
    utils.book_append_sheet(wb, utils.json_to_sheet(filteredLogs.map(l => ({
      OS: orderMap.get(l.os_id)?.numero_os || l.os_id, Ação: l.acao === "concluida" ? "finalizada" : l.acao, Detalhe: l.detalhe,
      DataHora: l.created_at, Responsável: l.usuario_email, Técnico: orderMap.get(l.os_id)?.tecnico_nome || orderMap.get(l.os_id)?.tecnico_email
    }))), "Ações");
    writeFile(wb, `historico-os-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return <main className="min-h-screen bg-[var(--agri-straw)]">
    <header className="border-b bg-[var(--agri-field)] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5"><div><Link to="/dashboard" className="mb-2 inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"><ArrowLeft className="size-4" /> Voltar ao Painel</Link><h1 className="flex items-center gap-2 text-2xl font-black"><History /> Histórico de serviços</h1></div><Button onClick={exportExcel} className="bg-[var(--agri-wheat)] text-[var(--agri-earth)] hover:bg-[var(--agri-wheat)]"><Download /> Exportar XLSX</Button></div></header>
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-5">
        <div className="relative md:col-span-2"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar OS, frota, técnico..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={tech} onChange={e => setTech(e.target.value)}><option value="">Todos os técnicos</option>{technicians.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Finalizada</option><option value="cancelada">Cancelada</option></select>
        <div className="flex gap-2"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/60 text-left"><th className="p-3">Data</th><th className="p-3">OS</th><th className="p-3">Técnico</th><th className="p-3">Responsável</th><th className="p-3">Ação</th><th className="p-3">Detalhe</th></tr></thead><tbody>{filteredLogs.map(l => { const o=orderMap.get(l.os_id); return <tr key={l.id} className="border-b last:border-0"><td className="whitespace-nowrap p-3">{new Date(l.created_at).toLocaleString("pt-BR")}</td><td className="p-3 font-semibold">{o?.numero_os || "—"}</td><td className="p-3">{o?.tecnico_nome || o?.tecnico_email || "—"}</td><td className="p-3">{l.usuario_email}</td><td className="p-3 font-semibold">{l.acao === "concluida" ? "finalizada" : l.acao}</td><td className="max-w-md p-3 text-muted-foreground">{l.detalhe}</td></tr>})}</tbody></table>{!filteredLogs.length && <div className="p-12 text-center text-muted-foreground">Nenhum registro encontrado.</div>}</div>
    </section>
  </main>;
}
