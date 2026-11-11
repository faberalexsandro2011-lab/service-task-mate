import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Map, MapPin, Navigation, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Position = { latitude: number; longitude: number; accuracy: number; capturedAt: string };

const DB_NAME = "central-maps-local";
const STORE_NAME = "captured-points";

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

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const captureLocation = () => {
    setGpsError("");
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo não disponibiliza GPS pelo navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        setPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          capturedAt: new Date(timestamp).toISOString(),
        });
      },
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-900 p-3 text-white">
              <Map className="h-6 w-6" />
            </div>
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
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-emerald-700" />
              Localização do aparelho
            </CardTitle>
            <CardDescription>
              A captura de coordenadas usa o GPS do dispositivo e pode funcionar sem internet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={captureLocation} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Capturar minha localização
              </Button>
              <Button variant="outline" onClick={savePoint} disabled={!position || saving} className="gap-2">
                <MapPin className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar ponto neste aparelho"}
              </Button>
            </div>

            {position ? (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Latitude</p>
                  <p className="font-mono text-sm font-semibold">{position.latitude.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Longitude</p>
                  <p className="font-mono text-sm font-semibold">{position.longitude.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Precisão informada pelo GPS</p>
                  <p className="text-sm font-semibold">± {Math.round(position.accuracy)} metros</p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Capturado em {new Date(position.capturedAt).toLocaleString("pt-BR")}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Nenhuma localização capturada</p>
                <p className="mt-1 text-xs text-muted-foreground">Toque em “Capturar minha localização” para testar o GPS.</p>
              </div>
            )}

            {gpsError && <p role="alert" className="text-sm text-destructive">{gpsError}</p>}
            <p className="text-xs text-muted-foreground">
              Pontos salvos nesta etapa ficam somente no armazenamento local deste navegador. A sincronização com o Central OS será implementada em uma etapa posterior.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mapa operacional</CardTitle>
            <CardDescription>Estrutura inicial preparada para receber mapas georreferenciados e camadas das propriedades.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <Map className="mb-3 h-10 w-10 text-emerald-800" />
              <p className="font-semibold">Base cartográfica será ativada na próxima etapa</p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Nesta fundação, o Central Maps já testa o GPS e o armazenamento local. A visualização cartográfica, os mapas baixáveis e as camadas offline serão adicionados após a definição da fonte e do formato dos mapas.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">GPS do dispositivo</Badge>
              <Badge variant="outline">Armazenamento local</Badge>
              <Badge variant="outline">Preparado para offline</Badge>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">Pontos capturados nesta sessão: {savedCount}. Os registros permanecem no aparelho mesmo sem conexão.</p>
      </div>
    </div>
  );
}
