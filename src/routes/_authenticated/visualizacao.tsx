import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Eye, History, Search, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Ordem = Tables<"ordens_servico">;
type Historico = Tables<"historico_edicoes">;

export const Route = createFileRoute("/_authenticated/visualizacao")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
    const { data: allowed } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "visualizador" });
    if (!allowed) throw redirect({ to: "/tecnico", replace: true });
  },
  component: ViewerPage,
});

function ViewerPage() {
  const [orders, setOrders] = useState<Ordem[]>([]);
  const [logs, setLogs] = useState<Historico[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const [osResult, logResult] = await Promise.all([
        supabase.from("ordens_servico").select("*").order("created_at", { ascending: false }),
        supabase.from("historico_edicoes").select("*").order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (osResult.error || logResult.error) setError("Não foi possível carregar os dados. Confirme as permissões do banco de teste.");
      else { setOrders(osResult.data ?? []); setLogs(logResult.data ?? []); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => orders.filter(o => [o.numero_os, o.frota, o.setor, o.localizacao, o.descricao, o.tecnico_nome, o.tecnico_email, o.status].join(" ").toLowerCase().includes(search.toLowerCase())), [orders, search]);
  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const filteredLogs = useMemo(() => logs.filter(l => {
    const o = orderMap.get(l.os_id);
    return [o?.numero_os, o?.frota, l.acao, l.detalhe, l.usuario_email].join(" ").toLowerCase().includes(search.toLowerCase());
  }), [logs, orderMap, search]);
  const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
  async function logout() { await supabase.auth.signOut(); window.location.href = "/"; }
  return <main className="min-h-screen bg-[var(--agri-straw)]">
    <header className="bg-[var(--agri-field)] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-5">
      <div><p className="flex items-center gap-2 text-sm opacity-90"><Eye className="size-4" /> Perfil somente visualização</p><h1 className="text-2xl font-black">Consulta de Ordens de Serviço</h1><p className="mt-1 text-sm opacity-80">Acesso de leitura. Não é possível alterar nem exportar dados.</p></div>
      <Button variant="outline" onClick={() => void logout()} className="text-foreground"><LogOut className="mr-2 size-4" /> Sair</Button>
    </div></header>
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por OS, frota, setor, localização ou técnico..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {loading ? <p className="p-6 text-center">Carregando dados...</p> : <Tabs defaultValue="os" className="space-y-4">
        <TabsList><TabsTrigger value="os">Todas as OS ({filtered.length})</TabsTrigger><TabsTrigger value="historico"><History className="mr-2 size-4" /> Histórico ({filteredLogs.length})</TabsTrigger></TabsList>
        <TabsContent value="os"><div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/60 text-left"><th className="p-3">OS</th><th className="p-3">Frota</th><th className="p-3">Setor</th><th className="p-3">Localização</th><th className="p-3">Descrição</th><th className="p-3">Técnico</th><th className="p-3">Status</th><th className="p-3">Abertura</th><th className="p-3">Início</th><th className="p-3">Conclusão</th><th className="p-3">Peças</th><th className="p-3">Serviço realizado</th></tr></thead><tbody>{filtered.map(o => <tr key={o.id} className="border-b last:border-0 align-top"><td className="p-3 font-semibold">{o.numero_os || "—"}</td><td className="p-3">{o.frota || "—"}</td><td className="p-3">{o.setor || "—"}</td><td className="p-3">{o.localizacao || "—"}</td><td className="max-w-xs whitespace-pre-wrap p-3">{o.descricao || "—"}</td><td className="p-3">{o.tecnico_nome || o.tecnico_email || "—"}</td><td className="p-3">{o.status || "—"}</td><td className="whitespace-nowrap p-3">{date(o.created_at)}</td><td className="whitespace-nowrap p-3">{date(o.data_inicio)}</td><td className="whitespace-nowrap p-3">{date(o.concluida_em)}</td><td className="whitespace-pre-wrap p-3">{o.pecas_utilizadas || "—"}</td><td className="whitespace-pre-wrap p-3">{o.notas_fecho || "—"}</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-6 text-center text-muted-foreground">Nenhuma OS encontrada.</p>}</div></TabsContent>
        <TabsContent value="historico"><div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/60 text-left"><th className="p-3">Data/hora</th><th className="p-3">OS</th><th className="p-3">Ação</th><th className="p-3">Detalhes</th><th className="p-3">Responsável</th></tr></thead><tbody>{filteredLogs.map(l => <tr key={l.id} className="border-b last:border-0 align-top"><td className="whitespace-nowrap p-3">{date(l.created_at)}</td><td className="p-3 font-semibold">{orderMap.get(l.os_id)?.numero_os || "—"}</td><td className="p-3">{l.acao}</td><td className="whitespace-pre-wrap p-3">{l.detalhe || "—"}</td><td className="p-3">{l.usuario_email || "—"}</td></tr>)}</tbody></table>{filteredLogs.length === 0 && <p className="p-6 text-center text-muted-foreground">Nenhum registro encontrado.</p>}</div></TabsContent>
      </Tabs>}
    </section>
  </main>;
}
