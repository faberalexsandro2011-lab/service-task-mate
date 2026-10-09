import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ExternalLink, MapPin, Play, Tractor, Wifi, WifiOff, Search, Bell, Sparkles, Menu, X, Home, ClipboardList, History, UserCircle, LogOut, FilePlus2, LockKeyhole } from "lucide-react";
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
type Peca = { id: string; nome: string; ativo: boolean; criado_por_email: string | null; created_at: string | null; updated_at: string | null; estoque_atual: number; estoque_minimo: number; };
type SelectedPart = { id: string; nome: string; quantidade: number };
type Tab = "todas" | "pendente" | "em_andamento" | "minhas";

function formatEntrada(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const text = value.trim();

  // Sempre exibe a ENTRADA exatamente como DD/MM/AA.
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    const year = br[3].length === 2 ? "20" + br[3] : br[3].slice(-4);
    return day + "/" + month + "/" + year.slice(-2);
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1].slice(-2);

  // Excel pode fornecer o número serial da data.
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "UTC",
    });
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "UTC",
    });
  }

  return null;
}

function formatDataAberturaFallback(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatDateTime(value: string | null | undefined, emptyLabel: string) {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getReplacedParts(value: string | null | undefined) {
  if (!value?.trim()) return [];
  return value
    .split(/\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)\\s+x(\\d+)$/);
      return { nome: match?.[1]?.trim() || part, quantidade: Number(match?.[2] || 1) };
    });
}

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

const VAPID_PUBLIC_KEY = "BDN_JDP0Lbahzy597BZWX31sgBOL4Zh8e4nECMDE1QSKV9IG6oVR9EfIvPpW5vBzcwbsEN4g8JOWDJliXgCBC9w";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function registerWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
  }
  if (Notification.permission !== "granted") return false;

  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (!user) return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) throw error;
  return true;
}

function TechnicianPage() {
  const [orders, setOrders] = useState<Ordem[]>([]);
  const [actor, setActor] = useState<{ id: string; email: string; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("todas");
  const [finish, setFinish] = useState<Ordem | null>(null);
  const [details, setDetails] = useState<Ordem | null>(null);
  const [editCompleted, setEditCompleted] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [partsReplaced, setPartsReplaced] = useState<"sim" | "nao">("nao");
  const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([]);
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
    const { data, error } = await (supabase as any).from("pecas_catalogo").select("id,nome,ativo,criado_por_email,created_at,updated_at,estoque_atual,estoque_minimo").eq("ativo", true).order("nome", { ascending: true });
    if (!error) setPartsCatalog((data ?? []) as Peca[]);
    else console.warn("[Técnico] Catálogo de peças indisponível:", error);
  }

  function openFinish(order: Ordem) {
    if (!order.numero_os?.trim()) {
      toast.info("Aguardando o ADM informar o número da OS. Depois disso, você poderá finalizar o serviço.");
      return;
    }
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
          const rawPieces = action.pieces ?? [];
          const pieces = Array.isArray(rawPieces) && rawPieces.length && typeof rawPieces[0] === "string"
            ? (await (supabase as any).from("pecas_catalogo").select("id,nome").in("nome", rawPieces as string[])).data?.map((item: { id: string; nome: string }) => ({ id: item.id, nome: item.nome, quantidade: 1 })) ?? []
            : rawPieces;
          const { error } = await (supabase as any).rpc("finalizar_os_com_estoque", {
            p_os_id: action.orderId,
            p_notas: action.notes,
            p_pecas: pieces,
          });
          if (error) throw error;
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
    void registerWebPush().catch((error) => console.warn("[Push] Registro automático indisponível:", error));
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

        const receivedNewOrder = payload.eventType === "INSERT" || (assignedToTechnician && previous.tecnico_id !== actorId && previousEmail !== actorEmail);
        const requestReceivedOfficialNumber = assignedToTechnician && !String(previous.numero_os || "").trim() && !!String(next.numero_os || "").trim() && (next.solicitacao_status === "regularizada" || previous.solicitacao_os === true);

        if (receivedNewOrder || requestReceivedOfficialNumber) {
          const title = requestReceivedOfficialNumber ? "OS regularizada" : "Nova OS recebida";
          const body = requestReceivedOfficialNumber
            ? "A solicitação recebeu o número " + String(next.numero_os || "") + " e voltou para sua fila."
            : "Uma nova ordem de serviço foi enviada para você.";
          toast.success(body);
          try { playFieldAlert(); } catch {}
          if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
          if ("Notification" in window) {
            if (Notification.permission === "default") void Notification.requestPermission();
            if (Notification.permission === "granted" && "serviceWorker" in navigator) {
              void navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, { body, icon: "/agri-icon.svg", badge: "/agri-icon.svg" }));
            }
          }
        }      })
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
    const activeOrders = orders.filter(o => !(o as Ordem & { fechada_em?: string | null }).fechada_em);
    const base = tab === "todas" ? activeOrders : tab === "minhas" ? activeOrders.filter(o => o.status === "concluida") : activeOrders.filter(o => o.status === tab);
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
    if (!finish.numero_os?.trim()) {
      toast.warning("Esta OS ainda não possui número. O ADM precisa informar o número antes do fechamento.");
      setFinish(null);
      return;
    }
    const solution = notes.trim();
    if (!solution) { toast.error("Informe o serviço realizado."); return; }
    const pieces = partsReplaced === "sim"
      ? selectedParts.filter((part) => part.id && part.quantidade > 0)
      : [];
    if (partsReplaced === "sim" && !pieces.length) { toast.error("Selecione pelo menos uma peça trocada."); return; }
    if (pieces.some((part) => {
      const catalog = partsCatalog.find((item) => item.id === part.id);
      return !catalog || catalog.estoque_atual <= 0 || part.quantidade > catalog.estoque_atual;
    })) {
      toast.error("Não é possível adicionar uma peça sem estoque ou em quantidade maior que o estoque disponível.");
      return;
    }

    const finishedAt = new Date().toISOString();
    const orderToFinish = finish;

    const queueAction = async () => {
      const updated = {
        ...orderToFinish,
        status: "concluida",
        notas_fecho: solution,
        pecas_utilizadas: pieces.length ? pieces.map((part) => `${part.nome} x${part.quantidade}`).join("\n") : null,
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
      setSelectedParts([]);
      toast.success("Serviço finalizado offline. Será sincronizado quando a internet voltar.");
    };

    if (!navigator.onLine) {
      await queueAction();
      return;
    }

    const { error } = await (supabase as any).rpc("finalizar_os_com_estoque", {
      p_os_id: orderToFinish.id,
      p_notas: solution,
      p_pecas: pieces,
    });

    if (error) {
      if (isNetworkError(error)) {
        await queueAction();
        return;
      }
      toast.error(error.message || "Não foi possível finalizar a OS.");
      return;
    }

    setFinish(null);
    setNotes("");
    setSelectedParts([]);
    toast.success("Serviço finalizado e estoque atualizado.");
    await load();
    await loadPartsCatalog();
  }

  async function saveCompletedEdit() {
    if (!actor || !details || details.status !== "concluida") return;
    if ((details as Ordem & { fechada_em?: string | null }).fechada_em) {
      toast.error("Esta OS já foi fechada pelo administrador e não pode mais ser editada.");
      return;
    }
    const solution = editNotes.trim();
    if (!solution) { toast.error("Informe o serviço realizado."); return; }
    setEditBusy(true);
    const { data, error } = await (supabase as any).from("ordens_servico")
      .update({ notas_fecho: solution })
      .eq("id", details.id)
      .eq("status", "concluida")
      .is("fechada_em", null)
      .select("id");
    setEditBusy(false);
    if (error || !data?.length) {
      toast.error(error?.message || "A OS foi fechada ou alterada por outra pessoa. Atualize a tela.");
      await load();
      return;
    }
    const updated = { ...details, notas_fecho: solution } as Ordem;
    setDetails(updated);
    setOrders(current => current.map(item => item.id === details.id ? updated : item));
    setEditCompleted(false);
    const { error: historyError } = await supabase.from("historico_edicoes").insert({
      os_id: details.id,
      acao: "servico_editado",
      detalhe: `Descrição do serviço atualizada por ${actor.email}`,
      usuario_id: actor.id,
      usuario_email: actor.email,
    });
    if (historyError) console.warn("[Técnico] Não foi possível registrar edição no histórico:", historyError);
    toast.success("Serviço atualizado.");
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
    { label: "Solicitar OS", href: "/solicitacoes", icon: FilePlus2 },
    { label: "Histórico", href: "/historico", icon: History },
  ];

  return (<><main className="min-h-screen bg-[var(--agri-straw)] text-foreground">
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
          <button type="button" className="grid size-10 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" title="Ativar notificações" onClick={() => void registerWebPush().then((registered) => { if (registered) toast.success("Notificações do celular ativadas."); }) .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível ativar as notificações."))}><Bell className="size-4" /></button>
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
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-2xl font-black">{orders.filter(o => o.status === "concluida" && !(o as Ordem & { fechada_em?: string | null }).fechada_em).length}</div><div className="text-[10px] font-semibold uppercase text-white/65">Concluídas</div></div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full sm:w-auto">
          <TabsList className="grid h-12 w-full grid-cols-4 rounded-2xl bg-card p-1 shadow-sm sm:w-auto">
            <TabsTrigger value="todas" className="rounded-xl px-3">Todas</TabsTrigger>
            <TabsTrigger value="pendente" className="rounded-xl px-3">Pendentes</TabsTrigger>
            <TabsTrigger value="em_andamento" className="rounded-xl px-3">Em andamento</TabsTrigger>
            <TabsTrigger value="minhas" className="rounded-xl px-3">Minhas OSs</TabsTrigger>
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
            <div className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold shadow-sm">{order.status === "concluida" ? "Finalizada · aguardando ADM" : order.status === "em_andamento" ? "Em andamento" : "Pendente"}</div>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" /><span>{order.localizacao || "Localização não informada"}</span></div>
            <p className="rounded-2xl border bg-background p-4 leading-6 text-muted-foreground">{order.descricao || "Sem descrição do problema."}</p>
            <div className="grid gap-2 rounded-2xl border bg-muted/30 p-3 sm:grid-cols-3">
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Abertura da OS</p><p className="mt-1 font-semibold">{formatEntrada(order.entrada) || formatDataAberturaFallback(order.created_at)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Início</p><p className="mt-1 font-semibold">{formatDateTime(order.data_inicio, "Não iniciado")}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Fim</p><p className="mt-1 font-semibold">{formatDateTime(order.concluida_em, order.status === "em_andamento" ? "Em andamento" : "—")}</p></div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {order.localizacao && <Button variant="outline" size="lg" className="rounded-xl" onClick={(e) => { e.stopPropagation(); openMap(order.localizacao); }}><ExternalLink /> Abrir mapa</Button>}
            {order.status === "pendente" && <Button size="lg" className="rounded-xl shadow-md" onClick={(e) => { e.stopPropagation(); void start(order); }}><Play /> Iniciar serviço</Button>}
            {order.status === "em_andamento" && order.numero_os?.trim() && <Button size="lg" className="rounded-xl shadow-md" onClick={(e) => { e.stopPropagation(); openFinish(order); }}><CheckCircle2 /> Finalizar serviço</Button>}
            {order.status === "em_andamento" && !order.numero_os?.trim() && (
              <Button type="button" size="lg" variant="secondary" className="rounded-xl" disabled>
                <LockKeyhole /> Aguardando número da OS
              </Button>
            )}
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
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Horários do atendimento</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Abertura da OS</p><p className="mt-1 font-semibold">{formatEntrada(details.entrada) || formatDataAberturaFallback(details.created_at)}</p></div>
              <div><p className="text-xs text-muted-foreground">Início do atendimento</p><p className="mt-1 font-semibold">{formatDateTime(details.data_inicio, "Não iniciado")}</p></div>
              <div><p className="text-xs text-muted-foreground">Fim do atendimento</p><p className="mt-1 font-semibold">{formatDateTime(details.concluida_em, details.status === "em_andamento" ? "Em andamento" : "—")}</p></div>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Peças trocadas</p>
            {getReplacedParts(details.pecas_utilizadas).length ? (
              <div className="mt-2 grid gap-2">
                {getReplacedParts(details.pecas_utilizadas).map((part, index) => (
                  <div key={`${part.nome}-${index}`} className="flex items-center justify-between rounded-xl border bg-background px-3 py-2">
                    <span className="font-medium">{part.nome}</span>
                    <span className="text-sm text-muted-foreground">Qtd.: {part.quantidade}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma peça trocada</p>
            )}
          </div>
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Serviço realizado</p>
            {editCompleted ? (
              <Textarea className="mt-2" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={4} />
            ) : (
              <p className="mt-1 whitespace-pre-wrap leading-6">{details.notas_fecho || "Sem descrição do serviço."}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {details.status === "concluida" && !(details as Ordem & { fechada_em?: string | null }).fechada_em && !editCompleted && <Button variant="outline" className="rounded-xl" onClick={() => { setEditNotes(details.notas_fecho || ""); setEditCompleted(true); }}>Editar serviço</Button>}
            {editCompleted && <>
              <Button className="rounded-xl" disabled={editBusy} onClick={() => void saveCompletedEdit()}>{editBusy ? "Salvando..." : "Salvar alterações"}</Button>
              <Button variant="outline" className="rounded-xl" disabled={editBusy} onClick={() => setEditCompleted(false)}>Cancelar edição</Button>
            </>}
            {(details as Ordem & { fechada_em?: string | null }).fechada_em && <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">Fechada pelo administrador · somente leitura</span>}
            {details.localizacao && <Button variant="outline" className="rounded-xl" onClick={() => openMap(details.localizacao)}>Abrir mapa</Button>}
            {details.status === "pendente" && <Button className="rounded-xl" onClick={() => { setDetails(null); void start(details); }}><Play /> Iniciar serviço</Button>}
            {details.status === "em_andamento" && details.numero_os?.trim() && <Button className="rounded-xl" onClick={() => { setDetails(null); openFinish(details); }}><CheckCircle2 /> Finalizar serviço</Button>}
            {details.status === "em_andamento" && !details.numero_os?.trim() && (
              <Button type="button" className="rounded-xl" variant="secondary" disabled>
                <LockKeyhole /> Aguardando número da OS
              </Button>
            )}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!finish} onOpenChange={(open) => {
      if (!open) {
        setFinish(null);
        setNotes("");
        setPartsReplaced("nao");
        setSelectedParts([]);
      }
    }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl overscroll-contain touch-pan-y sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalizar OS {finish?.numero_os}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-muted/20 p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <ClipboardList className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold tracking-tight">Registro do atendimento</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Confirme se houve troca de peças e descreva o serviço realizado antes de concluir a OS.
              </p>
            </div>
          </div>

          <section className="grid gap-3 rounded-2xl border p-4">
            <div>
              <p className="text-sm font-bold">Houve troca de peças?</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Essa informação ajuda a manter o histórico do equipamento e o estoque atualizados.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={partsReplaced === "nao"}
                onClick={() => {
                  setPartsReplaced("nao");
                  setSelectedParts([]);
                }}
                className={`flex min-h-[82px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/30 sm:p-4 ${partsReplaced === "nao" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${partsReplaced === "nao" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <X className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">Não houve troca</span>
                  <span className="mt-1 block text-xs leading-4 text-muted-foreground">Nenhuma peça foi utilizada</span>
                </span>
                {partsReplaced === "nao" && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
              </button>

              <button
                type="button"
                aria-pressed={partsReplaced === "sim"}
                onClick={() => setPartsReplaced("sim")}
                className={`flex min-h-[82px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/30 sm:p-4 ${partsReplaced === "sim" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${partsReplaced === "sim" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <ClipboardList className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">Sim, usei peças</span>
                  <span className="mt-1 block text-xs leading-4 text-muted-foreground">Informar itens e quantidades</span>
                </span>
                {partsReplaced === "sim" && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
              </button>
            </div>
          </section>

          {partsReplaced === "sim" ? (
            <section className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">Peças substituídas</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Escolha cada item e informe a quantidade usada no serviço.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  {selectedParts.length} {selectedParts.length === 1 ? "item" : "itens"}
                </span>
              </div>

              {!partsCatalog.length ? (
                <div className="rounded-xl border border-dashed bg-background p-3 text-sm text-muted-foreground">
                  Nenhuma peça cadastrada ainda. Solicite ao administrador que cadastre os itens no estoque.
                </div>
              ) : null}

              {selectedParts.map((part, index) => {
                const catalogPart = partsCatalog.find((item) => item.id === part.id);
                const available = catalogPart?.estoque_atual ?? 0;

                return (
                  <div key={index} className="grid gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
                    <div className="grid min-w-0 gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Peça</span>
                      <Select
                        value={part.id || ""}
                        onValueChange={(value) => {
                          const item = partsCatalog.find((entry) => entry.id === value);
                          setSelectedParts((current) =>
                            current.map((selected, i) =>
                              i === index && item
                                ? { id: item.id, nome: item.nome, quantidade: 1 }
                                : selected,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="h-11 min-w-0 rounded-xl">
                          <SelectValue placeholder="Selecione a peça" />
                        </SelectTrigger>
                        <SelectContent>
                          {partsCatalog
                            .filter((item) => !selectedParts.some((selected) => selected.id === item.id) || item.id === part.id)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id} disabled={item.estoque_atual <= 0}>
                                {item.nome} — estoque: {item.estoque_atual}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantidade</span>
                      <div className="flex h-11 items-center rounded-xl border bg-background">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-10 shrink-0 rounded-l-xl px-0 text-lg font-black"
                          disabled={!part.id || available <= 0 || part.quantidade <= 1}
                          onClick={() =>
                            setSelectedParts((current) =>
                              current.map((selected, i) =>
                                i === index
                                  ? { ...selected, quantidade: Math.max(1, selected.quantidade - 1) }
                                  : selected,
                              ),
                            )
                          }
                          aria-label="Diminuir quantidade"
                        >
                          −
                        </Button>
                        <span className="min-w-0 flex-1 text-center font-bold tabular-nums" aria-label="Quantidade utilizada">
                          {part.quantidade}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 w-10 shrink-0 rounded-r-xl px-0 text-lg font-black"
                          disabled={!part.id || available <= 0 || part.quantidade >= available}
                          onClick={() =>
                            setSelectedParts((current) =>
                              current.map((selected, i) =>
                                i === index
                                  ? { ...selected, quantidade: Math.min(available, selected.quantidade + 1) }
                                  : selected,
                              ),
                            )
                          }
                          aria-label="Aumentar quantidade"
                        >
                          +
                        </Button>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {part.id ? `${available} disponível(is) no estoque` : "Selecione uma peça"}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl px-3"
                      onClick={() => setSelectedParts((current) => current.filter((_, i) => i !== index))}
                    >
                      <X className="mr-1.5 size-4" />
                      Remover
                    </Button>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-dashed border-primary/40 bg-background hover:bg-primary/5"
                disabled={
                  !partsCatalog.some((item) => item.estoque_atual > 0) ||
                  selectedParts.length >= partsCatalog.filter((item) => item.estoque_atual > 0).length
                }
                onClick={() =>
                  setSelectedParts((current) => [
                    ...current,
                    { id: "", nome: "", quantidade: 1 },
                  ])
                }
              >
                + Adicionar outra peça
              </Button>

              {selectedParts.length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-xs leading-5 text-muted-foreground">
                    O estoque será reduzido pela quantidade informada quando a OS for concluída.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-2 rounded-2xl border p-4">
            <div>
              <p className="text-sm font-bold">Relato do serviço</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Descreva o que foi feito, o defeito encontrado e a solução aplicada.
              </p>
            </div>
            <Textarea
              className="min-h-36 rounded-xl"
              autoFocus
              rows={6}
              placeholder="Ex.: verificado o sistema, substituída a peça e realizado teste de funcionamento..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setFinish(null)}
          >
            Voltar
          </Button>
          <Button className="rounded-xl" onClick={finalize}>
            Finalizar serviço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    </div>
  </main></>);
}
