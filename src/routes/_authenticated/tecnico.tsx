import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Play, Tractor, Wifi, WifiOff, Search, Bell, Sparkles, Menu, X, Home, ClipboardList, History, UserCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOfflineActor, getOfflineOrders, getOfflineQueue, makeOfflineId, queueOfflineAction, removeOfflineAction, saveOfflineActor, saveOfflineOrders } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/tecnico")({ component: TechnicianPage });
type Ordem = Tables<"ordens_servico">;
type Tab = "todas" | "pendente" | "em_andamento" | "concluida";

function playFieldAlert() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.06;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      void context.close();
    }, 220);
  } catch {
    // Navegadores podem bloquear áudio até haver interação do utilizador.
  }
}

function TechnicianPage() {
  const [orders, setOrders] = useState<Ordem[]>([]);
  const [actor, setActor] = useState<{ id: string; email: string; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("todas");
  const [finish, setFinish] = useState<Ordem | null>(null);
  const [notes, setNotes] = useState("");
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const cachedActor = await getOfflineActor<{ id: string; email: string; name: string }>();
    const cachedOrders = await getOfflineOrders<Ordem>();

    if (!navigator.onLine) {
      if (cachedActor) setActor(cachedActor);
      if (cachedOrders.length) setOrders(cachedOrders.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("nome,email").eq("id", auth.user.id).maybeSingle();
    const nextActor = { id: auth.user.id, email: auth.user.email ?? "", name: profile?.nome || auth.user.email || "Técnico" };
    setActor(nextActor);
    await saveOfflineActor(nextActor);

    const { data, error } = await supabase.from("ordens_servico").select("*").eq("tecnico_id", auth.user.id).order("created_at", { ascending: false });
    if (!error) {
      setOrders(data ?? []);
      await saveOfflineOrders(data ?? []);
    } else if (cachedOrders.length) {
      setOrders(cachedOrders.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
  }

  async function syncOffline() {
    if (!navigator.onLine) return;
    const queue = await getOfflineQueue();
    if (!queue.length) return;

    for (const action of queue) {
      try {
        if (action.type === "start") {
          const { data, error } = await supabase
            .from("ordens_servico")
            .update({
              status: "em_andamento",
              data_inicio: action.createdAt,
              tecnico_nome: action.actorName,
              tecnico_email: action.actorEmail,
            })
            .eq("id", action.orderId)
            .eq("status", "pendente")
            .select("id");

          if (error) throw error;
          if (data?.length) {
            await supabase.from("historico_edicoes").insert({
              os_id: action.orderId,
              acao: "iniciada",
              detalhe: `Atendimento iniciado por ${action.actorEmail} (sincronizado offline)`,
              usuario_id: action.actorId,
              usuario_email: action.actorEmail,
            });
          }
        } else {
          const { data, error } = await supabase
            .from("ordens_servico")
            .update({
              status: "concluida",
              notas_fecho: action.notes,
              concluida_em: action.createdAt,
            })
            .eq("id", action.orderId)
            .eq("status", "em_andamento")
            .select("id");

          if (error) throw error;
          if (data?.length) {
            await supabase.from("historico_edicoes").insert({
              os_id: action.orderId,
              acao: "finalizada",
              detalhe: `Finalizada por ${action.actorEmail} (sincronizado offline): ${action.notes}`,
              usuario_id: action.actorId,
              usuario_email: action.actorEmail,
            });
          }
        }

        await removeOfflineAction(action.id);
      } catch (error) {
        console.error("Falha ao sincronizar ação offline:", error);
        break;
      }
    }

    await load();
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void load();

    const onlineHandler = () => {
      setOnline(true);
      toast.success("Internet restaurada. Sincronizando alterações...");
      void syncOffline();
    };
    const offlineHandler = () => {
      setOnline(false);
      toast.info("Você está offline. As alterações ficarão salvas no aparelho.");
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    const channel = supabase.channel("tecnico_ordens_live").on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, async (payload) => {
      const next = payload.new as Partial<Ordem>;
      const previous = payload.old as Partial<Ordem>;
      if (next.tecnico_id === actor?.id || previous.tecnico_id === actor?.id) {
        await load();
        if (payload.eventType === "INSERT" || (next.tecnico_id === actor?.id && previous.tecnico_id !== actor?.id)) {
          toast.success("Nova OS enviada para você.");
          try { playFieldAlert(); } catch {}
          if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
        }
      }
    }).subscribe();

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      supabase.removeChannel(channel);
    };
  }, [actor?.id]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt");
    const base = tab === "todas" ? orders : orders.filter(o => o.status === tab);
    if (!term) return base;
    return base.filter(o => [o.numero_os, o.frota, o.localizacao, o.descricao].filter(Boolean).some(v => v?.toLocaleLowerCase("pt").includes(term)));
  }, [orders, tab, search]);

  async function start(order: Ordem) {
    if (!actor) return;
    const startedAt = new Date().toISOString();

    if (!navigator.onLine) {
      const updated = { ...order, status: "em_andamento", data_inicio: startedAt, tecnico_nome: actor.name, tecnico_email: actor.email, updated_at: startedAt } as Ordem;
      setOrders(current => current.map(item => item.id === order.id ? updated : item));
      await saveOfflineOrders([updated]);
      await queueOfflineAction({
        id: makeOfflineId(),
        type: "start",
        orderId: order.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        createdAt: startedAt,
      });
      toast.success("Atendimento iniciado offline. Será sincronizado quando a internet voltar.");
      return;
    }

    const { data, error } = await supabase.from("ordens_servico").update({ status: "em_andamento", data_inicio: startedAt, tecnico_nome: actor.name, tecnico_email: actor.email }).eq("id", order.id).eq("status", "pendente").select("id");
    if (error || !data?.length) return toast.error(error?.message || "A OS já foi alterada.");
    await supabase.from("historico_edicoes").insert({ os_id: order.id, acao: "iniciada", detalhe: `Atendimento iniciado por ${actor.email}`, usuario_id: actor.id, usuario_email: actor.email });
    toast.success("Atendimento iniciado.");
    await load();
  }

  async function finalize() {
    if (!actor || !finish) return;
    const solution = notes.trim();
    if (!solution) return toast.error("Informe o serviço realizado.");
    const finishedAt = new Date().toISOString();

    if (!navigator.onLine) {
      const updated = { ...finish, status: "concluida", notas_fecho: solution, concluida_em: finishedAt, updated_at: finishedAt } as Ordem;
      setOrders(current => current.map(item => item.id === finish.id ? updated : item));
      await saveOfflineOrders([updated]);
      await queueOfflineAction({
        id: makeOfflineId(),
        type: "finish",
        orderId: finish.id,
        actorId: actor.id,
        actorEmail: actor.email,
        notes: solution,
        createdAt: finishedAt,
      });
      toast.success("Serviço finalizado offline. Será sincronizado quando a internet voltar.");
      setFinish(null);
      setNotes("");
      return;
    }

    const { data, error } = await supabase.from("ordens_servico").update({ status: "concluida", notas_fecho: solution, concluida_em: finishedAt }).eq("id", finish.id).eq("status", "em_andamento").select("id");
    if (error || !data?.length) return toast.error(error?.message || "A OS já foi alterada.");
    await supabase.from("historico_edicoes").insert({ os_id: finish.id, acao: "finalizada", detalhe: `Finalizada por ${actor.email}: ${solution}`, usuario_id: actor.id, usuario_email: actor.email });
    toast.success("Serviço finalizado.");
    setFinish(null);
    setNotes("");
    await load();
  }

  function openMap(location: string | null) {
    if (!location) return toast.info("Esta OS não possui localização.");
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, "_blank", "noopener,noreferrer");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const menuItems = [
    { label: "Início", href: "/tecnico", icon: Home },
    { label: "Minhas OS", href: "/tecnico", icon: ClipboardList },
    { label: "Histórico", href: "/historico", icon: History },
  ];

  return <main className="min-h-screen bg-[var(--agri-straw)] text-foreground">
    <div className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity md:hidden ${menuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setMenuOpen(false)} />
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[var(--agri-field)] text-white shadow-2xl transition-transform duration-300 ease-out md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[var(--agri-wheat)] text-[var(--agri-earth)] shadow-lg"><Tractor className="size-6" /></div>
          <div><div className="font-black tracking-tight">Central OS</div><div className="text-[10px] font-bold uppercase tracking-widest text-white/50">Área do técnico</div></div>
        </div>
        <button type="button" className="grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20 md:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        {menuItems.map(item => { const Icon = item.icon; return <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"><Icon className="size-5" />{item.label}</a>; })}
        <div className="my-4 border-t border-white/10" />
        <div className="px-4 pb-2 text-[10px] font-black uppercase tracking-widest text-white/40">Conta</div>
        <button type="button" onClick={() => setMenuOpen(false)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"><UserCircle className="size-5" />Meu perfil</button>
      </nav>
      <div className="border-t border-white/10 p-4">
        <button type="button" onClick={signOut} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"><LogOut className="size-5" />Sair</button>
      </div>
    </aside>
    <div className="md:pl-[280px]">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--agri-field)]/95 text-white shadow-lg backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20 md:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--agri-wheat)] text-[var(--agri-earth)] shadow-lg"><Tractor className="size-6" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="truncate text-lg font-black tracking-tight sm:text-xl">Central OS</h1><span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Campo</span></div>
            <p className="truncate text-xs text-white/70">{actor?.name || "Carregando técnico..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold">{online ? <Wifi className="size-3.5 text-[var(--agri-wheat)]" /> : <WifiOff className="size-3.5 text-[var(--agri-wheat)]" />}{online ? "Online" : "Offline"}</div>
          <button type="button" className="grid size-10 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" title="Notificações"><Bell className="size-4" /></button>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--agri-field)] via-[var(--agri-leaf)] to-[var(--agri-earth)] p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 size-48 rounded-full bg-[var(--agri-wheat)]/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70"><Sparkles className="size-4" /> Operação em campo</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Bom trabalho, {actor?.name?.split(" ")[0] || "técnico"}!</h2>
          <p className="mt-1 max-w-xl text-sm text-white/75">Acompanhe suas ordens e atualize o serviço em poucos toques.</p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-2xl font-black">{orders.filter(o => o.status === "pendente").length}</div><div className="text-[10px] font-semibold uppercase text-white/65">Pendentes</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-2xl font-black">{orders.filter(o => o.status === "em_andamento").length}</div><div className="text-[10px] font-semibold uppercase text-white/65">Em campo</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-2xl font-black">{orders.filter(o => o.status === "concluida").length}</div><div className="text-[10px] font-semibold uppercase text-white/65">Concluídas</div></div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full sm:w-auto">
          <TabsList className="grid h-12 w-full grid-cols-4 rounded-2xl bg-card p-1 shadow-sm sm:w-auto">
            <TabsTrigger value="todas" className="rounded-xl px-3">Todas</TabsTrigger>
            <TabsTrigger value="pendente" className="rounded-xl px-3">Pendentes</TabsTrigger>
            <TabsTrigger value="em_andamento" className="rounded-xl px-3">Em andamento</TabsTrigger>
            <TabsTrigger value="concluida" className="rounded-xl px-3">Concluídas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar OS, frota..." className="h-11 w-full rounded-2xl border bg-card pl-9 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {visible.map(order => <article key={order.id} className="group rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wider text-primary">Frota {order.frota}</div><h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">OS {order.numero_os}</h2></div>
            <div className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold shadow-sm">{order.status === "concluida" ? "Finalizada" : order.status === "em_andamento" ? "Em andamento" : "Pendente"}</div>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" /><span>{order.localizacao || "Localização não informada"}</span></div>
            <p className="rounded-2xl border bg-background p-4 leading-6 text-muted-foreground">{order.descricao || "Sem descrição do problema."}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {order.localizacao && <Button variant="outline" size="lg" className="rounded-xl" onClick={() => openMap(order.localizacao)}><ExternalLink /> Abrir mapa</Button>}
            {order.status === "pendente" && <Button size="lg" className="rounded-xl shadow-md" onClick={() => start(order)}><Play /> Iniciar atendimento</Button>}
            {order.status === "em_andamento" && <Button size="lg" className="rounded-xl shadow-md" onClick={() => setFinish(order)}><CheckCircle2 /> Finalizar serviço</Button>}
          </div>
        </article>)}
        {!visible.length && <div className="lg:col-span-2 rounded-3xl border border-dashed bg-card p-14 text-center text-muted-foreground"><Clock3 className="mx-auto mb-3 size-9 text-primary" /><p className="font-semibold">Nenhuma OS encontrada</p><p className="mt-1 text-sm">Altere o filtro ou a pesquisa para ver outros serviços.</p></div>}
      </div>
    </section>
    <Dialog open={!!finish} onOpenChange={(open) => { if (!open) { setFinish(null); setNotes(""); } }}>
      <DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>Finalizar OS {finish?.numero_os}</DialogTitle></DialogHeader><Textarea className="min-h-36 rounded-2xl" autoFocus rows={6} placeholder="Descreva o serviço realizado e a solução aplicada..." value={notes} onChange={e => setNotes(e.target.value)} /><DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setFinish(null)}>Voltar</Button><Button className="rounded-xl" onClick={finalize}>Finalizar serviço</Button></DialogFooter></DialogContent>
    </Dialog>
    </div>
  </main>;
}
