import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Boxes, CarFront, History, Plus, RefreshCw, Search, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Unidade = { id: string; nome: string };
type Frota = { id: string; unidade_id: string; numero: string; tipo: string; marca: string | null; modelo: string | null; status: string };
type Componente = { id: string; unidade_id: string; tipo: string; fabricante: string | null; modelo: string | null; numero_serie: string; status: string };
type Instalacao = {
  id: string; frota_id: string; componente_id: string; unidade_id: string;
  instalado_em: string; instalado_por_email: string | null; retirado_em: string | null;
  retirado_por_email: string | null; motivo_retirada: string | null;
  status_apos_retirada: string | null;
  frotas?: { numero: string; tipo: string } | null;
  componentes_frota?: { tipo: string; numero_serie: string } | null;
};

export const Route = createFileRoute("/_authenticated/frota")({
  head: () => ({ meta: [{ title: "Central Frota — Central OS" }, { name: "description", content: "Cadastro e histórico de equipamentos instalados na frota." }] }),
  component: CentralFrotaPage,
});

const tiposFrota = [
  ["trator", "Trator"], ["colheitadeira", "Colheitadeira"],
  ["caminhao", "Caminhão"], ["veiculo", "Veículo"],
] as const;
const tiposComponente = [
  ["monitor", "Monitor"], ["receptor", "Receptor GPS"], ["bordo_solinftec", "Bordo Solinftec"],
  ["tela_solinftec", "Tela Solinftec"], ["rastreador", "Rastreador"], ["radio", "Rádio"], ["outro", "Outro"],
] as const;

function CentralFrotaPage() {
  const [tab, setTab] = useState<"frotas" | "componentes" | "instalacoes" | "historico">("frotas");
  const [units, setUnits] = useState<Unidade[]>([]);
  const [isCentralManager, setIsCentralManager] = useState(false);
  const [fleets, setFleets] = useState<Frota[]>([]);
  const [components, setComponents] = useState<Componente[]>([]);
  const [installations, setInstallations] = useState<Instalacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [fleetForm, setFleetForm] = useState({ unidade_id: "", numero: "", tipo: "trator", marca: "", modelo: "" });
  const [componentForm, setComponentForm] = useState({ unidade_id: "", tipo: "monitor", fabricante: "", modelo: "", numero_serie: "" });
  const [installForm, setInstallForm] = useState({ frota_id: "", componente_id: "" });
  const [removal, setRemoval] = useState({ id: "", motivo: "", status: "disponivel" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sessão não autenticada.");
      const { data: memberships, error: membershipError } = await (supabase as any)
        .from("usuarios_unidades").select("unidade_id,perfil").eq("user_id", authData.user.id).eq("ativo", true);
      if (membershipError) throw membershipError;
      const central = (memberships ?? []).some((item: any) => item.perfil === "gestor_central" && item.unidade_id === null);
      setIsCentralManager(central);
      const [unitResult, fleetResult, componentResult, installationResult] = await Promise.all([
        (supabase as any).from("unidades").select("id,nome").order("nome"),
        (supabase as any).from("frotas").select("*").order("numero"),
        (supabase as any).from("componentes_frota").select("*").order("numero_serie"),
        (supabase as any).from("instalacoes_frota")
          .select("*,frotas(numero,tipo),componentes_frota(tipo,numero_serie)")
          .order("instalado_em", { ascending: false }),
      ]);
      const failure = unitResult.error || fleetResult.error || componentResult.error || installationResult.error;
      if (failure) throw failure;
      const memberUnitIds = new Set((memberships ?? []).map((item: any) => item.unidade_id).filter(Boolean));
      const allowedUnits = (unitResult.data ?? []).filter((unit: Unidade) => central || memberUnitIds.has(unit.id));
      setUnits(allowedUnits);
      setFleets(fleetResult.data ?? []);
      setComponents(componentResult.data ?? []);
      setInstallations(installationResult.data ?? []);
      setFleetForm(current => ({ ...current, unidade_id: allowedUnits.some((u: Unidade) => u.id === current.unidade_id) ? current.unidade_id : allowedUnits[0]?.id || "" }));
      setComponentForm(current => ({ ...current, unidade_id: allowedUnits.some((u: Unidade) => u.id === current.unidade_id) ? current.unidade_id : allowedUnits[0]?.id || "" }));
    } catch (error) {
      toast.error("Não foi possível carregar o Central Frota. Verifique se a estrutura de teste foi aplicada.");
      console.error("[Central Frota]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeInstallations = useMemo(() => installations.filter(item => !item.retirado_em), [installations]);
  const filteredFleets = fleets.filter(item => `${item.numero} ${item.marca ?? ""} ${item.modelo ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredComponents = components.filter(item => `${item.numero_serie} ${item.fabricante ?? ""} ${item.modelo ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedFleet = fleets.find(item => item.id === selectedFleetId) ?? null;
  const selectedComponent = components.find(item => item.id === selectedComponentId) ?? null;
  const fleetInstallations = selectedFleet ? installations.filter(item => item.frota_id === selectedFleet.id) : [];
  const componentInstallations = selectedComponent ? installations.filter(item => item.componente_id === selectedComponent.id) : [];
  const currentComponentInstallation = selectedComponent ? activeInstallations.find(item => item.componente_id === selectedComponent.id) : null;
  const currentComponentFleet = currentComponentInstallation ? fleets.find(item => item.id === currentComponentInstallation.frota_id) : null;
  const siblingInstallations = currentComponentFleet ? activeInstallations.filter(item => item.frota_id === currentComponentFleet.id) : [];

  async function saveFleet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fleetForm.unidade_id || !fleetForm.numero.trim()) return toast.error("Selecione a unidade e informe o número da frota.");
    setSaving(true);
    const { error } = await (supabase as any).from("frotas").insert({
      ...fleetForm, numero: fleetForm.numero.trim(), marca: fleetForm.marca.trim() || null, modelo: fleetForm.modelo.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message.includes("unique") ? "Esse número já está cadastrado nesta unidade." : "Não foi possível cadastrar a frota: " + error.message);
    toast.success("Frota cadastrada.");
    setFleetForm(current => ({ ...current, numero: "", marca: "", modelo: "" }));
    await load();
  }

  async function saveComponent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!componentForm.unidade_id || !componentForm.numero_serie.trim()) return toast.error("Selecione a unidade e informe o número de série.");
    setSaving(true);
    const { error } = await (supabase as any).from("componentes_frota").insert({
      ...componentForm, numero_serie: componentForm.numero_serie.trim(),
      fabricante: componentForm.fabricante.trim() || null, modelo: componentForm.modelo.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message.includes("unique") ? "Esse número de série já está cadastrado." : "Não foi possível cadastrar o componente: " + error.message);
    toast.success("Componente cadastrado.");
    setComponentForm(current => ({ ...current, numero_serie: "", fabricante: "", modelo: "" }));
    await load();
  }

  async function installComponent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fleet = fleets.find(item => item.id === installForm.frota_id);
    const component = components.find(item => item.id === installForm.componente_id);
    if (!fleet || !component) return toast.error("Selecione a frota e o componente.");
    if (fleet.unidade_id !== component.unidade_id) return toast.error("A frota e o componente precisam pertencer à mesma unidade.");
    setSaving(true);
    const { error } = await (supabase as any).from("instalacoes_frota").insert({
      unidade_id: fleet.unidade_id, frota_id: fleet.id, componente_id: component.id,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível instalar: " + error.message);
    toast.success("Instalação registrada. O usuário e o horário foram gravados automaticamente.");
    setInstallForm({ frota_id: "", componente_id: "" });
    await load();
  }

  async function removeComponent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!removal.id || !removal.motivo.trim()) return toast.error("Selecione a instalação e informe o motivo da retirada.");
    setSaving(true);
    const { error } = await (supabase as any).from("instalacoes_frota")
      .update({ retirado_em: new Date().toISOString(), motivo_retirada: removal.motivo.trim(), status_apos_retirada: removal.status })
      .eq("id", removal.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível registrar a retirada: " + error.message);
    toast.success("Retirada registrada no histórico.");
    setRemoval({ id: "", motivo: "", status: "disponivel" });
    await load();
  }

  const tabs = [
    { id: "frotas", label: "Frotas", icon: CarFront },
    { id: "componentes", label: "Componentes", icon: Boxes },
    { id: "instalacoes", label: "Instalações", icon: Wrench },
    { id: "historico", label: "Histórico", icon: History },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Truck className="size-6" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Central OS</p><h1 className="text-xl font-bold">Central Frota</h1></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}><ArrowLeft className="mr-1 size-4" /> Voltar</Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-1 size-4" /> Atualizar</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Frotas cadastradas</p><p className="mt-1 text-3xl font-bold tabular-nums">{fleets.length}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Componentes registrados</p><p className="mt-1 text-3xl font-bold tabular-nums">{components.length}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Instalações ativas</p><p className="mt-1 text-3xl font-bold tabular-nums">{activeInstallations.length}</p></div>
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Seções do Central Frota">
          {tabs.map(item => <Button key={item.id} size="sm" variant={tab === item.id ? "default" : "outline"} onClick={() => { setTab(item.id); setSearch(""); }}><item.icon className="mr-1 size-4" />{item.label}</Button>)}
        </nav>


        {tab === "frotas" && selectedFleet && <section className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedFleetId(null)}><ArrowLeft className="mr-2 size-4" />Voltar para frotas</Button>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes da frota</p>
            <h2 className="mt-1 text-2xl font-bold">Frota {selectedFleet.numero}</h2>
            <p className="text-sm text-muted-foreground">{tiposFrota.find(x => x[0] === selectedFleet.tipo)?.[1] ?? selectedFleet.tipo} · {[selectedFleet.marca, selectedFleet.modelo].filter(Boolean).join(" ") || "Marca/modelo não informados"} · {units.find(u => u.id === selectedFleet.unidade_id)?.nome ?? "Unidade"}</p>
            <p className="mt-2 text-sm">Status: <strong>{selectedFleet.status}</strong> · {fleetInstallations.filter(x => !x.retirado_em).length} componente(s) instalado(s) atualmente</p>
          </div>
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Equipamentos relacionados a esta frota</div>
            {fleetInstallations.map(item => <button key={item.id} type="button" onClick={() => { setSelectedComponentId(item.componente_id); setTab("componentes"); }} className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/40">
              <span><strong>{item.componentes_frota?.numero_serie ?? "Componente"}</strong><span className="block text-sm text-muted-foreground">{tiposComponente.find(x => x[0] === item.componentes_frota?.tipo)?.[1] ?? item.componentes_frota?.tipo ?? "Equipamento"} · {item.retirado_em ? "Retirado" : "Instalado atualmente"}</span></span>
              <span className="text-xs text-muted-foreground">{new Date(item.instalado_em).toLocaleDateString("pt-BR")}<span className="ml-2">›</span></span>
            </button>)}
            {!fleetInstallations.length && <p className="p-5 text-sm text-muted-foreground">Nenhum equipamento foi relacionado a esta frota ainda.</p>}
          </div>
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Histórico da frota</div>
            {fleetInstallations.map(item => <div key={item.id} className="space-y-1 border-b px-4 py-3 text-sm last:border-0">
              <p className="font-medium">{item.componentes_frota?.numero_serie ?? "Componente"} · {item.retirado_em ? "Instalação encerrada" : "Em uso"}</p>
              <p className="text-muted-foreground">Instalado em {new Date(item.instalado_em).toLocaleString("pt-BR")} por {item.instalado_por_email || "usuário autenticado"}</p>
              {item.retirado_em && <p className="text-muted-foreground">Retirado em {new Date(item.retirado_em).toLocaleString("pt-BR")} · {item.motivo_retirada || "Motivo não informado"}</p>}
            </div>)}
          </div>
        </section>}

        {tab === "componentes" && selectedComponent && <section className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedComponentId(null)}><ArrowLeft className="mr-2 size-4" />Voltar para componentes</Button>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes do componente</p>
            <h2 className="mt-1 text-2xl font-bold">{selectedComponent.numero_serie}</h2>
            <p className="text-sm text-muted-foreground">{tiposComponente.find(x => x[0] === selectedComponent.tipo)?.[1] ?? selectedComponent.tipo} · {[selectedComponent.fabricante, selectedComponent.modelo].filter(Boolean).join(" ") || "Fabricante/modelo não informados"}</p>
            <p className="mt-2 text-sm">Status: <strong>{selectedComponent.status}</strong> · Unidade: {units.find(u => u.id === selectedComponent.unidade_id)?.nome ?? "—"}</p>
          </div>
          {currentComponentFleet && <div className="rounded-2xl border p-4">
            <p className="text-sm text-muted-foreground">Instalado atualmente na frota</p>
            <button type="button" onClick={() => { setSelectedFleetId(currentComponentFleet.id); setTab("frotas"); }} className="mt-1 flex w-full items-center justify-between text-left text-lg font-semibold hover:text-primary">Frota {currentComponentFleet.numero}<span>›</span></button>
            <p className="text-sm text-muted-foreground">{tiposFrota.find(x => x[0] === currentComponentFleet.tipo)?.[1] ?? currentComponentFleet.tipo} · {[currentComponentFleet.marca, currentComponentFleet.modelo].filter(Boolean).join(" ")}</p>
          </div>}
          {currentComponentFleet && <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Outros componentes desta frota</div>
            {siblingInstallations.map(item => <button key={item.id} type="button" onClick={() => setSelectedComponentId(item.componente_id)} className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/40">
              <span><strong>{item.componentes_frota?.numero_serie ?? "Componente"}</strong><span className="block text-sm text-muted-foreground">{tiposComponente.find(x => x[0] === item.componentes_frota?.tipo)?.[1] ?? item.componentes_frota?.tipo ?? "Equipamento"}</span></span><span className="text-xs text-muted-foreground">Ver detalhes ›</span>
            </button>)}
            {siblingInstallations.length <= 1 && <p className="px-4 py-3 text-sm text-muted-foreground">Este é o único componente instalado atualmente nesta frota.</p>}
          </div>}
          {!currentComponentFleet && <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">Este componente não está instalado em nenhuma frota no momento.</p>}
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Histórico deste componente</div>
            {componentInstallations.map(item => <div key={item.id} className="space-y-1 border-b px-4 py-3 text-sm last:border-0">
              <button type="button" onClick={() => { const f = fleets.find(x => x.id === item.frota_id); if (f) { setSelectedFleetId(f.id); setTab("frotas"); } }} className="font-semibold hover:text-primary">Frota {item.frotas?.numero ?? "—"} ›</button>
              <p className="text-muted-foreground">Instalado em {new Date(item.instalado_em).toLocaleString("pt-BR")} por {item.instalado_por_email || "usuário autenticado"}</p>
              {item.retirado_em && <p className="text-muted-foreground">Retirado em {new Date(item.retirado_em).toLocaleString("pt-BR")} · {item.motivo_retirada || "Motivo não informado"}</p>}
            </div>)}
            {!componentInstallations.length && <p className="p-5 text-sm text-muted-foreground">Este componente ainda não possui histórico de instalação.</p>}
          </div>
        </section>}

        {tab === "frotas" && !selectedFleet && <section className="space-y-4">
          <form onSubmit={saveFleet} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-6">
            <h2 className="font-semibold sm:col-span-6">Cadastrar frota</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2" value={fleetForm.unidade_id} onChange={e => setFleetForm({ ...fleetForm, unidade_id: e.target.value })} required disabled={!isCentralManager && units.length <= 1}>
              <option value="">Unidade</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}
            </select>
            <Input placeholder="Número da frota" value={fleetForm.numero} onChange={e => setFleetForm({ ...fleetForm, numero: e.target.value })} required />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={fleetForm.tipo} onChange={e => setFleetForm({ ...fleetForm, tipo: e.target.value })}>{tiposFrota.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            <Input placeholder="Marca" value={fleetForm.marca} onChange={e => setFleetForm({ ...fleetForm, marca: e.target.value })} />
            <Input placeholder="Modelo" value={fleetForm.modelo} onChange={e => setFleetForm({ ...fleetForm, modelo: e.target.value })} />
            <Button type="submit" disabled={saving || !units.length} className="sm:col-span-6"><Plus className="mr-2 size-4" />Cadastrar frota</Button>
          </form>
          <div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input placeholder="Buscar por número, marca ou modelo" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="overflow-hidden rounded-2xl border"><div className="grid grid-cols-[1fr_1fr_1fr] gap-2 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground"><span>Frota</span><span>Tipo</span><span>Marca / modelo</span></div>
            {filteredFleets.map(item => <button key={item.id} type="button" onClick={() => setSelectedFleetId(item.id)} className="grid w-full grid-cols-[1fr_1fr_1fr] gap-2 border-t px-4 py-3 text-left text-sm hover:bg-muted/40"><strong>{item.numero}</strong><span>{tiposFrota.find(x => x[0] === item.tipo)?.[1] ?? item.tipo}</span><span>{[item.marca,item.modelo].filter(Boolean).join(" ") || "—"} <span className="text-primary">›</span></span></button>)}
            {!filteredFleets.length && <p className="p-6 text-center text-sm text-muted-foreground">{loading ? "Carregando..." : "Nenhuma frota cadastrada."}</p>}
          </div>
        </section>}

        {tab === "componentes" && !selectedComponent && <section className="space-y-4">
          <form onSubmit={saveComponent} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-6">
            <h2 className="font-semibold sm:col-span-6">Cadastrar componente eletrônico</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2" value={componentForm.unidade_id} onChange={e => setComponentForm({ ...componentForm, unidade_id: e.target.value })} required disabled={!isCentralManager && units.length <= 1}>
              <option value="">Unidade</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={componentForm.tipo} onChange={e => setComponentForm({ ...componentForm, tipo: e.target.value })}>{tiposComponente.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            <Input placeholder="Fabricante" value={componentForm.fabricante} onChange={e => setComponentForm({ ...componentForm, fabricante: e.target.value })} />
            <Input placeholder="Modelo" value={componentForm.modelo} onChange={e => setComponentForm({ ...componentForm, modelo: e.target.value })} />
            <Input placeholder="Número de série" value={componentForm.numero_serie} onChange={e => setComponentForm({ ...componentForm, numero_serie: e.target.value })} required />
            <Button type="submit" disabled={saving || !units.length} className="sm:col-span-6"><Plus className="mr-2 size-4" />Cadastrar componente</Button>
          </form>
          <div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input placeholder="Buscar por número de série, fabricante ou modelo" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="overflow-hidden rounded-2xl border"><div className="grid grid-cols-4 gap-2 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground"><span>Tipo</span><span>Nº de série</span><span>Fabricante / modelo</span><span>Status</span></div>
            {filteredComponents.map(item => <button key={item.id} type="button" onClick={() => setSelectedComponentId(item.id)} className="grid w-full grid-cols-4 gap-2 border-t px-4 py-3 text-left text-sm hover:bg-muted/40"><span>{tiposComponente.find(x => x[0] === item.tipo)?.[1] ?? item.tipo}</span><strong>{item.numero_serie}</strong><span>{[item.fabricante,item.modelo].filter(Boolean).join(" ") || "—"}</span><span>{item.status} <span className="text-primary">›</span></span></button>)}
            {!filteredComponents.length && <p className="p-6 text-center text-sm text-muted-foreground">{loading ? "Carregando..." : "Nenhum componente cadastrado."}</p>}
          </div>
        </section>}

        {tab === "instalacoes" && <section className="space-y-4">
          <form onSubmit={installComponent} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
            <h2 className="font-semibold sm:col-span-3">Instalar componente em uma frota</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={installForm.frota_id} onChange={e => setInstallForm({ ...installForm, frota_id: e.target.value, componente_id: "" })} required>
              <option value="">Selecione a frota</option>{fleets.filter(f => f.status === "ativa").map(f => <option key={f.id} value={f.id}>{f.numero} — {tiposFrota.find(x => x[0] === f.tipo)?.[1]}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={installForm.componente_id} onChange={e => setInstallForm({ ...installForm, componente_id: e.target.value })} required>
              <option value="">Componente disponível</option>{components.filter(c => c.status === "disponivel" && (!installForm.frota_id || c.unidade_id === fleets.find(f => f.id === installForm.frota_id)?.unidade_id)).map(c => <option key={c.id} value={c.id}>{c.numero_serie} — {tiposComponente.find(x => x[0] === c.tipo)?.[1]}</option>)}
            </select>
            <Button type="submit" disabled={saving || !installForm.frota_id || !installForm.componente_id}><Wrench className="mr-2 size-4" />Registrar instalação</Button>
          </form>
          <form onSubmit={removeComponent} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
            <h2 className="font-semibold sm:col-span-4">Retirar componente instalado</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2" value={removal.id} onChange={e => setRemoval({ ...removal, id: e.target.value })} required>
              <option value="">Instalação ativa</option>{activeInstallations.map(item => <option key={item.id} value={item.id}>Frota {item.frotas?.numero ?? "—"} · Série {item.componentes_frota?.numero_serie ?? "—"}</option>)}
            </select>
            <Input placeholder="Motivo da retirada" value={removal.motivo} onChange={e => setRemoval({ ...removal, motivo: e.target.value })} required />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={removal.status} onChange={e => setRemoval({ ...removal, status: e.target.value })}><option value="disponivel">Voltar para disponível</option><option value="manutencao">Enviar para manutenção</option><option value="descartado">Marcar como descartado</option></select>
            <Button type="submit" variant="outline" disabled={saving || !removal.id} className="sm:col-span-4">Registrar retirada</Button>
          </form>
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">O responsável e a data/hora de cada instalação ou retirada são preenchidos pelo banco com base na sessão autenticada. Não é possível apagar o histórico.</p>
          <div className="overflow-hidden rounded-2xl border"><div className="grid grid-cols-3 gap-2 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground"><span>Frota</span><span>Componente</span><span>Instalado em</span></div>
            {activeInstallations.map(item => <div key={item.id} className="grid grid-cols-3 gap-2 border-t px-4 py-3 text-sm"><strong>{item.frotas?.numero ?? "—"}</strong><span>{item.componentes_frota?.numero_serie ?? "—"}</span><span>{new Date(item.instalado_em).toLocaleString("pt-BR")}</span></div>)}
            {!activeInstallations.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma instalação ativa.</p>}
          </div>
        </section>}

        {tab === "historico" && <section className="overflow-hidden rounded-2xl border">
          <div className="bg-muted/60 px-4 py-3 text-sm font-semibold">Histórico de instalações, retiradas e substituições</div>
          {installations.map(item => <article key={item.id} className="space-y-1 border-t px-4 py-3 text-sm">
            <p className="font-semibold">Frota {item.frotas?.numero ?? "—"} · Série {item.componentes_frota?.numero_serie ?? "—"}</p>
            <p className="text-muted-foreground">Instalado: {new Date(item.instalado_em).toLocaleString("pt-BR")} · Responsável: {item.instalado_por_email || "Usuário autenticado"}</p>
            {item.retirado_em && <p className="text-muted-foreground">Retirado: {new Date(item.retirado_em).toLocaleString("pt-BR")} · Responsável: {item.retirado_por_email || "Usuário autenticado"} · Motivo: {item.motivo_retirada}</p>}
          </article>)}
          {!installations.length && <p className="p-6 text-center text-sm text-muted-foreground">O histórico aparecerá aqui após a primeira movimentação.</p>}
        </section>}
      </main>
    </div>
  );
}
