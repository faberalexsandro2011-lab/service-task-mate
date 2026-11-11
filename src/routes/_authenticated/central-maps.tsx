import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createFileRoute } from "@tanstack/react-router";
import {
  FileArchive, FileImage, FileText, Map, MapPin, Navigation, RefreshCw,
  Upload, Wifi, WifiOff, Download, History, CheckCircle2, AlertCircle, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Position = { latitude: number; longitude: number; accuracy: number; capturedAt: string };
type MapFile = {
  id: string;
  map_key: string;
  version: number;
  unit_name: string;
  property_name: string;
  display_name: string;
  original_file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string | null;
  file_extension: string;
  is_current: boolean;
  created_at: string;
};

const DB_NAME = "central-maps-local";
const STORE_NAME = "captured-points";
const BUCKET = "central-maps";
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "kmz", "kml", "tif", "tiff", "zip", "geojson", "json"];

function openLocalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
  });
}

async function saveCapturedPoint(position: Position) {
  const db = await openLocalDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add({ ...position, label: "Minha localização" });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível salvar o ponto."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Gravação local cancelada."));
  });
  db.close();
}

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(extension: string) {
  if (["tif", "tiff"].includes(extension)) return FileImage;
  if (["kmz", "kml", "zip"].includes(extension)) return FileArchive;
  return FileText;
}

export const Route = createFileRoute("/_authenticated/central-maps")({
  head: () => ({
    meta: [
      { title: "Central Maps — Central OS" },
      { name: "description", content: "Mapas operacionais e localização de campo." },
    ],
  }),
  component: CentralMapsPage,
});

function CentralMapsPage() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const [maps, setMaps] = useState<MapFile[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [unitName, setUnitName] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedMapKey, setSelectedMapKey] = useState("new");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewerMap, setViewerMap] = useState<MapFile | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedMap = useMemo(
    () => maps.find((item) => item.map_key === selectedMapKey && item.is_current) ?? null,
    [maps, selectedMapKey],
  );

  const loadMaps = useCallback(async () => {
    setLoadingMaps(true);
    const { data, error } = await supabase
      .from("central_maps_files")
      .select("id,map_key,version,unit_name,property_name,display_name,original_file_name,storage_path,file_size,mime_type,file_extension,is_current,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setUploadError("Não foi possível carregar os mapas. Verifique sua conexão e as permissões.");
    } else {
      setMaps((data ?? []) as MapFile[]);
    }
    setLoadingMaps(false);
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const checkManager = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId || !active) return;
      const [manager, centralManager] = await Promise.all([
        supabase.rpc("has_role", { _role: "gestor", _user_id: userId }),
        supabase.rpc("has_role", { _role: "gestor_central", _user_id: userId }),
      ]);
      if (active) setIsManager(manager.data === true || centralManager.data === true);
    };
    void checkManager();
    void loadMaps();
    return () => { active = false; };
  }, [loadMaps]);

  useEffect(() => {
    if (selectedMap) {
      setUnitName(selectedMap.unit_name);
      setPropertyName(selectedMap.property_name);
      setDisplayName(selectedMap.display_name);
    } else if (selectedMapKey === "new") {
      setUnitName("");
      setPropertyName("");
      setDisplayName("");
    }
  }, [selectedMap, selectedMapKey]);

  const captureLocation = () => {
    setGpsError("");
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo não disponibiliza GPS pelo navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => setPosition({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        capturedAt: new Date(timestamp).toISOString(),
      }),
      (error) => {
        const messages: Record<number, string> = {
          1: "Permita o acesso à localização nas configurações do navegador.",
          2: "O GPS não conseguiu determinar sua posição. Tente em uma área aberta.",
          3: "O tempo para obter a localização terminou. Tente novamente.",
        };
        setGpsError(messages[error.code] ?? "Não foi possível obter a localização.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const savePoint = async () => {
    if (!position) return;
    setSaving(true);
    setGpsError("");
    try {
      await saveCapturedPoint(position);
      setSavedCount((count) => count + 1);
    } catch {
      setGpsError("Não foi possível salvar no armazenamento local deste aparelho.");
    } finally {
      setSaving(false);
    }
  };

  const uploadMap = async () => {
    setUploadError("");
    setUploadMessage("");
    if (!isManager) {
      setUploadError("Somente gestores podem importar ou atualizar mapas.");
      return;
    }
    if (!unitName.trim() || !propertyName.trim() || !displayName.trim() || !selectedFile) {
      setUploadError("Informe unidade, propriedade, nome do mapa e selecione o arquivo.");
      return;
    }
    const extension = extensionOf(selectedFile.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setUploadError("Formato não aceito. Use PDF, KMZ, KML, GeoTIFF, ZIP ou GeoJSON.");
      return;
    }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_SIZE) {
      setUploadError("O arquivo precisa ter conteúdo e não pode ultrapassar 200 MB.");
      return;
    }

    setUploading(true);
    let uploadedPath = "";
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente no Central OS.");
      const current = selectedMap;
      const mapKey = current?.map_key ?? crypto.randomUUID();
      const nextVersion = current ? current.version + 1 : 1;
      const safeFileName = selectedFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
      uploadedPath = `${mapKey}/v${nextVersion}/${Date.now()}-${safeFileName || "mapa"}`;

      const { error: storageError } = await supabase.storage.from(BUCKET).upload(uploadedPath, selectedFile, {
        contentType: selectedFile.type || "application/octet-stream",
        upsert: false,
      });
      if (storageError) throw storageError;

      const { data: newRecord, error: insertError } = await supabase
        .from("central_maps_files")
        .insert({
          map_key: mapKey,
          version: nextVersion,
          unit_name: unitName.trim(),
          property_name: propertyName.trim(),
          display_name: displayName.trim(),
          original_file_name: selectedFile.name,
          storage_path: uploadedPath,
          file_size: selectedFile.size,
          mime_type: selectedFile.type || null,
          file_extension: extension,
          uploaded_by: userData.user.id,
          is_current: true,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      if (current) {
        const { error: archiveError } = await supabase
          .from("central_maps_files")
          .update({ is_current: false })
          .eq("id", current.id);
        if (archiveError) {
          setUploadError("A nova versão foi enviada, mas não foi possível arquivar a anterior. Atualize a lista para conferir.");
        }
      }
      setSelectedFile(null);
      const fileInput = document.getElementById("central-map-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setSelectedMapKey("new");
      setUploadMessage(`Mapa importado com sucesso. Versão ${nextVersion} registrada.`);
      await loadMaps();
      if (!newRecord?.id) throw new Error("O arquivo foi enviado, mas não foi possível confirmar o registro.");
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      setUploadError(error instanceof Error ? error.message : "Falha ao importar o mapa. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  const downloadMap = async (mapFile: MapFile) => {
    setUploadError("");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(mapFile.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      setUploadError("Não foi possível gerar o link de download. Verifique sua conexão.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!viewerMap) {
      setPdfDocument(null);
      setPdfPages(0);
      setPdfPage(1);
      setPdfError("");
      return;
    }
    if (viewerMap.file_extension !== "pdf") {
      setPdfError("A visualização inicial aceita PDF. Os demais formatos serão adicionados nas próximas etapas.");
      return;
    }
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    setPdfLoading(true);
    setPdfError("");
    setPdfDocument(null);
    const openPdf = async () => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(viewerMap.storage_path, 60 * 10);
        if (error || !data?.signedUrl) throw new Error("Não foi possível abrir o arquivo armazenado.");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        loadingTask = pdfjsLib.getDocument({ url: data.signedUrl });
        const document = await loadingTask.promise;
        if (cancelled) { await document.destroy(); return; }
        setPdfDocument(document);
        setPdfPages(document.numPages);
      } catch (error) {
        if (!cancelled) setPdfError(error instanceof Error ? error.message : "Falha ao abrir o PDF.");
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };
    void openPdf();
    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [viewerMap]);

  useEffect(() => {
    if (!pdfDocument || !pdfCanvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    const drawPage = async () => {
      try {
        const page = await pdfDocument.getPage(pdfPage);
        if (cancelled || !pdfCanvasRef.current) return;
        const viewport = page.getViewport({ scale: pdfZoom });
        const canvas = pdfCanvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await (renderTask as any).promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setPdfError("Não foi possível renderizar esta página do PDF.");
        }
      }
    };
    void drawPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pdfPage, pdfZoom]);

  const currentMaps = maps.filter((item) => item.is_current);
  const historicalMaps = maps.filter((item) => !item.is_current);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-900 p-3 text-white"><Map className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Central Maps</h1>
              <p className="text-sm text-muted-foreground">Mapas e localização para operações de campo</p>
            </div>
          </div>
          <Badge variant={online ? "default" : "secondary"} className="gap-1.5">
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "Conectado" : "Modo offline"}
          </Badge>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-emerald-700" /> Biblioteca de mapas</CardTitle>
            <CardDescription>
              Importe mapas georreferenciados e publique novas versões sem perder o arquivo anterior. Os arquivos ficam guardados no ambiente de teste.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isManager ? (
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="central-map-version">Ação</Label>
                  <Select value={selectedMapKey} onValueChange={setSelectedMapKey}>
                    <SelectTrigger id="central-map-version"><SelectValue placeholder="Escolha um mapa para atualizar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Importar um novo mapa</SelectItem>
                      {currentMaps.map((item) => (
                        <SelectItem key={item.map_key} value={item.map_key}>
                          Atualizar: {item.unit_name} · {item.property_name} · {item.display_name} (v{item.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="central-map-unit">Unidade</Label>
                  <Input id="central-map-unit" value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Ex.: Vale do Paraná" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="central-map-property">Propriedade / fazenda</Label>
                  <Input id="central-map-property" value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Nome da propriedade" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="central-map-name">Nome do mapa</Label>
                  <Input id="central-map-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Mapa geral de talhões" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="central-map-file">Arquivo georreferenciado</Label>
                  <Input
                    id="central-map-file"
                    type="file"
                    accept=".pdf,.kmz,.kml,.tif,.tiff,.zip,.geojson,.json"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    className="h-auto min-h-11 py-2"
                  />
                  <p className="text-xs text-muted-foreground">PDF, KMZ, KML, GeoTIFF, Shapefile em ZIP ou GeoJSON · máximo 200 MB por arquivo.</p>
                  {selectedFile && <p className="text-sm font-medium">{selectedFile.name} · {formatBytes(selectedFile.size)}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <Button onClick={uploadMap} disabled={uploading || !online} className="gap-2">
                    <Upload className="h-4 w-4" /> {uploading ? "Enviando mapa..." : selectedMap ? "Publicar nova versão" : "Importar mapa"}
                  </Button>
                  {!online && <span className="text-xs text-muted-foreground">Conecte-se à internet para enviar ou atualizar mapas.</span>}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                A biblioteca está disponível para consulta. A importação e atualização de mapas são exclusivas dos gestores.
              </div>
            )}
            {uploadError && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{uploadError}</p>}
            {uploadMessage && <p role="status" className="flex items-start gap-2 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{uploadMessage}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mapas disponíveis</CardTitle>
            <CardDescription>Versões atuais organizadas por unidade e propriedade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingMaps ? <p className="text-sm text-muted-foreground">Carregando mapas...</p>
              : currentMaps.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                  <Map className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Nenhum mapa importado ainda</p>
                  <p className="mt-1 text-sm text-muted-foreground">Quando o primeiro mapa for enviado, ele aparecerá nesta biblioteca.</p>
                </div>
              ) : currentMaps.map((item) => {
                const Icon = fileIcon(item.file_extension);
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold">{item.display_name}</p>
                        <p className="text-sm text-muted-foreground">{item.unit_name} · {item.property_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.original_file_name} · {formatBytes(Number(item.file_size))}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Versão {item.version}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setViewerMap(item)} className="gap-2"><Map className="h-4 w-4" /> Visualizar</Button><Button size="sm" variant="outline" onClick={() => void downloadMap(item)} className="gap-2"><Download className="h-4 w-4" /> Baixar</Button>
                    </div>
                  </div>
                );
              })}
            {historicalMaps.length > 0 && (
              <details className="rounded-lg border p-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><History className="h-4 w-4" /> Histórico de versões ({historicalMaps.length})</summary>
                <div className="mt-3 space-y-2">
                  {historicalMaps.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
                      <div><p>{item.display_name} · v{item.version}</p><p className="text-xs text-muted-foreground">{item.unit_name} · {item.property_name} · {new Date(item.created_at).toLocaleDateString("pt-BR")}</p></div>
                      <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setViewerMap(item)} className="gap-2"><Map className="h-3.5 w-3.5" /> Ver</Button><Button size="sm" variant="ghost" onClick={() => void downloadMap(item)} className="gap-2"><Download className="h-3.5 w-3.5" /> Baixar</Button></div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <Button variant="ghost" size="sm" onClick={() => void loadMaps()} disabled={loadingMaps} className="gap-2"><RefreshCw className="h-4 w-4" /> Atualizar lista</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-emerald-700" /> Localização do aparelho</CardTitle>
            <CardDescription>A captura de coordenadas usa o GPS do dispositivo e pode funcionar sem internet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={captureLocation} className="gap-2"><RefreshCw className="h-4 w-4" /> Capturar minha localização</Button>
              <Button variant="outline" onClick={savePoint} disabled={!position || saving} className="gap-2"><MapPin className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar ponto neste aparelho"}</Button>
            </div>
            {position ? (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Latitude</p><p className="font-mono text-sm font-semibold">{position.latitude.toFixed(6)}</p></div>
                <div><p className="text-xs text-muted-foreground">Longitude</p><p className="font-mono text-sm font-semibold">{position.longitude.toFixed(6)}</p></div>
                <div><p className="text-xs text-muted-foreground">Precisão informada pelo GPS</p><p className="text-sm font-semibold">± {Math.round(position.accuracy)} metros</p></div>
                <p className="text-xs text-muted-foreground sm:col-span-3">Capturado em {new Date(position.capturedAt).toLocaleString("pt-BR")}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Nenhuma localização capturada</p>
                <p className="mt-1 text-xs text-muted-foreground">Toque em “Capturar minha localização” para testar o GPS.</p>
              </div>
            )}
            {gpsError && <p role="alert" className="text-sm text-destructive">{gpsError}</p>}
            <p className="text-xs text-muted-foreground">Pontos salvos nesta etapa ficam somente no armazenamento local deste navegador.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Visualização cartográfica</CardTitle><CardDescription>Próxima etapa: exibir os mapas georreferenciados sobre a posição GPS e preparar o cache offline por propriedade.</CardDescription></CardHeader>
          <CardContent><div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center"><Map className="mb-3 h-10 w-10 text-emerald-800" /><p className="font-semibold">Biblioteca de mapas pronta para receber arquivos</p><p className="mt-2 max-w-md text-sm text-muted-foreground">Nesta versão já é possível importar, atualizar, baixar e consultar versões anteriores. A visualização geográfica e a navegação offline serão implementadas após validarmos o primeiro arquivo real.</p></div></CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">Pontos capturados nesta sessão: {savedCount}. Arquivos da biblioteca ficam no armazenamento privado do ambiente de teste.</p>
      </div>
    </div>
  );
}
