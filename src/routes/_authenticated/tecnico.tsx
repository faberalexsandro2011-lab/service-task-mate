import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Play, Tractor, Wifi, WifiOff, Search, Bell, Sparkles, Menu, X, Home, ClipboardList, History, UserCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOfflineActor, getOfflineOrders, getOfflineQueue, makeOfflineId, queueOfflineAction, removeOfflineAction, saveOfflineActor, saveOfflineOrders } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/tecnico")({
  head: () => ({
    links: [{ rel: "manifest", href: "/manifest.webmanifest" }],
    meta: [
      { name: "theme-color", content: "#315b2c" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
  }),
  component: TechnicianPage,
});
type Ordem = Tables<"ordens_servico">;
type Peca = Tables<"pecas_catalogo">;
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

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network error") || message.includes("load failed") || message.includes("fetch failed");
}

function ReplacedParts({
  value,
  showEmpty = false,
}: {
  value: string | null;
  showEmpty?: boolean;
}) {
  const parts = (value ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length && !showEmpty) return null;

  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
      <strong className="font-bold">Peças substituídas:</strong> {parts.length ? parts.join(", ") : "Nenhuma peça registrada nesta OS."}
    </p>
  );
}

function TechnicianPage() {
  const [orders, setOrders] = useState<Ordem[]>([]);
  const [actor, setActor] = useState<{ id: string; email: string; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("todas");
  const [finish, setFinish] = useState<Ordem | null>(null);
  const [details, setDetails] = useState<Ordem | null>(null);
  const [notes, setNotes] = useState("");
  const [partsReplaced, setPartsReplaced] = useState<"sim" | "nao">("nao");
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [partsCatalog, setPartsCatalog] = useState<Peca[]>([]);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const loadRequestRef = useRef(0);
  const syncRunningRef = useRef(false);

  async function load() {
    const requestId = ++loadRequestRef.current;
    const { data: sessionData } = await supabase.auth.getSession();
    const auth = { user: sessionData.session?.user };
    if (!auth.user) return;

    const cachedActor = await getOfflineActor<{ id: string; email: string; name: string }>();
    const cachedOrders = await getOfflineOrders<Ordem>();

    if (!navigator.onLine) {
      if (requestId !== loadRequestRef.current) return;
      if (cachedActor) {
        setActor(cachedActor);
        setProfileName(cachedActor.name);
      }
      if (cachedOrders.length) setOrders(cachedOrders.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return;
    }

    // O e-mail vem sempre da sessão do Auth. O perfil é apenas a fonte do nome.
    // Assim, uma falha de RLS em profiles não impede a identificação do técnico.
    const sessionEmail = String(auth.user.email ?? "").trim().toLowerCase();
    const metadataName = String(auth.user.user_metadata?.['nome'] ?? auth.user.user_metadata?.['name'] ?? "").trim();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,nome,email")
      .eq("id", auth.user.id)
      .maybeSingle();

    let resolvedName = profile?.nome?.trim() || metadataName;
    // Se o perfil ainda não existir, tenta criá-lo automaticamente com os dados
    // que já estão disponíveis na sessão autenticada.
    if (!profile && sessionEmail) {
      const { data: createdProfile, error: createProfileError } = await supabase
        .from("profiles")
        .upsert({
          id: auth.user.id,
          email: sessionEmail,
          nome: resolvedName || null,
        }, { onConflict: "id" })
        .select("id,nome,email")
        .maybeSingle();

      if (!createProfileError && createdProfile) {
        resolvedName = createdProfile.nome?.trim() || resolvedName;
      } else if (createProfileError) {
        console.warn("[Técnico] Não foi possível criar/regularizar o perfil:", createProfileError);
      }
    }

    const nextActor = {
      id: auth.user.id,
      email: sessionEmail || profile?.email?.trim().toLowerCase() || "",
      name: resolvedName || sessionEmail || "Técnico",
    };
    if (requestId !== loadRequestRef.current) return;
    setActor(nextActor);
    setProfileName(nextActor.name);
    await saveOfflineActor(nextActor);

    if (profileError) {
      console.warn("[Técnico] Perfil não pôde ser lido; usando dados do Auth:", profileError);
    }

    const email = nextActor.email;
    // Consulta pelas duas chaves e junta os resultados. Isso evita perder OS
    // quando uma ordem antiga foi gravada por e-mail em vez do ID.
    const [byId, byEmail] = await Promise.all([
      supabase.from("ordens_servico").select("*").eq("tecnico_id", auth.user.id).order("created_at", { ascending: false }),
      email ? supabase.from("ordens_servico").select("*").ilike("tecnico_email", email).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);

    const unique = new Map<string, Ordem>();
    for (const item of byId.data ?? []) unique.set(item.id, item);
    for (const item of byEmail.data ?? []) unique.set(item.id, item);

    // Uma das consultas pode falhar por uma política/RLS específica. Se a outra
    // trouxe OS válidas, não descartamos esses dados e mostramos o que conseguimos.
    const successfulRows = (byId.data?.length ?? 0) + (byEmail.data?.length ?? 0);
    const queryError = byId.error || byEmail.error;
    if (requestId !== loadRequestRef.current) return;

    if (successfulRows > 0 || (!byId.error && !byEmail.error)) {
      const result = [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setOrders(result);
      await saveOfflineOrders(result);
      if (queryError) console.warn("[Técnico] Uma consulta de sincronização falhou; usando a outra:", queryError);
    } else if (cachedOrders.length) {
      setOrders(cachedOrders.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      console.warn("[Técnico] Falha ao sincronizar OS; usando cache:", queryError);
    } else {
      console.error("[Técnico] Falha ao sincronizar OS:", queryError);
      if (profileError) console.warn("[Técnico] Perfil indisponível:", profileError);
    }
  }

  async function loadPartsCatalog() {
    if (!navigator.onLine) return;
    const { data, error } = await supabase.from("pecas_catalogo").select("id,nome,ativo,criado_por_email,created_at,updated_at").eq("ativo", true).order("nome", { ascending: true });
    if (!error) setPartsCatalog(data ?? []);
    else console.warn("[Técnico] Catálogo de peças indisponível:", error);
  }

  function openFinish(order: Ordem) {
    setFinish(order);
    setNotes("");
    setPartsReplaced("nao");
    setSelectedParts([]);
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

          const current = !data?.length
            ? (await supabase.from("ordens_servico").select("status").eq("id", action.orderId).maybeSingle()).data?.status
            : "em_andamento";

          if (current !== "em_andamento") throw new Error("A OS não está disponível para sincronização.");

          const { data: history } = await supabase
            .from("historico_edicoes")
            .select("id")
            .eq("os_id", action.orderId)
            .eq("acao", "iniciada")
            .eq("usuario_id", action.actorId)
            .limit(1);

          if (!history?.length) {
            const { error: historyError } = await supabase.from("historico_edicoes").insert({
              os_id: action.orderId,
              acao: "iniciada",
              detalhe: `Atendimento iniciado por ${action.actorEmail} (sincronizado offline)`,
              usuario_id: action.actorId,
              usuario_email: action.actorEmail,
            });
            if (historyError) throw historyError;
          }
        } else {
          const { data, error } = await supabase
            .from("ordens_servico")
            .update({
              status: "concluida",
              notas_fecho: action.notes,
              pecas_utilizadas: (action.pieces ?? []).length ? (action.pieces ?? []).join("\n") : null,
              concluida_em: action.createdAt,
            })
            .eq("id", action.orderId)
            .eq("status", "em_andamento")
            .select("id");

          if (error) throw error;

          const current = !data?.length
            ? (await supabase.from("ordens_servico").select("status").eq("id", action.orderId).maybeSingle()).data?.status
            : "concluida";

          if (current !== "concluida") throw new Error("A OS não está disponível para sincronização.");

          const { data: history } = await supabase
            .from("historico_edicoes")
            .select("id")
            .eq("os_id", action.orderId)
            .eq("acao", "finalizada")
            .eq("usuario_id", action.actorId)
            .limit(1);

          if (!history?.length) {
            const { error: historyError } = await supabase.from("historico_edicoes").insert({
              os_id: action.orderId,
              acao: "finalizada",
              detalhe: `Finalizada por ${action.actorEmail} (sincronizado offline): ${action.notes}`,
              usuario_id: action.actorId,
              usuario_email: action.actorEmail,
            });
            if (historyError) throw historyError;
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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((registration) => {
          const urls = performance.getEntriesByType("resource")
            .map((entry) => (entry as PerformanceResourceTiming).name)
            .filter((url) => url.startsWith(window.location.origin));
          registration.active?.postMessage({ type: "CACHE_ASSETS", urls });
        })
        .catch((error) => console.warn("Service worker offline:", error));
    }

    setOnline(navigator.onLine);
    void load();
    void loadPartsCatalog();
    void syncOffline();

    const onlineHandler = () => {
      setOnline(true);
      toast.success("Internet restaurada. Sincronizando alterações...");
      void syncOffline();
      void load();
    };
    const offlineHandler = () => {
      setOnline(false);
      toast.info("Você está offline. As alterações ficarão salvas no aparelho.");
    };
    const visibilityHandler = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void load();
        void loadPartsCatalog();
        void syncOffline();
      }
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    document.addEventListener("visibilitychange", visibilityHandler);

    const actorId = actor?.id;
    const actorEmail = actor?.email?.trim().toLowerCase() || "";

    const channel = supabase
      .channel(`tecnico_ordens_live_${actorId || "pending"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, async (payload) => {
        const next = payload.new as Partial<Ordem>;
        const previous = payload.old as Partial<Ordem>;
        const nextEmail = String(next.tecnico_email ?? "").trim().toLowerCase();
        const previousEmail = String(previous.tecnico_email ?? "").trim().toLowerCase();

        const technicianMatch =
          next.tecnico_id === actorId ||
          previous.tecnico_id === actorId ||
          (!!actorEmail && (nextEmail === actorEmail || previousEmail === actorEmail));

        if (!technicianMatch) return;

        const assignedToTechnician =
          next.tecnico_id === actorId ||
          (!!actorEmail && nextEmail === actorEmail);

        // O payload do Realtime é apenas o gatilho. A fonte de verdade é uma
        // nova consulta ao banco, evitando depender de RLS/payload parcial.
        void load();

        if (
          payload.eventType === "INSERT" ||
          (assignedToTechnician && (
            previous.tecnico_id !== actorId &&
            previousEmail !== actorEmail
          ))
        ) {
          toast.success("Nova OS enviada para você.");
          try { playFieldAlert(); } catch {}
          if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void load();
          void loadPartsCatalog();
          void syncOffline();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Técnico] Realtime indisponível:", status);
          // O polling abaixo continua garantindo a atualização.
        }
      });

    // Fallback permanente: mesmo que o Realtime não esteja disponível, o técnico
    // consulta o banco periodicamente. Também reduz o risco de perder um INSERT.
    const poll = window.setInterval(() => {
      if (navigator.onLine) void load();
    }, 3000);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      supabase.removeChannel(channel);
    };
  }, [actor?.id, actor?.email]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt");
    const base = tab === "todas" ? orders : orders.filter(o => o.status === tab);
    if (!term) return base;
    return base.filter(o => [o.numero_os, o.frota, o.localizacao, o.descricao].filter(Boolean).some(v => v?.toLocaleLowerCase("pt").includes(term)));
  }, [orders, tab, search]);

  async function start(order: Ordem) {
    if (!actor) return;
    const startedAt = new Date().toISOString();

    const queueAction = async () => {
      const updated = {
        ...order,
        status: "em_andamento",
        data_inicio: startedAt,
        tecnico_nome: actor.name,
        tecnico_email: actor.email,
        updated_at: startedAt,
      } as Ordem;
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
    };

    if (!navigator.onLine) {
      await queueAction();
      return;
    }

    const { data, error } = await supabase
      .from("ordens_servico")
      .update({
        status: "em_andamento",
        data_inicio: startedAt,
        tecnico_nome: actor.name,
        tecnico_email: actor.email,
      })
      .eq("id", order.id)
      .eq("status", "pendente")
      .select("id");

    if (error) {
      if (isNetworkError(error)) {
        await queueAction();
        return;
      }
      toast.error(error.message || "Não foi possível iniciar a OS."); return;
    }

    if (!data?.length) { toast.error("A OS já foi alterada."); return; }

    const { error: historyError } = await supabase.from("historico_edicoes").insert({
      os_id: order.id,
      acao: "iniciada",
      detalhe: `Atendimento iniciado por ${actor.email}`,
      usuario_id: actor.id,
      usuario_email: actor.email,
    });

    if (historyError) {
      await queueOfflineAction({
        id: makeOfflineId(),
        type: "start",
        orderId: order.id,
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        createdAt: startedAt,
      });
      toast.warning("Atendimento iniciado, mas o histórico ficou pendente de sincronização.");
      return;
    }

    toast.success("Atendimento iniciado.");
    await load();
  }

  async function finalize() {
    if (!actor || !finish) return;
    const solution = notes.trim();
    if (!solution) { toast.error("Informe o serviço realizado."); return; }
    const pieces = partsReplaced === "sim" ? selectedParts.filter(Boolean) : [];
    if (partsReplaced === "sim" && !pieces.length) { toast.error("Selecione pelo menos uma peça trocada."); return; }
    const finishedAt = new Date().toISOString();
    const orderToFinish = finish;

    const queueAction = async () => {
      const updated = {
        ...orderToFinish,
        status: "concluida",
        notas_fecho: solution,
        pecas_utilizadas: pieces.length ? pieces.join("\n") : null,
        concluida_em: finishedAt,
        updated_at: finishedAt,
      } as Ordem;
      setOrders(current => current.map(item => item.id === orderToFinish.id ? updated : item));
      await saveOfflineOrders([updated]);
      await queueOfflineAction({
        id: makeOfflineId(),
        type: "finish",
        orderId: orderToFinish.id,
        actorId: actor.id,
        actorEmail: actor.email,
        notes: solution,
        pieces,
        createdAt: finishedAt,
      });
      setFinish(null);
      setNotes("");
      toast.success("Serviço finalizado offline. Será sincronizado quando a internet voltar.");
    };

    if (!navigator.onLine) {
      await queueAction();
      return;
    }

    const { data, error } = await supabase
      .from("ordens_servico")
      .update({
        status: "concluida",
        notas_fecho: solution,
        pecas_utilizadas: pieces.length ? pieces.join("\n") : null,
        concluida_em: finishedAt,
      })
      .eq("id", orderToFinish.id)
      .eq("status", "em_andamento")
      .select("id");

    if (error) {
      if (isNetworkError(error)) {
        await queueAction();
        return;
      }
      toast.error(error.message || "Não foi possível finalizar a OS."); return;
    }

    if (!data?.length) { toast.error("A OS já foi alterada."); return; }

    const { error: historyError } = await supabase.from("historico_edicoes").insert({
      os_id: orderToFinish.id,
      acao: "finalizada",
      detalhe: `Finalizada por ${actor.email}: ${solution}`,
      usuario_id: actor.id,
      usuario_email: actor.email,
    });

    setFinish(null);
    setNotes("");

    if (historyError) {
      await queueOfflineAction({
        id: makeOfflineId(),
        type: "finish",
        orderId: orderToFinish.id,
        actorId: actor.id,
        actorEmail: actor.email,
        notes: solution,
        pieces,
        createdAt: finishedAt,
      });
      toast.warning("Serviço finalizado, mas o histórico ficou pendente de sincronização.");
      return;
    }

    toast.success("Serviço finalizado.");
    await load();
  }

  function openMap(location: string | null) {
    if (!location) { toast.info("Esta OS não possui localização."); return; }
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
        <button type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true); }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"><UserCircle className="size-5" />Meu perfil</button>
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
        {visible.map(order => <article key={order.id} role="button" tabIndex={0} onClick={() => setDetails(order)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetails(order); } }} className="group cursor-pointer rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wider text-primary">Frota {order.frota}</div><h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">OS {order.numero_os}</h2></div>
            <div className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold shadow-sm">{order.status === "concluida" ? "Finalizada" : order.status === "em_andamento" ? "Em andamento" : "Pendente"}</div>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" /><span>{order.localizacao || "Localização não informada"}</span></div>
            <p className="rounded-2xl border bg-background p-4 leading-6 text-muted-foreground">{order.descricao || "Sem descrição do problema."}</p>
            {order.status === "concluida" && order.pecas_utilizadas?.trim() && (
              <ReplacedParts value={order.pecas_utilizadas} />
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {order.localizacao && <Button variant="outline" size="lg" className="rounded-xl" onClick={(e) => { e.stopPropagation(); openMap(order.localizacao); }}><ExternalLink /> Abrir mapa</Button>}
            {order.status === "pendente" && <Button size="lg" className="rounded-xl shadow-md" onClick={(e) => { e.stopPropagation(); void start(order); }}><Play /> Iniciar serviço</Button>}
            {order.status === "em_andamento" && <Button size="lg" className="rounded-xl shadow-md" onClick={(e) => { e.stopPropagation(); openFinish(order); }}><CheckCircle2 /> Finalizar serviço</Button>}
          </div>
        </article>)}
        {!visible.length && <div className="lg:col-span-2 rounded-3xl border border-dashed bg-card p-14 text-center text-muted-foreground"><Clock3 className="mx-auto mb-3 size-9 text-primary" /><p className="font-semibold">Nenhuma OS encontrada</p><p className="mt-1 text-sm">Altere o filtro ou a pesquisa para ver outros serviços.</p></div>}
      </div>
    </section>
    <Dialog open={!!details} onOpenChange={(open) => { if (!open) setDetails(null); }}>
      <DialogContent className="rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes da OS {details?.numero_os}</DialogTitle>
        </DialogHeader>
        {details && <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-muted/30 p-3"><p className="text-xs font-bold uppercase text-muted-foreground">OS</p><p className="mt-1 font-bold">{details.numero_os}</p></div>
            <div className="rounded-2xl border bg-muted/30 p-3"><p className="text-xs font-bold uppercase text-muted-foreground">Frota</p><p className="mt-1 font-bold">{details.frota}</p></div>
          </div>
          <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Localização</p><p className="mt-1">{details.localizacao || "Não informada"}</p></div>
          <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Descrição / Serviço</p><p className="mt-1 whitespace-pre-wrap leading-6">{details.descricao || "Sem descrição."}</p></div>
          <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Status</p><p className="mt-1 font-semibold">{details.status === "concluida" ? "Finalizada" : details.status === "em_andamento" ? "Em andamento" : "Pendente"}</p></div>
          {details.notas_fecho && <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Serviço realizado</p><p className="mt-1 whitespace-pre-wrap leading-6">{details.notas_fecho}</p></div>}
          {details.status === "concluida" && (
            <ReplacedParts value={details.pecas_utilizadas} showEmpty />
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {details.localizacao && <Button variant="outline" className="rounded-xl" onClick={() => openMap(details.localizacao)}>Abrir mapa</Button>}
            {details.status === "pendente" && <Button className="rounded-xl" onClick={() => { setDetails(null); void start(details); }}><Play /> Iniciar serviço</Button>}
            {details.status === "em_andamento" && <Button className="rounded-xl" onClick={() => { setDetails(null); openFinish(details); }}><CheckCircle2 /> Finalizar serviço</Button>}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!finish} onOpenChange={(open) => { if (!open) { setFinish(null); setNotes(""); setPartsReplaced("nao"); setSelectedParts([]); } }}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader><DialogTitle>Finalizar OS {finish?.numero_os}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-semibold">Foi trocada alguma peça?</label>
            <Select value={partsReplaced} onValueChange={(value) => { const next = value as "sim" | "nao"; setPartsReplaced(next); if (next === "nao") setSelectedParts([]); }}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem></SelectContent>
            </Select>
          </div>
          {partsReplaced === "sim" && <div className="grid gap-3 rounded-2xl border bg-muted/20 p-3">
            <div><p className="text-sm font-semibold">Peças substituídas</p><p className="text-xs text-muted-foreground">Selecione as peças cadastradas pelo administrador.</p></div>
            {!partsCatalog.length && <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">Nenhuma peça cadastrada ainda. Solicite ao administrador que adicione o item ao catálogo.</p>}
            {selectedParts.map((part, index) => <div key={index} className="flex gap-2">
              <Select value={part || ""} onValueChange={(value) => setSelectedParts(current => current.map((item, i) => i === index ? value : item))}>
                <SelectTrigger className="h-11 flex-1 rounded-xl"><SelectValue placeholder="Selecione a peça" /></SelectTrigger>
                <SelectContent>{partsCatalog.filter(item => !selectedParts.includes(item.nome) || item.nome === part).map(item => <SelectItem key={item.id} value={item.nome}>{item.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" className="h-11 rounded-xl px-3" onClick={() => setSelectedParts(current => current.filter((_, i) => i !== index))}>Remover</Button>
            </div>)}
            <Button type="button" variant="outline" className="rounded-xl" disabled={!partsCatalog.length || selectedParts.length >= partsCatalog.length} onClick={() => setSelectedParts(current => [...current, ""])}>+ Adicionar outra peça</Button>
          </div>}
          <Textarea className="min-h-36 rounded-2xl" autoFocus rows={6} placeholder="Descreva o serviço realizado e a solução aplicada..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setFinish(null)}>Voltar</Button><Button className="rounded-xl" onClick={finalize}>Finalizar serviço</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary mx-auto"><UserCircle className="size-10" /></div>
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">E-mail de acesso</p>
            <p className="mt-1 break-all font-semibold">{actor?.email || "—"}</p>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            Nome
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="h-11 rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <Button disabled={profileSaving || !actor || !profileName.trim()} onClick={async () => {
            if (!actor) return;
            setProfileSaving(true);
            const { error } = await supabase
              .from("profiles")
              .upsert({
                id: actor.id,
                email: actor.email,
                nome: profileName.trim(),
              }, { onConflict: "id" });
            setProfileSaving(false);
            if (error) {
              toast.error(`Não foi possível salvar o perfil: ${error.message}`);
              return;
            }
            const next = { ...actor, name: profileName.trim() };
            setActor(next);
            await saveOfflineActor(next);
            toast.success("Perfil atualizado.");
            setProfileOpen(false);
          }}>{profileSaving ? "A guardar..." : "Salvar perfil"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </main>;
}
