import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Clock3, ClipboardList, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/painel-teste")({
  component: PainelTeste,
});

type Unidade = { id: string; codigo: string; nome: string };
type PerfilUsuario = "admin_unidade" | "tecnico" | "gestor_central" | "visualizador";
type UsuarioUnidade = { user_id: string; unidade_id: string | null; perfil: PerfilUsuario; ativo: boolean };
type UsuarioAdministrado = UsuarioUnidade & { email: string; nome: string; created_at?: string };
type Ordem = {
  id: string;
  unidade_id: string;
  numero_os: string | null;
  frota: string | null;
  descricao: string;
  setor: string | null;
  tecnico_nome: string | null;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  created_at: string;
  data_inicio: string | null;
  concluida_em: string | null;
  classe_manutencao: string | string[] | null;
  pecas_utilizadas: string | null;
};

const faixas = [
  { nome: "Até 24h", cor: "bg-lime-400" },
  { nome: "24–48h", cor: "bg-yellow-300" },
  { nome: "2–7 dias", cor: "bg-orange-400" },
  { nome: "7–15 dias", cor: "bg-red-400" },
  { nome: "Mais de 15 dias", cor: "bg-pink-400" },
];

function idadeEmHoras(data: string) {
  return Math.max(0, (Date.now() - new Date(data).getTime()) / 3_600_000);
}

function formatarIdade(data: string | null) {
  if (!data) return "—";
  const horas = Math.floor(idadeEmHoras(data));
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return dias > 0 ? `${dias}d ${resto}h` : `${horas}h`;
}

function PainelTeste() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioUnidade[]>([]);
  const [erroUsuarios, setErroUsuarios] = useState("");
  const [usuariosAdmin, setUsuariosAdmin] = useState<UsuarioAdministrado[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [mensagemUsuarios, setMensagemUsuarios] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [emailNovo, setEmailNovo] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [perfilNovo, setPerfilNovo] = useState<PerfilUsuario>("tecnico");
  const [unidadeNova, setUnidadeNova] = useState("vale_parana");
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [filtro, setFiltro] = useState("Todas");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [ordemSelecionada, setOrdemSelecionada] = useState<string | null>(null);
  const [aba, setAba] = useState<"painel" | "analise" | "usuarios">("painel");
  const [perfilAtual, setPerfilAtual] = useState<PerfilUsuario | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    // O schema multiunidade é exclusivo do projeto Supabase de teste.
    // O cast temporário será substituído pelos tipos gerados após a estabilização do schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: perfilData } = await db.from("usuarios_unidades").select("perfil").eq("user_id", authData.user.id).eq("ativo", true).maybeSingle();
      const perfil = (perfilData?.perfil as PerfilUsuario | undefined) ?? null;
      setPerfilAtual(perfil);
      if (perfil === "admin_unidade") setFiltro("Nova Londrina");
    }
    const [resultadoUnidades, resultadoOrdens, resultadoUsuarios] = await Promise.all([
      db.from("unidades").select("id,codigo,nome").order("nome"),
      db.from("ordens_servico")
        .select("id,unidade_id,numero_os,frota,descricao,setor,tecnico_nome,status,created_at,data_inicio,concluida_em,classe_manutencao,pecas_utilizadas")
        .order("created_at", { ascending: false }),
      db.from("usuarios_unidades").select("user_id,unidade_id,perfil,ativo").order("perfil"),
    ]);
    if (resultadoUnidades.error || resultadoOrdens.error) {
      setErro(resultadoUnidades.error?.message || resultadoOrdens.error?.message || "Não foi possível consultar o banco de teste.");
      setErroUsuarios(resultadoUsuarios.error?.message || "Não foi possível consultar os vínculos de usuários.");
      setUnidades([]);
      setOrdens([]);
      setUsuarios([]);
    } else {
      setUnidades(resultadoUnidades.data ?? []);
      setOrdens(resultadoOrdens.data ?? []);
      setUsuarios(resultadoUsuarios.data ?? []);
      setErroUsuarios(resultadoUsuarios.error?.message || "");
      setAtualizadoEm(new Date());
    }
    setCarregando(false);
  };

  const executarAcaoUsuario = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("gerenciar-usuarios-teste", { body: payload });
    if (error) throw new Error(error.message || "Falha ao comunicar com o serviço administrativo.");
    if (!data?.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
    return data;
  };

  const carregarUsuariosAdmin = async () => {
    setCarregandoUsuarios(true);
    setErroUsuarios("");
    try {
      const data = await executarAcaoUsuario({ action: "list" });
      setUsuariosAdmin(data.users ?? []);
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível listar usuários.");
    } finally {
      setCarregandoUsuarios(false);
    }
  };

  const criarUsuario = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSalvandoUsuario(true);
    setErroUsuarios("");
    setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({
        action: "create", nome: nomeNovo, email: emailNovo, password: senhaNova,
        perfil: perfilNovo, unidade_codigo: perfilNovo === "gestor_central" ? "" : unidadeNova,
      });
      setMensagemUsuarios("Usuário criado e vinculado ao ambiente de teste.");
      setNomeNovo(""); setEmailNovo(""); setSenhaNova("");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
    } finally {
      setSalvandoUsuario(false);
    }
  };

  const atualizarUsuario = async (usuario: UsuarioAdministrado, perfil: PerfilUsuario, unidadeCodigo: string) => {
    setErroUsuarios(""); setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({
        action: "update", user_id: usuario.user_id, perfil,
        ...(perfil === "gestor_central" ? {} : { unidade_codigo: unidadeCodigo }),
      });
      setMensagemUsuarios("Perfil e unidade atualizados.");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
    }
  };

  const alternarAtivo = async (usuario: UsuarioAdministrado) => {
    setErroUsuarios(""); setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({ action: "update", user_id: usuario.user_id, ativo: !usuario.ativo });
      setMensagemUsuarios(usuario.ativo ? "Acesso desativado." : "Acesso ativado.");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível alterar o acesso.");
    }
  };

  const excluirUsuario = async (usuario: UsuarioAdministrado) => {
    if (!window.confirm(`Excluir definitivamente a conta ${usuario.email}? Essa ação não pode ser desfeita.`)) return;
    setErroUsuarios(""); setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({ action: "delete", user_id: usuario.user_id });
      setMensagemUsuarios("Conta excluída do ambiente de teste.");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível excluir o usuário.");
    }
  };

  useEffect(() => { void carregar(); }, []);
  useEffect(() => { if (aba === "usuarios") void carregarUsuariosAdmin(); }, [aba]);

  const unidadesVisiveis = useMemo(
    () => perfilAtual === "admin_unidade"
      ? unidades.filter((unidade) => unidade.codigo === "nova_londrina")
      : filtro === "Todas" ? unidades : unidades.filter((unidade) => unidade.nome === filtro),
    [filtro, unidades, perfilAtual],
  );
  const idsVisiveis = new Set(unidadesVisiveis.map((unidade) => unidade.id));
  const ordensVisiveis = ordens.filter((ordem) => idsVisiveis.has(ordem.unidade_id));
  const abertas = ordensVisiveis.filter((ordem) => ordem.status === "pendente" || ordem.status === "em_andamento");
  const acima48h = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 48);
  const acima7d = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 168);
  const maisAntiga = abertas.reduce<Ordem | null>((maisVelha, ordem) =>
    !maisVelha || new Date(ordem.created_at).getTime() < new Date(maisVelha.created_at).getTime() ? ordem : maisVelha, null);
  const contagens = [
    abertas.filter((ordem) => idadeEmHoras(ordem.created_at) < 24).length,
    abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 24 && idadeEmHoras(ordem.created_at) < 48).length,
    abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 48 && idadeEmHoras(ordem.created_at) < 168).length,
    abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 168 && idadeEmHoras(ordem.created_at) < 360).length,
    abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 360).length,
  ];

  return (
    <div className="min-h-screen bg-[#002b25] text-slate-50">
      <header className="border-b border-emerald-800 bg-[#00251f] px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><div className="text-xl font-extrabold">Central OS</div><div className="text-xs text-emerald-200">PAINEL CONSOLIDADO · AMBIENTE DE TESTE</div></div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-3 text-sm text-emerald-100">Unidade
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} disabled={perfilAtual === "admin_unidade"} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white">
                <option>Todas</option>{unidades.map((unidade) => <option key={unidade.id}>{unidade.nome}</option>)}
              </select>
            </label>
            <nav aria-label="Seções do painel" className="flex items-center gap-1 rounded-lg border border-emerald-800 bg-[#00352d] p-1">
              <button type="button" onClick={() => setAba("painel")} aria-current={aba === "painel" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "painel" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Painel Geral</button>
              <button type="button" onClick={() => setAba("analise")} aria-current={aba === "analise" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "analise" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Análise Técnica</button>
              {perfilAtual === "gestor_central" && <button type="button" onClick={() => setAba("usuarios")} aria-current={aba === "usuarios" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "usuarios" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Gestão de Usuários</button>}
            </nav>
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm hover:bg-emerald-900 disabled:opacity-50"><RefreshCw size={16} className={carregando ? "animate-spin" : ""} /> Atualizar</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        {aba === "painel" && <>
        <div className="mb-6 flex items-start gap-3"><Building2 className="mt-1 text-lime-300" /><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Visão geral</p><h1 className="text-2xl font-extrabold sm:text-3xl">Painel Consolidado</h1><p className="mt-1 text-sm text-emerald-100/70">Indicadores calculados a partir das OS no banco isolado de testes.</p></div></div>

        {erro && <div role="alert" className="mb-5 rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-100"><strong>Não foi possível carregar os dados.</strong><p className="mt-1 break-words">{erro}</p><p className="mt-2 text-xs">Confira a sessão de teste e os vínculos de unidade do usuário. Nenhum dado fictício é exibido como se fosse real.</p></div>}
        {carregando && <p role="status" className="mb-4 text-sm text-emerald-100/80">Consultando o banco de teste…</p>}
        {!carregando && !erro && ordens.length === 0 && <div className="mb-5 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">A consulta retornou zero OS para este usuário. Isso pode significar que ainda falta associar o usuário a um perfil/unidade de teste.</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<ClipboardList />} label="OS abertas" value={abertas.length} accent="text-lime-300" />
          <Metric icon={<Clock3 />} label="Abertas há mais de 48h" value={acima48h.length} accent="text-red-300" />
          <Metric icon={<ShieldAlert />} label="Alerta · mais de 7 dias" value={acima7d.length} accent="text-pink-300" />
          <Metric icon={<AlertTriangle />} label="OS mais antiga" value={maisAntiga ? formatarIdade(maisAntiga.created_at) : "—"} accent="text-sky-200" compact />
        </div>
        <section className="mt-4 rounded-2xl border border-emerald-800 bg-[#003b32] p-4 sm:p-5">
          <h2 className="font-bold">Tempo em aberto</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-emerald-950">{contagens.map((quantidade, indice) => <div key={faixas[indice].nome} title={faixas[indice].nome + ": " + quantidade} className={faixas[indice].cor} style={{ width: (quantidade / Math.max(abertas.length, 1) * 100) + "%" }} />)}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-emerald-100/80">{faixas.map((faixa, indice) => <span key={faixa.nome} className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${faixa.cor}`} />{faixa.nome}: {contagens[indice]}</span>)}</div>
        </section>

        <div className="mb-3 mt-8"><h2 className="text-xl font-bold">Visão por unidade</h2><p className="text-sm text-emerald-100/70">Os números são obtidos da tabela ordens_servico; a RLS do banco controla quais unidades o usuário pode consultar.</p></div>
        <div className="grid gap-4 lg:grid-cols-3">{unidadesVisiveis.map((unidade) => {
          const ordensUnidade = ordensVisiveis.filter((ordem) => ordem.unidade_id === unidade.id);
          const abertasUnidade = ordensUnidade.filter((ordem) => ordem.status === "pendente" || ordem.status === "em_andamento");
          const faixaUnidade = [
            abertasUnidade.filter((ordem) => idadeEmHoras(ordem.created_at) < 24).length,
            abertasUnidade.filter((ordem) => idadeEmHoras(ordem.created_at) >= 24 && idadeEmHoras(ordem.created_at) < 48).length,
            abertasUnidade.filter((ordem) => idadeEmHoras(ordem.created_at) >= 48 && idadeEmHoras(ordem.created_at) < 168).length,
            abertasUnidade.filter((ordem) => idadeEmHoras(ordem.created_at) >= 168 && idadeEmHoras(ordem.created_at) < 360).length,
            abertasUnidade.filter((ordem) => idadeEmHoras(ordem.created_at) >= 360).length,
          ];
          return <article key={unidade.id} className="rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Unidade</div><h3 className="mt-1 text-lg font-extrabold">{unidade.nome}</h3></div><span className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-emerald-100">Leitura</span></div>
            <div className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-extrabold text-lime-300">{abertasUnidade.length}</span><span className="text-sm text-emerald-100/70">OS abertas</span></div>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-emerald-950">{faixaUnidade.map((quantidade, indice) => <div key={faixas[indice].nome} className={faixas[indice].cor} style={{ width: (quantidade / Math.max(abertasUnidade.length, 1) * 100) + "%" }} />)}</div>
            <div className="mt-4 space-y-2 border-t border-emerald-800 pt-3">{faixas.map((faixa, indice) => <div key={faixa.nome} className="flex justify-between text-sm"><span className="flex items-center gap-2 text-emerald-100/80"><i className={`h-2.5 w-2.5 rounded-full ${faixa.cor}`} />{faixa.nome}</span><strong>{faixaUnidade[indice]}</strong></div>)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-800 pt-3"><div><div className="text-xl font-bold text-lime-300">{ordensUnidade.filter((ordem) => ordem.status === "concluida").length}</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Concluídas</div></div><div><div className="text-xl font-bold text-lime-300">{ordensUnidade.length}</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Total de OS</div></div></div>
            <button type="button" onClick={() => setOrdemSelecionada(ordemSelecionada === unidade.id ? null : unidade.id)} className="mt-4 w-full rounded-lg border border-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-900">{ordemSelecionada === unidade.id ? "Ocultar OS" : "Ver OS da unidade"}</button>
            {ordemSelecionada === unidade.id && <div className="mt-3 space-y-2">{ordensUnidade.length === 0 ? <p className="text-sm text-emerald-100/70">Nenhuma OS visível para esta unidade.</p> : ordensUnidade.map((ordem) => <div key={ordem.id} className="rounded-lg border border-emerald-800 bg-[#002b25] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{ordem.numero_os || "OS sem número"} · {ordem.frota || "Frota não informada"}</strong><span className="rounded-md bg-emerald-950 px-2 py-1 text-xs">{ordem.status.replace("_", " ")}</span></div><p className="mt-1 text-emerald-100/90">{ordem.descricao}</p><p className="mt-1 text-xs text-emerald-100/60">{ordem.setor || "Sem setor"} · {ordem.tecnico_nome || "Sem técnico"} · Criada há {formatarIdade(ordem.created_at)}</p></div>)}</div>}
          </article>;
        })}</div>
        </>}
        {aba === "analise" && <section className="mt-8">
          <div className="mb-3"><h2 className="text-xl font-bold">Análise Técnica</h2><p className="text-sm text-emerald-100/70">Resumo consolidado das OS visíveis no ambiente de teste, respeitando o filtro de unidade e as regras de acesso do banco.</p></div>
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
              <h3 className="font-bold">Serviços / classes</h3>
              <div className="mt-3 space-y-2">{Object.entries(ordensVisiveis.reduce<Record<string, number>>((acc, ordem) => {
                const valor = Array.isArray(ordem.classe_manutencao) ? ordem.classe_manutencao.join(", ") : ordem.classe_manutencao;
                const classe = valor?.trim() || "Não informado";
                acc[classe] = (acc[classe] || 0) + 1;
                return acc;
              }, {})).sort((a, b) => b[1] - a[1]).map(([classe, quantidade]) => <div key={classe} className="flex items-center justify-between gap-3 text-sm"><span className="text-emerald-100/80">{classe}</span><strong>{quantidade}</strong></div>)}
              {ordensVisiveis.length === 0 && <p className="text-sm text-emerald-100/60">Sem OS para analisar.</p>}</div>
            </article>
            <article className="rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
              <h3 className="font-bold">Produtividade por técnico</h3>
              <div className="mt-3 space-y-2">{Object.entries(ordensVisiveis.reduce<Record<string, { total: number; concluidas: number }>>((acc, ordem) => {
                const tecnico = ordem.tecnico_nome?.trim() || "Sem técnico";
                acc[tecnico] ??= { total: 0, concluidas: 0 };
                acc[tecnico].total += 1;
                if (ordem.status === "concluida") acc[tecnico].concluidas += 1;
                return acc;
              }, {})).sort((a, b) => b[1].concluidas - a[1].concluidas || b[1].total - a[1].total).map(([tecnico, resumo]) => <div key={tecnico} className="rounded-lg bg-[#002b25] p-2 text-sm"><div className="flex justify-between gap-2"><strong>{tecnico}</strong><span>{resumo.concluidas}/{resumo.total}</span></div><div className="mt-1 text-xs text-emerald-100/60">concluídas / total de OS</div></div>)}
              {ordensVisiveis.length === 0 && <p className="text-sm text-emerald-100/60">Sem OS para analisar.</p>}</div>
            </article>
            <article className="rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
              <h3 className="font-bold">OS por setor</h3>
              <div className="mt-3 space-y-2">{Object.entries(ordensVisiveis.reduce<Record<string, number>>((acc, ordem) => {
                const setor = ordem.setor?.trim() || "Sem setor";
                acc[setor] = (acc[setor] || 0) + 1;
                return acc;
              }, {})).sort((a, b) => b[1] - a[1]).map(([setor, quantidade]) => <div key={setor} className="flex items-center justify-between gap-3 text-sm"><span className="text-emerald-100/80">{setor}</span><strong>{quantidade}</strong></div>)}
              {ordensVisiveis.length === 0 && <p className="text-sm text-emerald-100/60">Sem OS para analisar.</p>}</div>
            </article>
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
            <h3 className="font-bold">Peças utilizadas e detalhes dos serviços</h3>
            <div className="mt-3 space-y-2">{ordensVisiveis.filter((ordem) => ordem.pecas_utilizadas?.trim() || ordem.descricao?.trim()).map((ordem) => <div key={ordem.id} className="rounded-lg border border-emerald-800 bg-[#002b25] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{ordem.numero_os || "OS sem número"} · {ordem.frota || "Frota não informada"}</strong><span className="text-xs text-emerald-100/60">{ordem.tecnico_nome || "Sem técnico"} · {ordem.setor || "Sem setor"}</span></div><p className="mt-1 text-emerald-100/80">{ordem.descricao || "Sem descrição"}</p><p className="mt-1 text-xs text-emerald-100/70">Classe: {Array.isArray(ordem.classe_manutencao) ? ordem.classe_manutencao.join(", ") : ordem.classe_manutencao || "Não informada"}</p><p className="mt-1 text-xs text-emerald-100/70">Peças: {ordem.pecas_utilizadas || "Não informadas"}</p></div>)}
            {ordensVisiveis.length === 0 && <p className="text-sm text-emerald-100/60">Sem registros para exibir.</p>}</div>
          </div>
        </section>}
        {aba === "usuarios" && perfilAtual === "gestor_central" && <section className="mt-8">
          <div className="mb-4"><h2 className="text-2xl font-extrabold">Gestão de Usuários</h2><p className="mt-1 text-sm text-emerald-100/70">Cadastro e gerenciamento de contas somente no banco de teste multiunidade.</p></div>
          <div className="mb-5 rounded-xl border border-emerald-700 bg-emerald-950/40 p-4 text-sm text-emerald-100"><strong>Área administrativa protegida.</strong><p className="mt-1">O servidor confirma o perfil Gestor Geral ativo antes de executar qualquer operação. Senhas nunca são exibidas.</p></div>
          {erroUsuarios && <div role="alert" className="mb-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-100">{erroUsuarios}</div>}
          {mensagemUsuarios && <div role="status" className="mb-4 rounded-xl border border-lime-700 bg-lime-950/30 p-3 text-sm text-lime-100">{mensagemUsuarios}</div>}
          <form onSubmit={criarUsuario} className="mb-6 grid gap-3 rounded-2xl border border-emerald-800 bg-[#003b32] p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3"><h3 className="font-bold">Cadastrar usuário</h3><p className="mt-1 text-xs text-emerald-100/70">A senha inicial deve ter pelo menos 8 caracteres. Informe uma senha temporária e compartilhe-a com segurança.</p></div>
            <label className="grid gap-1 text-sm">Nome completo<input required maxLength={120} value={nomeNovo} onChange={e=>setNomeNovo(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            <label className="grid gap-1 text-sm">E-mail<input required type="email" value={emailNovo} onChange={e=>setEmailNovo(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            <label className="grid gap-1 text-sm">Senha inicial<input required type="password" minLength={8} maxLength={128} value={senhaNova} onChange={e=>setSenhaNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            <label className="grid gap-1 text-sm">Perfil<select value={perfilNovo} onChange={e=>setPerfilNovo(e.target.value as PerfilUsuario)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="tecnico">Técnico</option><option value="admin_unidade">ADM da unidade</option><option value="visualizador">Somente visualização</option><option value="gestor_central">Gestor Geral</option></select></label>
            {perfilNovo !== "gestor_central" && <label className="grid gap-1 text-sm">Unidade<select value={unidadeNova} onChange={e=>setUnidadeNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="vale_parana">Vale do Paraná</option><option value="nova_londrina">Nova Londrina</option><option value="jussara">Jussara</option></select></label>}
            <div className="flex items-end"><button disabled={salvandoUsuario} type="submit" className="w-full rounded-lg bg-lime-300 px-4 py-2.5 font-bold text-emerald-950 hover:bg-lime-200 disabled:opacity-50">{salvandoUsuario ? "Salvando…" : "Criar usuário"}</button></div>
          </form>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Contas e permissões</h3><button type="button" onClick={()=>void carregarUsuariosAdmin()} disabled={carregandoUsuarios} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm hover:bg-emerald-900 disabled:opacity-50">{carregandoUsuarios ? "Atualizando…" : "Atualizar lista"}</button></div>
          <div className="overflow-x-auto rounded-xl border border-emerald-800">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#003b32] text-emerald-100"><tr><th className="p-3">Usuário</th><th className="p-3">Perfil / unidade</th><th className="p-3">Situação</th><th className="p-3">Ações</th></tr></thead>
              <tbody>{usuariosAdmin.map(usuario => <tr key={usuario.user_id} className="border-t border-emerald-900 align-top">
                <td className="p-3"><div className="font-semibold">{usuario.nome || "Nome não informado"}</div><div className="text-xs text-emerald-100/70">{usuario.email}</div><div className="mt-1 font-mono text-[10px] text-emerald-100/40">{usuario.user_id}</div></td>
                <td className="p-3"><div>{({admin_unidade:"ADM da unidade",tecnico:"Técnico",gestor_central:"Gestor Geral",visualizador:"Somente visualização"} as Record<string,string>)[usuario.perfil] || usuario.perfil}</div><div className="text-xs text-emerald-100/70">{usuario.unidade_id ? unidades.find(u=>u.id===usuario.unidade_id)?.nome || "Unidade não encontrada" : "Todas as unidades"}</div>
                  {usuario.perfil !== "gestor_central" && <div className="mt-2 flex flex-wrap gap-2"><select aria-label={`Perfil de ${usuario.email}`} defaultValue={usuario.perfil} id={`perfil-${usuario.user_id}`} className="rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-xs text-white"><option value="tecnico">Técnico</option><option value="admin_unidade">ADM</option><option value="visualizador">Visualizador</option></select><select aria-label={`Unidade de ${usuario.email}`} defaultValue={unidades.find(u=>u.id===usuario.unidade_id)?.codigo || "vale_parana"} id={`unidade-${usuario.user_id}`} className="rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-xs text-white"><option value="vale_parana">Vale do Paraná</option><option value="nova_londrina">Nova Londrina</option><option value="jussara">Jussara</option></select><button type="button" onClick={()=>{const p=document.getElementById(`perfil-${usuario.user_id}`) as HTMLSelectElement|null;const u=document.getElementById(`unidade-${usuario.user_id}`) as HTMLSelectElement|null;if(p&&u)void atualizarUsuario(usuario,p.value as PerfilUsuario,u.value)}} className="rounded border border-emerald-600 px-2 py-1 text-xs hover:bg-emerald-900">Salvar</button></div>}
                </td>
                <td className="p-3"><span className={usuario.ativo ? "rounded-md bg-emerald-900 px-2 py-1 text-emerald-200" : "rounded-md bg-red-950 px-2 py-1 text-red-200"}>{usuario.ativo ? "Ativo" : "Inativo"}</span></td>
                <td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void alternarAtivo(usuario)} className="rounded border border-emerald-600 px-2 py-1 text-xs hover:bg-emerald-900">{usuario.ativo ? "Desativar" : "Ativar"}</button><button type="button" onClick={()=>void excluirUsuario(usuario)} className="rounded border border-red-800 px-2 py-1 text-xs text-red-200 hover:bg-red-950">Excluir</button></div></td>
              </tr>)}
              {usuariosAdmin.length===0 && <tr><td colSpan={4} className="p-5 text-center text-emerald-100/60">{carregandoUsuarios ? "Carregando usuários…" : "Nenhum usuário retornado pelo serviço administrativo."}</td></tr>}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-emerald-100/60">Gestores Gerais só podem ser criados pela conta principal. A exclusão remove a conta de autenticação do ambiente de teste; confirme antes de excluir.</p>
        </section>}
        <p className="mt-6 rounded-xl border border-emerald-800 bg-[#003b32] p-3 text-xs text-emerald-100/80">Ambiente isolado de teste. Esta tela é somente leitura; o banco oficial e suas OS não são consultados por esta rota quando as variáveis de Preview estão corretamente configuradas.</p>
        {atualizadoEm && <p className="mt-2 text-right text-xs text-emerald-100/50">Última atualização: {atualizadoEm.toLocaleString("pt-BR")}</p>}
      </main>
    </div>
  );
}

function Metric({ icon, label, value, accent, compact = false }: { icon: React.ReactNode; label: string; value: string | number; accent: string; compact?: boolean }) {
  return <section className="min-w-0 rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100/70">{icon}{label}</div><div className={`mt-3 break-words font-extrabold ${accent} ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>{value}</div></section>;
}
