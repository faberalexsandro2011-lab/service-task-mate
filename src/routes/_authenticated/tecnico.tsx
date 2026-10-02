import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Play, Tractor, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [online, setOnline] = useState(navigator.onLine);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: profile } = await supabase.from("profiles").select("nome,email").eq("id", auth.user.id).maybeSingle();
    setActor({ id: auth.user.id, email: auth.user.email ?? "", name: profile?.nome || auth.user.email || "Técnico" });
    const { data, error } = await supabase.from("ordens_servico").select("*").eq("tecnico_id", auth.user.id).order("created_at", { ascending: false });
    if (!error) setOrders(data ?? []);
  }

  useEffect(() => {
    load();
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler); window.addEventListener("offline", offlineHandler);
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
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); supabase.removeChannel(channel); };
  }, [actor?.id]);

  const visible = useMemo(() => tab === "todas" ? orders : orders.filter(o => o.status === tab), [orders, tab]);

  async function start(order: Ordem) {
    if (!actor) return undefined;
    const { data, error } = await supabase.from("ordens_servico").update({ status: "em_andamento", data_inicio: new Date().toISOString(), tecnico_nome: actor.name, tecnico_email: actor.email }).eq("id", order.id).eq("status", "pendente").select("id");
    if (error || !data?.length) return toast.error(error?.message || "A OS já foi alterada.");
    await supabase.from("historico_edicoes").insert({ os_id: order.id, acao: "iniciada", detalhe: `Atendimento iniciado por ${actor.email}`, usuario_id: actor.id, usuario_email: actor.email });
    toast.success("Atendimento iniciado.");
    await load();
    return undefined;
  }

  async function finalize() {
    if (!actor || !finish) return undefined;
    const solution = notes.trim();
    if (!solution) return toast.error("Informe o serviço realizado.");
    const { data, error } = await supabase.from("ordens_servico").update({ status: "concluida", notas_fecho: solution, concluida_em: new Date().toISOString() }).eq("id", finish.id).eq("status", "em_andamento").select("id");
    if (error || !data?.length) return toast.error(error?.message || "A OS já foi alterada.");
    await supabase.from("historico_edicoes").insert({ os_id: finish.id, acao: "finalizada", detalhe: `Finalizada por ${actor.email}: ${solution}`, usuario_id: actor.id, usuario_email: actor.email });
    toast.success("Serviço finalizado.");
    setFinish(null); setNotes(""); await load();
    return undefined;
  }

  function openMap(location: string | null) {
    if (!location) return toast.info("Esta OS não possui localização.");
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, "_blank", "noopener,noreferrer");
    return undefined;
  }

  return <main className="min-h-screen bg-[var(--agri-straw)]">
    <header className="sticky top-0 z-10 border-b bg-[var(--agri-field)] text-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[var(--agri-wheat)] text-[var(--agri-earth)]"><Tractor /></div><div><h1 className="text-xl font-black">Área do Técnico</h1><p className="text-xs opacity-80">{actor?.name || "Carregando..."} · OS em tempo real</p></div></div>
        <div className="flex items-center gap-1 text-xs">{online ? <><Wifi className="size-4" /> Online</> : <><WifiOff className="size-4" /> Offline</>}</div>
      </div>
    </header>
    <section className="mx-auto max-w-5xl px-3 py-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}><TabsList className="grid h-12 w-full grid-cols-4 rounded-xl"><TabsTrigger value="todas">Todas</TabsTrigger><TabsTrigger value="pendente">Pendentes</TabsTrigger><TabsTrigger value="em_andamento">Em andamento</TabsTrigger><TabsTrigger value="concluida">Concluídas</TabsTrigger></TabsList></Tabs>
      <div className="mt-4 grid gap-4">
        {visible.map(order => <article key={order.id} className="rounded-2xl border bg-card p-5 shadow-sm transition-transform active:scale-[.99]">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-primary">Frota {order.frota}</div><h2 className="mt-1 text-xl font-black">OS {order.numero_os}</h2></div><div className="rounded-full bg-accent px-3 py-1 text-xs font-bold">{order.status === "concluida" ? "Finalizada" : order.status === "em_andamento" ? "Em andamento" : "Pendente"}</div></div>
          <div className="mt-4 grid gap-2 text-sm"><div className="flex gap-2"><MapPin className="size-5 shrink-0 text-primary" /><span>{order.localizacao || "Localização não informada"}</span></div><p className="rounded-xl bg-muted p-3">{order.descricao || "Sem descrição do problema."}</p></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {order.localizacao && <Button variant="outline" size="lg" onClick={() => openMap(order.localizacao)}><ExternalLink /> Abrir mapa</Button>}
            {order.status === "pendente" && <Button size="lg" onClick={() => start(order)}><Play /> Iniciar atendimento</Button>}
            {order.status === "em_andamento" && <Button size="lg" onClick={() => setFinish(order)}><CheckCircle2 /> Finalizar serviço</Button>}
          </div>
        </article>)}
        {!visible.length && <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-muted-foreground"><Clock3 className="mx-auto mb-3 size-8" />Nenhuma OS nesta categoria.</div>}
      </div>
    </section>
    <Dialog open={!!finish} onOpenChange={(open) => { if (!open) { setFinish(null); setNotes(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Finalizar OS {finish?.numero_os}</DialogTitle></DialogHeader><Textarea autoFocus rows={6} placeholder="Descreva o serviço realizado e a solução aplicada..." value={notes} onChange={e => setNotes(e.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setFinish(null)}>Voltar</Button><Button onClick={finalize}>Finalizar serviço</Button></DialogFooter></DialogContent>
    </Dialog>
  </main>;
}
