import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Clock3, ClipboardList, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel-teste")({
  component: PainelTeste,
});

type Unidade = {
  nome: string;
  abertas: number;
  acima48h: number;
  acima7d: number;
  maisAntiga: string;
  faixas: [number, number, number, number, number];
};

const unidades: Unidade[] = [
  { nome: "Jussara", abertas: 57, acima48h: 40, acima7d: 29, maisAntiga: "49d 2h 10min", faixas: [6, 6, 14, 2, 29] },
  { nome: "Nova Londrina", abertas: 20, acima48h: 12, acima7d: 6, maisAntiga: "12d 20h 15min", faixas: [0, 12, 1, 1, 6] },
  { nome: "Vale do Paraná", abertas: 45, acima48h: 37, acima7d: 17, maisAntiga: "31d 16h 4min", faixas: [5, 4, 3, 16, 17] },
];
const faixas = [
  { nome: "Bom", cor: "bg-lime-400" },
  { nome: "Médio", cor: "bg-yellow-300" },
  { nome: "Atenção", cor: "bg-orange-400" },
  { nome: "Crítico", cor: "bg-red-400" },
  { nome: "Alerta", cor: "bg-pink-400" },
];

function PainelTeste() {
  const [filtro, setFiltro] = useState("Todas");
  const visiveis = useMemo(() => filtro === "Todas" ? unidades : unidades.filter((u) => u.nome === filtro), [filtro]);
  const total = (campo: "abertas" | "acima48h" | "acima7d") => visiveis.reduce((s, u) => s + u[campo], 0);
  const contagens = faixas.map((_, i) => visiveis.reduce((s, u) => s + u.faixas[i], 0));
  const comJustificativa = 0;

  return (
    <div className="min-h-screen bg-[#002b25] text-slate-50">
      <header className="border-b border-emerald-800 bg-[#00251f] px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><div className="text-xl font-extrabold">Central OS</div><div className="text-xs text-emerald-200">PAINEL CONSOLIDADO · AMBIENTE DE TESTE</div></div>
          <label className="flex items-center gap-3 text-sm text-emerald-100">Unidade
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white">
              <option>Todas</option>{unidades.map((u) => <option key={u.nome}>{u.nome}</option>)}
            </select>
          </label>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="mb-6 flex items-start gap-3"><Building2 className="mt-1 text-lime-300" /><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Visão geral</p><h1 className="text-2xl font-extrabold sm:text-3xl">Painel Consolidado</h1><p className="mt-1 text-sm text-emerald-100/70">Acompanhamento de ordens de serviço por unidade.</p></div></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<ClipboardList />} label="OS abertas" value={total("abertas")} accent="text-lime-300" />
          <Metric icon={<Clock3 />} label="Abertas há mais de 48h" value={total("acima48h")} accent="text-red-300" />
          <Metric icon={<ShieldAlert />} label="Alerta · mais de 7 dias" value={total("acima7d")} accent="text-pink-300" />
          <Metric icon={<AlertTriangle />} label="OS mais antiga" value={visiveis.map((u) => u.maisAntiga).sort((a,b) => parseInt(b)-parseInt(a))[0] ?? "—"} accent="text-sky-200" compact />
        </div>
        <section className="mt-4 rounded-2xl border border-emerald-800 bg-[#003b32] p-4 sm:p-5">
          <h2 className="font-bold">Classificação de criticidade</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-emerald-950">{contagens.map((n,i) => <div key={faixas[i].nome} title={faixas[i].nome + ": " + n} className={faixas[i].cor} style={{ width: (n / Math.max(total("abertas"),1) * 100) + "%" }} />)}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-emerald-100/80">{faixas.map((f,i) => <span key={f.nome} className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${f.cor}`} />{f.nome}: {contagens[i]}</span>)}</div>
        </section>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-800 bg-[#003b32] p-5"><div className="text-3xl font-extrabold text-lime-300">{comJustificativa}</div><div className="text-xs font-bold uppercase tracking-wide text-emerald-100/70">Com justificativa</div></div>
          <div className="rounded-2xl border border-emerald-800 bg-[#003b32] p-5"><div className="text-3xl font-extrabold text-lime-300">{total("abertas")-comJustificativa}</div><div className="text-xs font-bold uppercase tracking-wide text-emerald-100/70">Sem justificativa</div></div>
        </div>
        <div className="mb-3 mt-8"><h2 className="text-xl font-bold">Visão por unidade</h2><p className="text-sm text-emerald-100/70">Os valores abaixo são apenas demonstrativos.</p></div>
        <div className="grid gap-4 lg:grid-cols-3">{visiveis.map((u) => <article key={u.nome} className="rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Unidade</div><h3 className="mt-1 text-lg font-extrabold">{u.nome}</h3></div><span className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-emerald-100">Somente visualização</span></div>
          <div className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-extrabold text-lime-300">{u.abertas}</span><span className="text-sm text-emerald-100/70">OS abertas</span></div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-emerald-950">{u.faixas.map((n,i) => <div key={faixas[i].nome} className={faixas[i].cor} style={{width:(n/Math.max(u.abertas,1)*100)+"%"}} />)}</div>
          <div className="mt-4 space-y-2 border-t border-emerald-800 pt-3">{faixas.map((f,i)=><div key={f.nome} className="flex justify-between text-sm"><span className="flex items-center gap-2 text-emerald-100/80"><i className={`h-2.5 w-2.5 rounded-full ${f.cor}`} />{f.nome}</span><strong>{u.faixas[i]}</strong></div>)}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-800 pt-3"><div><div className="text-xl font-bold text-lime-300">0</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Com justificativa</div></div><div><div className="text-xl font-bold text-lime-300">{u.abertas}</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Sem justificativa</div></div></div>
          <p className="mt-4 text-sm text-emerald-100/80">OS mais antiga: <strong className="text-white">{u.maisAntiga}</strong></p>
          <button type="button" onClick={() => window.alert("A consulta real será conectada somente depois de existir um banco de teste isolado. Nenhuma OS oficial foi consultada.")} className="mt-4 w-full rounded-lg border border-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-900">Ver OS (demonstração)</button>
        </article>)}</div>
        <p className="mt-6 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-100">Aviso: esta rota não consulta nem modifica o banco oficial. Os dados são fictícios. A integração real depende de um projeto Supabase de teste separado para proteger as OS de produção.</p>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, accent, compact = false }: { icon: React.ReactNode; label: string; value: string | number; accent: string; compact?: boolean }) {
  return <section className="min-w-0 rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100/70">{icon}{label}</div><div className={`mt-3 break-words font-extrabold ${accent} ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>{value}</div></section>;
}
