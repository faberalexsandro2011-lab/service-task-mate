import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PublicFleet = {
  frota: {
    numero: string;
    tipo: string;
    marca: string | null;
    modelo: string | null;
    identificacao: string | null;
    status: string;
    unidade: string;
  };
  dispositivos: Array<{
    tipo: string;
    fabricante: string | null;
    modelo: string | null;
    numero_serie: string;
    observacoes: string | null;
  }>;
};

export const Route = createFileRoute("/frota-publica/$token")({
  head: () => ({
    meta: [
      { title: "Consulta da frota — Central Frota" },
      { name: "description", content: "Identificação da frota e dos dispositivos atualmente instalados." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicFleetPage,
});

const labels: Record<string, string> = {
  trator: "Trator",
  colheitadeira: "Colheitadeira",
  caminhao: "Caminhão",
  veiculo: "Veículo",
  monitor: "Monitor",
  receptor: "Receptor GPS",
  bordo_solinftec: "Bordo Solinftec",
  tela_solinftec: "Tela Solinftec",
  rastreador: "Rastreador",
  radio: "Rádio",
  outro: "Outro",
};

function PublicFleetPage() {
  const { token } = Route.useParams();
  const [record, setRecord] = useState<PublicFleet | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("central_frota_consulta_publica", {
        p_token: token,
      });
      if (!active) return;
      if (error || !data?.frota) {
        setFailed(true);
        setRecord(null);
      } else {
        setRecord(data as PublicFleet);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Central OS · Central Frota</p>
          <h1 className="mt-2 text-2xl font-bold">Consulta pública da frota</h1>
          <p className="mt-1 text-sm text-slate-500">Informações cadastrais e equipamentos atualmente instalados.</p>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-10 text-sm text-slate-600 shadow-sm">
            <LoaderCircle className="size-5 animate-spin" /> Carregando informações...
          </div>
        )}

        {!loading && failed && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto size-9 text-amber-600" />
            <h2 className="mt-3 text-lg font-semibold">Consulta indisponível</h2>
            <p className="mt-1 text-sm text-slate-600">Este QR Code não foi encontrado ou não está mais disponível.</p>
          </div>
        )}

        {!loading && record && (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Identificação da frota</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{record.frota.status === "ativa" ? "Ativa" : record.frota.status === "manutencao" ? "Em manutenção" : "Inativa"}</span>
              </div>
              <p className="mt-3 text-3xl font-bold">Frota {record.frota.numero}</p>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Tipo</dt><dd className="font-medium">{labels[record.frota.tipo] ?? record.frota.tipo}</dd></div>
                <div><dt className="text-slate-500">Unidade</dt><dd className="font-medium">{record.frota.unidade}</dd></div>
                <div><dt className="text-slate-500">Marca</dt><dd className="font-medium">{record.frota.marca || "Não informada"}</dd></div>
                <div><dt className="text-slate-500">Modelo</dt><dd className="font-medium">{record.frota.modelo || "Não informado"}</dd></div>
                {record.frota.identificacao && <div className="sm:col-span-2"><dt className="text-slate-500">Identificação</dt><dd className="font-medium">{record.frota.identificacao}</dd></div>}
              </dl>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Dispositivos instalados</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{record.dispositivos.length} item(ns)</span>
              </div>
              {record.dispositivos.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">
                  Nenhum dispositivo instalado no momento.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {record.dispositivos.map((device, index) => (
                    <article key={device.numero_serie + index} className="rounded-xl border p-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                        <div className="min-w-0">
                          <h3 className="font-semibold">{labels[device.tipo] ?? device.tipo}</h3>
                          <p className="text-sm text-slate-600">{[device.fabricante, device.modelo].filter(Boolean).join(" · ") || "Marca/modelo não informados"}</p>
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div><dt className="text-slate-500">Número de série</dt><dd className="break-all font-mono font-semibold">{device.numero_serie}</dd></div>
                        {device.observacoes && <div><dt className="text-slate-500">Observações</dt><dd>{device.observacoes}</dd></div>}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <p className="text-center text-xs text-slate-500">Consulta somente para leitura. Os dados exibidos refletem o cadastro atual do Central Frota.</p>
          </>
        )}
      </div>
    </main>
  );
}
