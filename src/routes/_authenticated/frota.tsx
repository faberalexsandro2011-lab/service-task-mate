import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Boxes, Camera, CarFront, Copy, History, Package, Plus, QrCode, RefreshCw, Search, Truck, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Unidade = { id: string; nome: string };
type Frota = { id: string; unidade_id: string; numero: string; tipo: string; marca: string | null; modelo: string | null; status: string; qr_publico_token?: string | null };
type Componente = { id: string; unidade_id: string; tipo: string; fabricante: string | null; modelo: string | null; numero_serie: string; status: string; localizacao_estoque?: string | null };
type LinhaImportacaoFrota = { numero: string; tipo: string; marca: string; modelo: string; componente_tipo: string; fabricante: string; componente_modelo: string; numero_serie: string; localizacao: string };
type MovimentacaoEstoque = { id: string; componente_id: string; tipo: string; localizacao_origem: string | null; localizacao_destino: string | null; ocorrido_em: string; responsavel_email: string | null; observacoes: string | null };
type Instalacao = {
  id: string; frota_id: string; componente_id: string; unidade_id: string;
  instalado_em: string; instalado_por_email: string | null; instalado_por_nome: string | null; retirado_em: string | null;
  retirado_por_email: string | null; retirado_por_nome: string | null; motivo_retirada: string | null;
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

function normalizarTipoComponente(tipo: string) {
  return tipo.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function nomeTipoComponente(tipo: string) {
  return tiposComponente.find(([value]) => value === tipo)?.[1] ?? tipo;
}

function nomeStatusComponente(status: string) {
  return ({
    disponivel: "Disponível",
    instalado: "Instalado",
    manutencao: "Em manutenção",
    descartado: "Descartado",
    backup: "Backup",
  } as Record<string, string>)[status] ?? status;
}

function SerialCameraScanner({ onCapture, onClose }: { onCapture: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrCandidate, setOcrCandidate] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState("");
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setError("A câmera ainda não está pronta.");
      return;
    }
    const viewport = video.parentElement;
    const frame = viewport?.querySelector<HTMLElement>("[data-camera-frame]");
    if (!viewport || !frame) {
      setError("Não foi possível localizar a área de enquadramento.");
      return;
    }

    // Recorta a mesma região visível dentro da moldura, compensando o object-fit: cover.
    const viewportRect = viewport.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const scale = Math.max(viewportRect.width / video.videoWidth, viewportRect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (renderedWidth - viewportRect.width) / 2;
    const offsetY = (renderedHeight - viewportRect.height) / 2;
    const sourceX = Math.max(0, (frameRect.left - viewportRect.left + offsetX) / scale);
    const sourceY = Math.max(0, (frameRect.top - viewportRect.top + offsetY) / scale);
    const sourceWidth = Math.min(video.videoWidth - sourceX, frameRect.width / scale);
    const sourceHeight = Math.min(video.videoHeight - sourceY, frameRect.height / scale);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      setError("A área enquadrada está inválida. Ajuste a câmera e tente novamente.");
      return;
    }

    const outputScale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Não foi possível capturar a foto.");
      return;
    }
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    setCapturedPhoto(canvas.toDataURL("image/jpeg", 0.9));
    setOcrCandidate("");
    setOcrText("");
    setOcrProgress(0);
    setError("");
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    let frame = 0;
    let detector: any;
    async function start() {
      try {
        const Detector = (window as any).BarcodeDetector;
        if (Detector) {
          detector = new Detector({ formats: ["qr_code", "code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "data_matrix", "pdf417"] });
        } else {
          setSupported(false);
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const videoTrack = stream.getVideoTracks()[0];
        videoTrackRef.current = videoTrack ?? null;
        const capabilities = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } };
        if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
          const range = { min: capabilities.zoom.min, max: Math.min(capabilities.zoom.max, 4), step: capabilities.zoom.step || 0.1 };
          setZoomRange(range);
          setZoom(Math.max(range.min, Math.min(1, range.max)));
        }
        const scan = async () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            if (active) frame = requestAnimationFrame(scan);
            return;
          }
          if (detector) {
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes?.[0]?.rawValue?.trim();
              if (value) { active = false; onCaptureRef.current(value); return; }
            } catch { /* tenta novamente no próximo quadro */ }
          }
          if (active) frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível acessar a câmera. Verifique a permissão do navegador.");
      }
    }
    void start();
    return () => { active = false; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, []);

  function changeZoom(value: number) {
    setZoom(value);
    const track = videoTrackRef.current;
    if (track) void track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {
      setError("Este aparelho não permitiu ajustar o zoom da câmera. Tente aproximar o aparelho da etiqueta.");
    });
  }

  async function readPrintedText() {
    if (!capturedPhoto) return setError("Tire uma foto da etiqueta antes de iniciar a leitura.");
    setOcrBusy(true);
    setError("");
    setOcrCandidate("");
    setOcrText("");
    let worker: any;
    try {
      const w = window as any;
      if (!w.Tesseract) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-central-frota-ocr="true"]');
          if (existing) {
            if (w.Tesseract) return resolve();
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o mecanismo de OCR.")), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
          script.async = true;
          script.dataset.centralFrotaOcr = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Falha ao carregar OCR. Verifique a conexão com a internet."));
          document.head.appendChild(script);
        });
      }
      const Tesseract = (window as any).Tesseract;
      if (!Tesseract) throw new Error("O mecanismo de OCR não ficou disponível.");
      worker = await Tesseract.createWorker("eng", 1, {
        logger: (message: any) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") setOcrProgress(Math.round(message.progress * 100));
        },
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/tesseract-core.wasm.js",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
      });
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._/",
        preserve_interword_spaces: "1",
      });
      const result = await worker.recognize(capturedPhoto);
      const text = String(result.data.text ?? "").replace(/\s+/g, " ").trim();
      setOcrText(text);
      const candidates = text.match(/[A-Z0-9][A-Z0-9._/-]{3,23}/gi) ?? [];
      const candidate = candidates.find((item: string) => /\d/.test(item)) ?? candidates[0] ?? "";
      if (!candidate) throw new Error("Não identifiquei um número de série com segurança. Aproxime a câmera e tente novamente.");
      setOcrCandidate(candidate.toUpperCase());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o texto da etiqueta.");
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setOcrBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4">
      <div className="my-auto w-full max-w-lg space-y-3 rounded-2xl bg-background p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div><h3 className="font-semibold">Capturar número de série</h3><p className="text-xs text-muted-foreground">Leia o código de barras/QR ou o texto impresso na etiqueta.</p></div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar câmera"><X className="size-5" /></Button>
        </div>
        {error && <div className="rounded-xl bg-muted p-3 text-sm text-destructive">{error}</div>}
        <div className="relative mx-auto aspect-square w-full max-h-[50vh] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-[5%] top-[32%] bottom-[32%] rounded-lg border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" data-camera-frame>
            <span className="absolute -top-6 left-0 rounded bg-black/60 px-2 py-1 text-[11px] font-medium text-white">Enquadre o número inteiro aqui</span>
          </div>
        </div>
        {zoomRange && <div className="space-y-1 rounded-lg border p-3">
          <div className="flex items-center justify-between text-sm"><label htmlFor="serial-camera-zoom" className="font-medium">Zoom da câmera</label><span className="font-mono text-muted-foreground">{zoom.toFixed(1)}×</span></div>
          <input id="serial-camera-zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={event => changeZoom(Number(event.target.value))} className="w-full accent-primary" />
          <p className="text-xs text-muted-foreground">Aproxime a imagem para destacar a etiqueta. Ajuste a moldura para incluir o número completo.</p>
        </div>}
        {!zoomRange && <p className="text-xs text-muted-foreground">Para dar mais foco, aproxime o aparelho da etiqueta. O zoom ajustável não está disponível neste navegador.</p>}
        {!supported && <p className="text-xs text-muted-foreground">Leitura automática de códigos não disponível neste navegador. Você ainda pode fotografar o texto com OCR.</p>}
        <Button type="button" variant="outline" className="w-full" onClick={capturePhoto} disabled={ocrBusy}>
          <Camera className="mr-2 size-4" />{capturedPhoto ? "Tirar outra foto" : "Tirar foto da etiqueta"}
        </Button>
        {capturedPhoto && <div className="space-y-2 rounded-xl border p-2">
          <p className="text-xs font-medium text-muted-foreground">Foto capturada — confira se o número está nítido.</p>
          <img src={capturedPhoto} alt="Foto da etiqueta do equipamento" className="max-h-48 w-full rounded-lg object-contain" />
          <Button type="button" className="w-full" onClick={() => void readPrintedText()} disabled={ocrBusy}>
            <Camera className="mr-2 size-4" />{ocrBusy ? `Lendo foto... ${ocrProgress}%` : "Ler número na foto (OCR)"}
          </Button>
        </div>}
        {ocrCandidate && <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">Número provável encontrado</p>
          <p className="rounded-md bg-muted p-2 font-mono text-lg font-bold">{ocrCandidate}</p>
          <Button type="button" className="w-full" onClick={() => onCapture(ocrCandidate)}>Usar este número de série</Button>
          <p className="text-xs text-muted-foreground">Confira o número depois de preencher, pois letras e números parecidos podem ser confundidos.</p>
        </div>}
        {ocrText && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver todo o texto reconhecido</summary><p className="mt-2 rounded-md bg-muted p-2">{ocrText}</p></details>}
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>Fechar leitor</Button>
        <p className="text-xs text-muted-foreground">O OCR analisa a foto capturada e reconhece letras e números da etiqueta. Na primeira utilização, o mecanismo precisa ser carregado pela internet; depois, o navegador poderá reutilizá-lo conforme o cache. A digitação manual continua disponível.</p>
      </div>
    </div>
  );
}

function CentralFrotaPage() {
  const [tab, setTab] = useState<"frotas" | "componentes" | "instalacoes" | "estoque" | "historico">("frotas");
  const [units, setUnits] = useState<Unidade[]>([]);
  const [isCentralManager, setIsCentralManager] = useState(false);
  const [canViewComponentTotals, setCanViewComponentTotals] = useState(false);
  const [fleets, setFleets] = useState<Frota[]>([]);
  const [components, setComponents] = useState<Componente[]>([]);
  const [installations, setInstallations] = useState<Instalacao[]>([]);
  const [stockMovements, setStockMovements] = useState<MovimentacaoEstoque[]>([]);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const [importRows, setImportRows] = useState<LinhaImportacaoFrota[]>([]);
  const [importUnitId, setImportUnitId] = useState("");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [fleetForm, setFleetForm] = useState({ unidade_id: "", numero: "", tipo: "trator", marca: "", modelo: "" });
  const [componentForm, setComponentForm] = useState({ unidade_id: "", tipo: "monitor", tipoPersonalizado: "", fabricante: "", modelo: "", numero_serie: "" });
  const [installForm, setInstallForm] = useState({ frota_id: "", componente_id: "" });
  const [removal, setRemoval] = useState({ id: "", motivo: "", status: "disponivel" });
  const [editingFleet, setEditingFleet] = useState(false);
  const [editingComponent, setEditingComponent] = useState(false);
  const [serialScannerTarget, setSerialScannerTarget] = useState<"new" | "edit" | null>(null);
  const [fleetEditForm, setFleetEditForm] = useState({ numero: "", tipo: "trator", marca: "", modelo: "", status: "ativa" });
  const [componentEditForm, setComponentEditForm] = useState({ tipo: "monitor", tipoPersonalizado: "", fabricante: "", modelo: "", numero_serie: "", status: "disponivel" });

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
      const canViewComponentTotals = (memberships ?? []).some((item: any) => item.perfil === "admin_unidade" || (item.perfil === "gestor_central" && item.unidade_id === null));
      setIsCentralManager(central);
      setCanViewComponentTotals(canViewComponentTotals);
      const [unitResult, fleetResult, componentResult, installationResult, movementResult] = await Promise.all([
        (supabase as any).from("unidades").select("id,nome").order("nome"),
        (supabase as any).from("frotas").select("*").order("numero"),
        (supabase as any).from("componentes_frota").select("*").order("numero_serie"),
        (supabase as any).from("instalacoes_frota")
          .select("*,frotas(numero,tipo),componentes_frota(tipo,numero_serie)")
           .order("instalado_em", { ascending: false }),
        (supabase as any).from("movimentacoes_componentes_frota").select("*").order("ocorrido_em", { ascending: false }).limit(200),
      ]);
      const failure = unitResult.error || fleetResult.error || componentResult.error || installationResult.error || movementResult.error;
      if (failure) throw failure;
      const memberUnitIds = new Set((memberships ?? []).map((item: any) => item.unidade_id).filter(Boolean));
      const allowedUnits = (unitResult.data ?? []).filter((unit: Unidade) => central || memberUnitIds.has(unit.id));
      setUnits(allowedUnits);
      setFleets(fleetResult.data ?? []);
      setComponents(componentResult.data ?? []);
      setInstallations(installationResult.data ?? []);
      setStockMovements(movementResult.data ?? []);
      setFleetForm(current => ({ ...current, unidade_id: allowedUnits.some((u: Unidade) => u.id === current.unidade_id) ? current.unidade_id : allowedUnits[0]?.id || "" }));
      setComponentForm(current => ({ ...current, unidade_id: allowedUnits.some((u: Unidade) => u.id === current.unidade_id) ? current.unidade_id : allowedUnits[0]?.id || "" }));
    } catch (error) {
      toast.error("Não foi possível carregar o Central Frota. Verifique sua conexão e suas permissões de acesso.");
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
  const publicFleetUrl = selectedFleet?.qr_publico_token
    ? `${window.location.origin}/frota-publica/${selectedFleet.qr_publico_token}`
    : "";
  const fleetQrImageUrl = publicFleetUrl
    ? `https://quickchart.io/qr?text=${encodeURIComponent(publicFleetUrl)}&size=320&margin=2&ecLevel=M`
    : "";
  const fleetInstallations = selectedFleet ? installations.filter(item => item.frota_id === selectedFleet.id) : [];
  const componentInstallations = selectedComponent ? installations.filter(item => item.componente_id === selectedComponent.id) : [];
  const currentComponentInstallation = selectedComponent ? activeInstallations.find(item => item.componente_id === selectedComponent.id) : null;
  const currentComponentFleet = currentComponentInstallation ? fleets.find(item => item.id === currentComponentInstallation.frota_id) : null;
  const siblingInstallations = currentComponentFleet ? activeInstallations.filter(item => item.frota_id === currentComponentFleet.id) : [];
  const tiposPersonalizados = [...new Set(components.map(item => item.tipo).filter(tipo => !tiposComponente.some(([value]) => value === tipo)))];
  const opcoesTipoComponente: [string, string][] = [
    ...tiposComponente.map(([value, label]) => [value, label] as [string, string]),
    ...tiposPersonalizados.map(tipo => [tipo, tipo] as [string, string]),
  ];

  async function generateFleetQr() {
    if (!selectedFleet) return;
    setQrLoading(true);
    const { data, error } = await (supabase as any).rpc("central_frota_gerar_qr_publico", {
      p_frota_id: selectedFleet.id,
    });
    setQrLoading(false);
    if (error || !data) {
      toast.error("Não foi possível gerar o QR Code: " + (error?.message ?? "resposta inválida"));
      return;
    }
    setFleets(current => current.map(item => item.id === selectedFleet.id
      ? { ...item, qr_publico_token: String(data) }
      : item));
    toast.success("QR Code permanente criado para esta frota.");
  }

  async function copyFleetPublicLink() {
    if (!publicFleetUrl) return;
    try {
      await navigator.clipboard.writeText(publicFleetUrl);
      toast.success("Link público copiado.");
    } catch {
      toast.error("Não foi possível copiar o link neste navegador.");
    }
  }

  function printFleetQrLabel() {
    if (!selectedFleet || !publicFleetUrl || !fleetQrImageUrl) return;
    const printWindow = window.open("", "_blank", "width=520,height=640");
    if (!printWindow) {
      toast.error("Permita a abertura de janelas para imprimir a etiqueta.");
      return;
    }
    const fleetNumber = selectedFleet.numero.replace(/[&<>"']/g, "");
    printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta frota ${fleetNumber}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;text-align:center}
      .label{width:100%;max-width:360px;margin:0 auto;border:2px solid #222;border-radius:16px;padding:20px}
      h1{font-size:25px;margin:0 0 4px}p{font-size:13px;margin:0;color:#555}
      img{display:block;width:250px;height:250px;margin:14px auto}
      .url{font-size:9px;overflow-wrap:anywhere;color:#666}
      @media print{body{padding:0}.label{border:1.5px solid #111;break-inside:avoid}}
    </style></head><body><div class="label"><h1>FROTA ${fleetNumber}</h1><p>Central OS · Central Frota</p><img src="${fleetQrImageUrl}" alt="QR Code da frota"><p class="url">${publicFleetUrl}</p></div><script>window.onload=()=>{const img=document.querySelector('img');if(img.complete)window.print();else img.onload=()=>window.print();};</script></body></html>`);
    printWindow.document.close();
  }

  async function saveFleetChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFleet || !fleetEditForm.numero.trim()) return toast.error("Informe o número da frota.");
    setSaving(true);
    const { error } = await (supabase as any).from("frotas").update({
      numero: fleetEditForm.numero.trim(), tipo: fleetEditForm.tipo, marca: fleetEditForm.marca.trim() || null,
      modelo: fleetEditForm.modelo.trim() || null, status: fleetEditForm.status,
    }).eq("id", selectedFleet.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível editar a frota: " + error.message);
    toast.success("Frota atualizada.");
    setEditingFleet(false);
    await load();
  }

  async function saveComponentChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tipoInformado = componentEditForm.tipo === "__novo_tipo__" ? componentEditForm.tipoPersonalizado.trim() : componentEditForm.tipo;
    if (!selectedComponent || !componentEditForm.numero_serie.trim()) return toast.error("Informe o número de série.");
    if (!tipoInformado) return toast.error("Informe o nome do novo tipo de equipamento.");
    const tipoExistente = components.find(item => normalizarTipoComponente(item.tipo) === normalizarTipoComponente(tipoInformado))?.tipo;
    setSaving(true);
    const { error } = await (supabase as any).from("componentes_frota").update({
      tipo: tipoExistente ?? tipoInformado, fabricante: componentEditForm.fabricante.trim() || null,
      modelo: componentEditForm.modelo.trim() || null, numero_serie: componentEditForm.numero_serie.trim(), status: componentEditForm.status,
    }).eq("id", selectedComponent.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível editar o componente: " + error.message);
    toast.success("Componente atualizado.");
    setEditingComponent(false);
    await load();
  }


  function normalizeExcelHeader(value: unknown) {
    return String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  async function readFleetImportFile(file: File) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("A planilha não possui uma primeira aba válida.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!raw.length) throw new Error("A planilha está vazia.");
      const rows = raw.map(record => {
        const normalized = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalizeExcelHeader(key), value]));
        const pick = (...keys: string[]) => {
          for (const key of keys) if (normalized[key] !== undefined && String(normalized[key]).trim()) return String(normalized[key]).trim();
          return "";
        };
        return {
          numero: pick("numero_frota", "frota", "numero", "identificacao_frota", "codigo_frota"),
          tipo: pick("tipo_frota", "tipo", "categoria") || "trator",
          marca: pick("marca_frota", "marca"), modelo: pick("modelo_frota", "modelo"),
          componente_tipo: pick("tipo_dispositivo", "tipo_componente", "componente", "equipamento"),
          fabricante: pick("fabricante", "marca_dispositivo", "fabricante_dispositivo"),
          componente_modelo: pick("modelo_dispositivo", "modelo_componente"),
          numero_serie: pick("numero_serie", "serie", "serial", "numero_de_serie"),
          localizacao: pick("localizacao", "local_estoque", "prateleira"),
        };
      }).filter(row => row.numero);
      if (!rows.length) throw new Error("Não encontrei linhas com número da frota. Confira a coluna 'Número frota'.");
      setImportRows(rows);
      setImportUnitId(current => current || fleetForm.unidade_id || units[0]?.id || "");
      toast.success(`${rows.length} linha(s) lida(s). Confira a prévia antes de confirmar.`);
    } catch (error) {
      setImportRows([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    }
  }

  async function exportFleetsExcel() {
    const rows = fleets.flatMap(fleet => {
      const related = activeInstallations.filter(item => item.frota_id === fleet.id);
      const base = { "Unidade": units.find(unit => unit.id === fleet.unidade_id)?.nome ?? "", "Número frota": fleet.numero, "Tipo frota": fleet.tipo, "Marca frota": fleet.marca ?? "", "Modelo frota": fleet.modelo ?? "", "Status frota": fleet.status };
      if (!related.length) return [{ ...base, "Tipo dispositivo": "", "Fabricante": "", "Modelo dispositivo": "", "Número de série": "" }];
      return related.map(item => ({ ...base, "Tipo dispositivo": item.componentes_frota?.tipo ?? "", "Fabricante": components.find(c => c.id === item.componente_id)?.fabricante ?? "", "Modelo dispositivo": components.find(c => c.id === item.componente_id)?.modelo ?? "", "Número de série": item.componentes_frota?.numero_serie ?? "" }));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Frotas e dispositivos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(components.map(c => ({ "Unidade": units.find(u => u.id === c.unidade_id)?.nome ?? "", "Tipo": c.tipo, "Fabricante": c.fabricante ?? "", "Modelo": c.modelo ?? "", "Número de série": c.numero_serie, "Status": c.status, "Localização": c.localizacao_estoque ?? "" }))), "Estoque completo");
    XLSX.writeFile(wb, `central-frotas-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success("Planilha Excel exportada.");
  }

  async function importFleetsExcel() {
    if (!importRows.length || !importUnitId) return toast.error("Selecione a unidade e carregue uma planilha válida.");
    setImporting(true);
    let createdFleets = 0, createdComponents = 0, skipped = 0;
    const fleetMap = new Map<string, string>();
    const serials = new Set(components.map(c => `${c.unidade_id}::${c.numero_serie.toLocaleLowerCase("pt-BR")}`));
    try {
      for (const row of importRows) {
        const fleetKey = `${importUnitId}::${row.numero.toLocaleLowerCase("pt-BR")}`;
        let fleetId = fleetMap.get(fleetKey) ?? fleets.find(f => f.unidade_id === importUnitId && f.numero.toLocaleLowerCase("pt-BR") === row.numero.toLocaleLowerCase("pt-BR"))?.id;
        if (!fleetId) {
          const { data, error } = await (supabase as any).from("frotas").insert({ unidade_id: importUnitId, numero: row.numero, tipo: tiposFrota.some(([v]) => v === row.tipo) ? row.tipo : "trator", marca: row.marca || null, modelo: row.modelo || null }).select("id").single();
          if (error) throw new Error(`Frota ${row.numero}: ${error.message}`);
          fleetId = data.id; createdFleets++;
        } else skipped++;
        fleetMap.set(fleetKey, fleetId);
        if (!row.numero_serie) continue;
        const serialKey = `${importUnitId}::${row.numero_serie.toLocaleLowerCase("pt-BR")}`;
        if (serials.has(serialKey)) { skipped++; continue; }
        const { data: createdComponent, error } = await (supabase as any).from("componentes_frota").insert({ unidade_id: importUnitId, tipo: row.componente_tipo || "outro", fabricante: row.fabricante || null, modelo: row.componente_modelo || null, numero_serie: row.numero_serie, localizacao_estoque: row.localizacao || "Estoque geral" }).select("id").single();
        if (error) throw new Error(`Dispositivo ${row.numero_serie}: ${error.message}`);
        const { error: installError } = await (supabase as any).from("instalacoes_frota").insert({ unidade_id: importUnitId, frota_id: fleetId, componente_id: createdComponent.id });
        if (installError) throw new Error(`Vínculo do dispositivo ${row.numero_serie} à frota ${row.numero}: ${installError.message}`);
        serials.add(serialKey); createdComponents++;
      }
      toast.success(`Importação concluída: ${createdFleets} frota(s), ${createdComponents} dispositivo(s); ${skipped} item(ns) existente(s) ignorado(s).`);
      setImportRows([]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Importação interrompida. Confira os registros já processados.");
      await load();
    } finally { setImporting(false); }
  }

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
    const tipoInformado = componentForm.tipo === "__novo_tipo__" ? componentForm.tipoPersonalizado.trim() : componentForm.tipo;
    if (!componentForm.unidade_id || !componentForm.numero_serie.trim()) return toast.error("Selecione a unidade e informe o número de série.");
    if (!tipoInformado) return toast.error("Informe o nome do novo tipo de equipamento.");
    const tipoExistente = components.find(item => normalizarTipoComponente(item.tipo) === normalizarTipoComponente(tipoInformado))?.tipo;
    setSaving(true);
    const { error } = await (supabase as any).from("componentes_frota").insert({
      unidade_id: componentForm.unidade_id, tipo: tipoExistente ?? tipoInformado,
      numero_serie: componentForm.numero_serie.trim(),
      fabricante: componentForm.fabricante.trim() || null, modelo: componentForm.modelo.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message.includes("unique") ? "Esse número de série já está cadastrado." : "Não foi possível cadastrar o componente: " + error.message);
    toast.success("Componente cadastrado.");
    setComponentForm(current => ({ ...current, tipo: "monitor", tipoPersonalizado: "", numero_serie: "", fabricante: "", modelo: "" }));
    await load();
  }

  async function saveStockLocation(component: Componente) {
    const location = (locationDrafts[component.id] ?? component.localizacao_estoque ?? "Estoque geral").trim();
    if (!location) return toast.error("Informe a prateleira ou local do estoque.");
    setSaving(true);
    const { error } = await (supabase as any).from("componentes_frota")
      .update({ localizacao_estoque: location }).eq("id", component.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível atualizar o local: " + error.message);
    toast.success("Localização do dispositivo atualizada.");
    await load();
  }

  async function installComponent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fleet = fleets.find(item => item.id === installForm.frota_id);
    const component = components.find(item => item.id === installForm.componente_id);
    if (!fleet || !component) return toast.error("Selecione a frota e o componente.");
    if (fleet.unidade_id !== component.unidade_id) return toast.error("A frota e o componente precisam pertencer à mesma unidade.");
    const sameTypeAlreadyInstalled = activeInstallations.some(item =>
      item.frota_id === fleet.id && item.componentes_frota?.tipo === component.tipo
    );
    if (sameTypeAlreadyInstalled) {
      const typeLabel = tiposComponente.find(([value]) => value === component.tipo)?.[1] ?? component.tipo;
      return toast.error(`Esta frota já possui um(a) ${typeLabel} instalado(a). Retire o equipamento atual antes de instalar outro do mesmo tipo.`);
    }
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
    { id: "estoque", label: "Estoque", icon: Package },
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
            <Button className="mt-3" variant="outline" size="sm" onClick={() => { setFleetEditForm({ numero: selectedFleet.numero, tipo: selectedFleet.tipo, marca: selectedFleet.marca ?? "", modelo: selectedFleet.modelo ?? "", status: selectedFleet.status }); setEditingFleet(true); }}>Editar dados da frota</Button>
          </div>
          <section className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold">Etiqueta QR Code da frota</h3><p className="text-sm text-muted-foreground">Um código permanente para esta frota. A consulta mostra somente os dispositivos instalados atualmente.</p></div>
              {!selectedFleet.qr_publico_token && <Button type="button" onClick={() => void generateFleetQr()} disabled={qrLoading}><QrCode className="mr-2 size-4" />{qrLoading ? "Gerando..." : "Gerar QR Code"}</Button>}
            </div>
            {selectedFleet.qr_publico_token && <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="rounded-xl border bg-white p-2"><img src={fleetQrImageUrl} alt={`QR Code permanente da frota ${selectedFleet.numero}`} className="size-44 object-contain" /></div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-semibold">QR Code ativo · Frota {selectedFleet.numero}</p>
                <p className="break-all text-xs text-muted-foreground">{publicFleetUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyFleetPublicLink()}><Copy className="mr-2 size-4" />Copiar link</Button>
                  <Button type="button" size="sm" onClick={printFleetQrLabel}><QrCode className="mr-2 size-4" />Imprimir etiqueta</Button>
                </div>
                <p className="text-xs text-muted-foreground">O endereço e o QR Code não mudam quando os dispositivos são instalados, retirados ou substituídos.</p>
              </div>
            </div>}
          </section>
          {editingFleet && <form onSubmit={saveFleetChanges} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-5">
            <h3 className="font-semibold sm:col-span-5">Editar frota {selectedFleet.numero}</h3>
            <Input value={fleetEditForm.numero} onChange={e => setFleetEditForm({ ...fleetEditForm, numero: e.target.value })} placeholder="Número" required />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={fleetEditForm.tipo} onChange={e => setFleetEditForm({ ...fleetEditForm, tipo: e.target.value })}>{tiposFrota.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
            <Input value={fleetEditForm.marca} onChange={e => setFleetEditForm({ ...fleetEditForm, marca: e.target.value })} placeholder="Marca" />
            <Input value={fleetEditForm.modelo} onChange={e => setFleetEditForm({ ...fleetEditForm, modelo: e.target.value })} placeholder="Modelo" />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={fleetEditForm.status} onChange={e => setFleetEditForm({ ...fleetEditForm, status: e.target.value })}><option value="ativa">Ativa</option><option value="inativa">Inativa</option><option value="manutencao">Em manutenção</option></select>
            <div className="flex gap-2 sm:col-span-5"><Button type="submit" disabled={saving}>Salvar alterações</Button><Button type="button" variant="outline" onClick={() => setEditingFleet(false)}>Cancelar</Button></div>
          </form>}
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Equipamentos relacionados a esta frota</div>
            {fleetInstallations.map(item => <button key={item.id} type="button" onClick={() => { setSelectedComponentId(item.componente_id); setTab("componentes"); }} className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/40">
              <span><strong>{item.componentes_frota?.numero_serie ?? "Componente"}</strong><span className="block text-sm text-muted-foreground">{item.componentes_frota?.tipo ? nomeTipoComponente(item.componentes_frota.tipo) : "Equipamento"} · {item.retirado_em ? "Retirado" : "Instalado atualmente"}</span></span>
              <span className="text-xs text-muted-foreground">{new Date(item.instalado_em).toLocaleDateString("pt-BR")}<span className="ml-2">›</span></span>
            </button>)}
            {!fleetInstallations.length && <p className="p-5 text-sm text-muted-foreground">Nenhum equipamento foi relacionado a esta frota ainda.</p>}
          </div>
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Histórico da frota</div>
            {fleetInstallations.map(item => <div key={item.id} className="space-y-1 border-b px-4 py-3 text-sm last:border-0">
              <p className="font-medium">{item.componentes_frota?.numero_serie ?? "Componente"} · {item.retirado_em ? "Instalação encerrada" : "Em uso"}</p>
              <p className="text-muted-foreground">Instalado em {new Date(item.instalado_em).toLocaleString("pt-BR")} por {item.instalado_por_nome || "Usuário autenticado"}</p>
              {item.retirado_em && <p className="text-muted-foreground">Retirado em {new Date(item.retirado_em).toLocaleString("pt-BR")} · {item.motivo_retirada || "Motivo não informado"}</p>}
            </div>)}
          </div>
        </section>}

        {tab === "componentes" && selectedComponent && <section className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedComponentId(null)}><ArrowLeft className="mr-2 size-4" />Voltar para componentes</Button>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes do componente</p>
            <h2 className="mt-1 text-2xl font-bold">{selectedComponent.numero_serie}</h2>
            <p className="text-sm text-muted-foreground">{nomeTipoComponente(selectedComponent.tipo)} · {[selectedComponent.fabricante, selectedComponent.modelo].filter(Boolean).join(" ") || "Fabricante/modelo não informados"}</p>
            <p className="mt-2 text-sm">Status: <strong>{nomeStatusComponente(selectedComponent.status)}</strong> · Unidade: {units.find(u => u.id === selectedComponent.unidade_id)?.nome ?? "—"}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => { setComponentEditForm({ tipo: selectedComponent.tipo, tipoPersonalizado: "", fabricante: selectedComponent.fabricante ?? "", modelo: selectedComponent.modelo ?? "", numero_serie: selectedComponent.numero_serie, status: selectedComponent.status ?? "disponivel" }); setEditingComponent(true); }}>Editar dados do componente</Button>
          </div>
          {editingComponent && <form onSubmit={saveComponentChanges} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
            <h3 className="font-semibold sm:col-span-4">Editar componente</h3>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={componentEditForm.tipo} onChange={e => setComponentEditForm({ ...componentEditForm, tipo: e.target.value })}>{opcoesTipoComponente.map(([v,l]) => <option key={v} value={v}>{l}</option>)}<option value="__novo_tipo__">+ Novo tipo de equipamento</option></select>
            {componentEditForm.tipo === "__novo_tipo__" && <Input value={componentEditForm.tipoPersonalizado} onChange={e => setComponentEditForm({ ...componentEditForm, tipoPersonalizado: e.target.value })} placeholder="Nome do novo tipo (ex.: Câmera)" required />}
            <div className="flex gap-2"><Input className="min-w-0 flex-1" value={componentEditForm.numero_serie} onChange={e => setComponentEditForm({ ...componentEditForm, numero_serie: e.target.value })} placeholder="Número de série" required /><Button type="button" variant="outline" size="icon" onClick={() => setSerialScannerTarget("edit")} aria-label="Ler número de série pela câmera"><Camera className="size-4" /></Button></div>
            <Input value={componentEditForm.fabricante} onChange={e => setComponentEditForm({ ...componentEditForm, fabricante: e.target.value })} placeholder="Fabricante" />
            <Input value={componentEditForm.modelo} onChange={e => setComponentEditForm({ ...componentEditForm, modelo: e.target.value })} placeholder="Modelo" />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={componentEditForm.status} onChange={e => setComponentEditForm({ ...componentEditForm, status: e.target.value })}><option value="disponivel">Disponível</option><option value="backup">Backup</option><option value="manutencao">Em manutenção</option><option value="descartado">Descartado</option></select>
            <div className="flex gap-2 sm:col-span-4"><Button type="submit" disabled={saving}>Salvar alterações</Button><Button type="button" variant="outline" onClick={() => setEditingComponent(false)}>Cancelar</Button></div>
          </form>}
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
              <p className="text-muted-foreground">Instalado em {new Date(item.instalado_em).toLocaleString("pt-BR")} por {item.instalado_por_nome || "Usuário autenticado"}</p>
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

          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Importar ou exportar Excel</h3><p className="text-sm text-muted-foreground">Importe frotas com ou sem dispositivos. O número de série é necessário para cadastrar e vincular o dispositivo à frota.</p></div><Button type="button" variant="outline" onClick={() => void exportFleetsExcel()} disabled={!fleets.length && !components.length}><Boxes className="mr-2 size-4" />Exportar Excel</Button></div>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={importUnitId} onChange={e => setImportUnitId(e.target.value)}><option value="">Unidade da importação</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}</select>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={e => { const file = e.target.files?.[0]; if (file) void readFleetImportFile(file); e.currentTarget.value = ""; }} />
            </div>
            {importRows.length > 0 && <div className="space-y-2 rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-medium">Prévia: {importRows.length} linha(s), {new Set(importRows.map(r => r.numero)).size} frota(s), {importRows.filter(r => r.numero_serie).length} dispositivo(s).</p>
              <p className="text-xs text-muted-foreground">Colunas: Número frota, Tipo frota, Marca frota, Modelo frota, Tipo dispositivo, Fabricante, Modelo dispositivo, Número de série e Localização. Linhas sem série criam somente a frota.</p>
              <div className="max-h-36 overflow-auto rounded-lg border bg-background text-xs">{importRows.slice(0,8).map((row,i) => <div key={i} className="grid grid-cols-3 gap-2 border-b px-2 py-2 last:border-0"><strong>{row.numero}</strong><span>{row.tipo}</span><span>{row.numero_serie || "Sem dispositivo"}</span></div>)}{importRows.length > 8 && <p className="p-2 text-muted-foreground">Mais {importRows.length-8} linha(s)...</p>}</div>
              <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void importFleetsExcel()} disabled={importing || !importUnitId}>{importing ? "Importando..." : "Confirmar importação"}</Button><Button type="button" variant="outline" onClick={() => setImportRows([])} disabled={importing}>Cancelar</Button></div>
            </div>}
          </div>
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
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={componentForm.tipo} onChange={e => setComponentForm({ ...componentForm, tipo: e.target.value })}>{opcoesTipoComponente.map(([value,label]) => <option key={value} value={value}>{label}</option>)}<option value="__novo_tipo__">+ Novo tipo de equipamento</option></select>
            {componentForm.tipo === "__novo_tipo__" && <Input value={componentForm.tipoPersonalizado} onChange={e => setComponentForm({ ...componentForm, tipoPersonalizado: e.target.value })} placeholder="Nome do novo tipo (ex.: Câmera)" required />}
            <Input placeholder="Fabricante" value={componentForm.fabricante} onChange={e => setComponentForm({ ...componentForm, fabricante: e.target.value })} />
            <Input placeholder="Modelo" value={componentForm.modelo} onChange={e => setComponentForm({ ...componentForm, modelo: e.target.value })} />
            <div className="flex gap-2"><Input className="min-w-0 flex-1" placeholder="Número de série" value={componentForm.numero_serie} onChange={e => setComponentForm({ ...componentForm, numero_serie: e.target.value })} required /><Button type="button" variant="outline" size="icon" onClick={() => setSerialScannerTarget("new")} aria-label="Ler número de série pela câmera"><Camera className="size-4" /></Button></div>
            <Button type="submit" disabled={saving || !units.length} className="sm:col-span-6"><Plus className="mr-2 size-4" />Cadastrar componente</Button>
          </form>
          {canViewComponentTotals && <div className="overflow-hidden rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3">
              <h3 className="font-semibold">Totais por componente</h3>
              <p className="text-xs text-muted-foreground">Quantidade cadastrada por tipo e situação atual</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-3">Componente</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">Instalados</th><th className="px-3 py-3 text-right">Disponíveis</th><th className="px-3 py-3 text-right">Backup</th><th className="px-3 py-3 text-right">Manutenção</th><th className="px-3 py-3 text-right">Descartados</th></tr>
                </thead>
                <tbody>
                  {opcoesTipoComponente.map(([tipo, label]) => {
                    const items = components.filter(item => item.tipo === tipo);
                    if (!items.length) return null;
                    const installedIds = new Set(activeInstallations.map(item => item.componente_id));
                    return <tr key={tipo} className="border-t">
                      <td className="px-4 py-3 font-medium">{label}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{items.length}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{items.filter(item => installedIds.has(item.id)).length}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{items.filter(item => item.status === "disponivel").length}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{items.filter(item => item.status === "backup").length}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{items.filter(item => item.status === "manutencao").length}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{items.filter(item => item.status === "descartado").length}</td>
                    </tr>;
                  })}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-3">Total geral</td>
                    <td className="px-3 py-3 text-right tabular-nums">{components.length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{activeInstallations.length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{components.filter(item => item.status === "disponivel").length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{components.filter(item => item.status === "backup").length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{components.filter(item => item.status === "manutencao").length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{components.filter(item => item.status === "descartado").length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>}
          <div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input placeholder="Buscar por número de série, fabricante ou modelo" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="overflow-hidden rounded-2xl border"><div className="grid grid-cols-4 gap-2 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground"><span>Tipo</span><span>Nº de série</span><span>Fabricante / modelo</span><span>Status</span></div>
            {filteredComponents.map(item => <button key={item.id} type="button" onClick={() => setSelectedComponentId(item.id)} className="grid w-full grid-cols-4 gap-2 border-t px-4 py-3 text-left text-sm hover:bg-muted/40"><span>{nomeTipoComponente(item.tipo)}</span><strong>{item.numero_serie}</strong><span>{[item.fabricante,item.modelo].filter(Boolean).join(" ") || "—"}</span><span>{nomeStatusComponente(item.status)} <span className="text-primary">›</span></span></button>)}
            {!filteredComponents.length && <p className="p-6 text-center text-sm text-muted-foreground">{loading ? "Carregando..." : "Nenhum componente cadastrado."}</p>}
          </div>
        </section>}


        {tab === "estoque" && <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Disponíveis", components.filter(x => x.status === "disponivel").length],
              ["Backup", components.filter(x => x.status === "backup").length],
              ["Manutenção", components.filter(x => x.status === "manutencao").length],
              ["Instalados", components.filter(x => x.status === "instalado").length],
            ].map(([label, count]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums">{count}</p></div>)}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">Dispositivos guardados</h2>
            <p className="mb-3 text-sm text-muted-foreground">Consulte o estoque por número de série e informe a prateleira ou local físico. Equipamentos instalados não aparecem nesta lista.</p>
            <div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input placeholder="Buscar série, tipo, fabricante, modelo ou prateleira" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {components.filter(item => ["disponivel","backup","manutencao"].includes(item.status))
              .filter(item => [item.numero_serie,item.tipo,item.fabricante ?? "",item.modelo ?? "",item.localizacao_estoque ?? ""].join(" ").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
              .map(item => <article key={item.id} className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold">{item.numero_serie}</p><p className="text-sm text-muted-foreground">{nomeTipoComponente(item.tipo)} · {[item.fabricante,item.modelo].filter(Boolean).join(" ") || "Fabricante/modelo não informados"}</p></div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">{nomeStatusComponente(item.status)}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input value={locationDrafts[item.id] ?? item.localizacao_estoque ?? "Estoque geral"} onChange={e => setLocationDrafts(current => ({ ...current, [item.id]: e.target.value }))} placeholder="Ex.: Prateleira 1, Caixa A..." />
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void saveStockLocation(item)}>Salvar local</Button>
                </div>
              </article>)}
            {!components.some(item => ["disponivel","backup","manutencao"].includes(item.status)) && <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum dispositivo guardado no momento.</p>}
          </div>
          <div className="rounded-2xl border">
            <div className="border-b bg-muted/50 px-4 py-3 font-semibold">Movimentações recentes do estoque</div>
            {stockMovements.slice(0,30).map(move => {
              const component = components.find(x => x.id === move.componente_id);
              return <div key={move.id} className="border-t px-4 py-3 text-sm">
                <p className="font-medium">{component?.numero_serie ?? "Dispositivo"} · {({entrada:"Entrada",instalacao:"Instalação",retirada:"Retirada",transferencia:"Transferência",manutencao:"Manutenção",descarte:"Descarte"} as Record<string,string>)[move.tipo] ?? move.tipo}</p>
                <p className="text-muted-foreground">{move.localizacao_origem ?? "—"} → {move.localizacao_destino ?? "Instalado em frota"} · {new Date(move.ocorrido_em).toLocaleString("pt-BR")}</p>
                {move.observacoes && <p className="text-xs text-muted-foreground">{move.observacoes}</p>}
              </div>;
            })}
            {!stockMovements.length && <p className="p-5 text-sm text-muted-foreground">As movimentações aparecerão aqui automaticamente.</p>}
          </div>
        </section>}

        {tab === "instalacoes" && <section className="space-y-4">
          <form onSubmit={installComponent} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
            <h2 className="font-semibold sm:col-span-3">Instalar componente em uma frota</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={installForm.frota_id} onChange={e => setInstallForm({ ...installForm, frota_id: e.target.value, componente_id: "" })} required>
              <option value="">Selecione a frota</option>{fleets.filter(f => f.status === "ativa").map(f => <option key={f.id} value={f.id}>{f.numero} — {tiposFrota.find(x => x[0] === f.tipo)?.[1]}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={installForm.componente_id} onChange={e => setInstallForm({ ...installForm, componente_id: e.target.value })} required>
              <option value="">Componente disponível</option>{components.filter(c => c.status === "disponivel" && (!installForm.frota_id || (c.unidade_id === fleets.find(f => f.id === installForm.frota_id)?.unidade_id && !activeInstallations.some(item => item.frota_id === installForm.frota_id && item.componentes_frota?.tipo === c.tipo)))).map(c => <option key={c.id} value={c.id}>{c.numero_serie} — {nomeTipoComponente(c.tipo)}</option>)}
            </select>
            <Button type="submit" disabled={saving || !installForm.frota_id || !installForm.componente_id}><Wrench className="mr-2 size-4" />Registrar instalação</Button>
          </form>
          <form onSubmit={removeComponent} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
            <h2 className="font-semibold sm:col-span-4">Retirar componente instalado</h2>
            <select className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2" value={removal.id} onChange={e => setRemoval({ ...removal, id: e.target.value })} required>
              <option value="">Instalação ativa</option>{activeInstallations.map(item => <option key={item.id} value={item.id}>Frota {item.frotas?.numero ?? "—"} · Série {item.componentes_frota?.numero_serie ?? "—"}</option>)}
            </select>
            <Input placeholder="Motivo da retirada" value={removal.motivo} onChange={e => setRemoval({ ...removal, motivo: e.target.value })} required />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={removal.status} onChange={e => setRemoval({ ...removal, status: e.target.value })}><option value="disponivel">Voltar para disponível</option><option value="backup">Reservar como backup</option><option value="manutencao">Enviar para manutenção</option><option value="descartado">Marcar como descartado</option></select>
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
            <p className="text-muted-foreground">Instalado: {new Date(item.instalado_em).toLocaleString("pt-BR")} · Responsável: {item.instalado_por_nome || "Usuário autenticado"}</p>
            {item.retirado_em && <p className="text-muted-foreground">Retirado: {new Date(item.retirado_em).toLocaleString("pt-BR")} · Responsável: {item.retirado_por_nome || "Usuário autenticado"} · Motivo: {item.motivo_retirada}</p>}
          </article>)}
          {!installations.length && <p className="p-6 text-center text-sm text-muted-foreground">O histórico aparecerá aqui após a primeira movimentação.</p>}
        </section>}
      </main>
      {serialScannerTarget && <SerialCameraScanner
        onClose={() => setSerialScannerTarget(null)}
        onCapture={value => {
          if (serialScannerTarget === "new") setComponentForm(current => ({ ...current, numero_serie: value }));
          else setComponentEditForm(current => ({ ...current, numero_serie: value }));
          setSerialScannerTarget(null);
          toast.success("Número de série capturado pela câmera.");
        }}
      />}

    </div>
  );
}