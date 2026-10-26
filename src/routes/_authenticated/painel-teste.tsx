import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Clock3, ClipboardList, RefreshCw, ShieldAlert, ClipboardPaste, Upload, Plus, FileSpreadsheet, CheckCircle2, Circle, PlayCircle, XCircle, Search, ListFilter, ArrowUpDown, ArrowUp, ArrowDown, Users, LogOut, Trash2 } from "lucide-react";
import { read, utils, writeFile } from "xlsx";
import { MonitorSmartphone, ShieldCheck, ShieldX, Pencil } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/painel-teste")({
  component: PainelTeste,
});

type Unidade = { id: string; codigo: string; nome: string; ativa?: boolean };
type PerfilUsuario = "admin_unidade" | "tecnico" | "gestor" | "gestor_central" | "visualizador";
type UsuarioUnidade = { user_id: string; unidade_id: string | null; perfil: PerfilUsuario; ativo: boolean };
type UsuarioAdministrado = UsuarioUnidade & { email: string; nome: string; created_at?: string };
type DispositivoAcesso = { id: string; user_id: string; user_email: string | null; device_id: string; nome_dispositivo: string; user_agent: string | null; bloqueado: boolean; criado_em: string; ultimo_acesso_em: string; bloqueado_em: string | null };
type LinhaImportacao = { numero_os: string; frota: string; entrada: string; descricao: string; localizacao: string; setor: string; sequencia: number | null; tecnico_email: string; tecnico_nome: string; tecnico_original: string; tecnico_valido: boolean; valid: boolean };
type Ordem = {
  id: string;
  unidade_id: string;
  numero_os: string | null;
  frota: string | null;
  descricao: string;
  setor: string | null;
  localizacao: string | null;
  sequencia: number | null;
  tecnico_nome: string | null;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  created_at: string;
  entrada?: string | null;
  tecnico_email?: string | null;
  criado_por_email?: string | null;
  data_inicio: string | null;
  concluida_em: string | null;
  classe_manutencao: string | string[] | null;
  pecas_utilizadas: string | null;
  notas_fecho?: string | null;
  fechada_em?: string | null;
  fechada_por_email?: string | null;
};

const faixas = [
  { nome: "Até 24h", cor: "bg-lime-400" },
  { nome: "24–48h", cor: "bg-yellow-300" },
  { nome: "2–7 dias", cor: "bg-orange-400" },
  { nome: "7–15 dias", cor: "bg-red-400" },
  { nome: "Mais de 15 dias", cor: "bg-pink-400" },
];

function formatarDataBR(valor: string | Date | null | undefined, incluirHora = false) {
  if (!valor) return "—";
  if (typeof valor === "string") {
    const texto = valor.trim();
    const isoData = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoData) return `${isoData[3]}/${isoData[2]}/${isoData[1]}`;
  }
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) {
    const texto = String(valor).trim();
    const iso = texto.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return texto || "—";
  }
  const dataFormatada = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (!incluirHora) return dataFormatada;
  return dataFormatada + " " + data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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
  const [filtroUnidadeUsuarios, setFiltroUnidadeUsuarios] = useState("todas");
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [mensagemUsuarios, setMensagemUsuarios] = useState("");
  const [usuarioSenhaEdicao, setUsuarioSenhaEdicao] = useState<string | null>(null);
  const [senhaUsuarioNova, setSenhaUsuarioNova] = useState("");
  const [confirmarSenhaUsuarioNova, setConfirmarSenhaUsuarioNova] = useState("");
  const [salvandoSenhaUsuario, setSalvandoSenhaUsuario] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [emailNovo, setEmailNovo] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [perfilNovo, setPerfilNovo] = useState<PerfilUsuario>("tecnico");
  const [unidadeNova, setUnidadeNova] = useState("vale_parana");
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [filtro, setFiltro] = useState("Todas");
  const [statusFiltro, setStatusFiltro] = useState<"Todas" | Ordem["status"] | "aguardando_pims">("Todas");
  const [buscaOS, setBuscaOS] = useState("");
  const [filtrosColuna, setFiltrosColuna] = useState<{ situacao: string[]; os: string[]; frota: string[]; setor: string[]; tecnico: string[]; descricao: string[]; entrada: string[]; idade: string[]; localizacao: string[] }>({ situacao: [], os: [], frota: [], setor: [], tecnico: [], descricao: [], entrada: [], idade: [], localizacao: [] });
  const [ordenacaoColuna, setOrdenacaoColuna] = useState<{ chave: "situacao" | "os" | "frota" | "setor" | "tecnico" | "descricao" | "entrada" | "idade"; direcao: "asc" | "desc" }>({ chave: "os", direcao: "asc" });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [ordemSelecionada, setOrdemSelecionada] = useState<string | null>(null);
  const [ordemDetalhes, setOrdemDetalhes] = useState<Ordem | null>(null);
  const [aba, setAba] = useState<"inicio" | "gestao_os" | "historico" | "solicitacoes" | "analise" | "usuarios" | "estoque" | "unidades" | "dispositivos">("inicio");
  const [dispositivos, setDispositivos] = useState<DispositivoAcesso[]>([]);
  const [carregandoDispositivos, setCarregandoDispositivos] = useState(false);
  const [mensagemDispositivos, setMensagemDispositivos] = useState("");
  const [historicoBusca, setHistoricoBusca] = useState("");
  const [historicoStatus, setHistoricoStatus] = useState<"Todas" | Ordem["status"]>("Todas");
  const [historicoFrota, setHistoricoFrota] = useState("");
  const [historicoSetor, setHistoricoSetor] = useState("");
  const [historicoTecnico, setHistoricoTecnico] = useState("");
  const [historicoDataInicial, setHistoricoDataInicial] = useState("");
  const [historicoDataFinal, setHistoricoDataFinal] = useState("");
  const [periodoGrafico, setPeriodoGrafico] = useState<"7" | "14" | "30">("14");
  const [buscaBaseTecnica, setBuscaBaseTecnica] = useState("");
  const [ordenacaoHistorico, setOrdenacaoHistorico] = useState<{ chave: "unidade" | "os" | "frota" | "setor" | "descricao" | "localizacao" | "tecnico" | "classe" | "pecas" | "status" | "entrada" | "criado" | "inicio" | "conclusao" | "id"; direcao: "asc" | "desc" }>({ chave: "criado", direcao: "desc" });
  const [solicitacaoEmEdicao, setSolicitacaoEmEdicao] = useState<{ id: string; numero_os: string; frota: string; localizacao: string; descricao: string; setor: string; tecnico_nome: string } | null>(null);
  const [perfilAtual, setPerfilAtual] = useState<PerfilUsuario | null>(null);
  const [usuarioAtualId, setUsuarioAtualId] = useState<string | null>(null);
  const [emailUsuarioAtual, setEmailUsuarioAtual] = useState("");
  const [nomePerfil, setNomePerfil] = useState("");
  const [salvandoNomePerfil, setSalvandoNomePerfil] = useState(false);
  const [unidadeAtualId, setUnidadeAtualId] = useState<string | null>(null);
  const [modoGestao, setModoGestao] = useState<"fechado" | "menu" | "criar" | "colar" | "importar" | "solicitacoes">("fechado");
  const [gestaoOSAberta, setGestaoOSAberta] = useState(false);
  const [ordensSelecionadasTransferencia, setOrdensSelecionadasTransferencia] = useState<string[]>([]);
  const [tecnicoDestinoTransferencia, setTecnicoDestinoTransferencia] = useState("");
  const [transferindoOS, setTransferindoOS] = useState(false);
  const [salvandoNovaOS, setSalvandoNovaOS] = useState(false);
  const [textoPlanilha, setTextoPlanilha] = useState("");
  const [linhasImportacao, setLinhasImportacao] = useState<LinhaImportacao[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [formNovaOS, setFormNovaOS] = useState({ numero_os: "", frota: "", descricao: "", setor: "", localizacao: "", tecnico_nome: "", tecnico_email: "", entrada: "" });
  const [formUnidadeCentral, setFormUnidadeCentral] = useState("");
  const [nomeUnidadeNova, setNomeUnidadeNova] = useState("");
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  const [mensagemUnidades, setMensagemUnidades] = useState("");
  const [edicaoOS, setEdicaoOS] = useState<{ id: string; numero_os: string; frota: string; descricao: string; setor: string; tecnico_nome: string; status: Ordem["status"]; pecas_utilizadas: string } | null>(null);
  const [salvandoOS, setSalvandoOS] = useState(false);
  const [mensagemOS, setMensagemOS] = useState("");
  const [pecasEstoque, setPecasEstoque] = useState<any[]>([]);
  const [movimentacoesEstoque, setMovimentacoesEstoque] = useState<any[]>([]);
  const [unidadeEstoqueId, setUnidadeEstoqueId] = useState("");
  const [nomePeca, setNomePeca] = useState("");
  const [estoqueMinimo, setEstoqueMinimo] = useState("0");
  const [quantidadeInicial, setQuantidadeInicial] = useState("0");
  const [pecaEntradaId, setPecaEntradaId] = useState("");
  const [quantidadeEntrada, setQuantidadeEntrada] = useState("1");
  const [observacaoEntrada, setObservacaoEntrada] = useState("");
  const [salvandoEstoque, setSalvandoEstoque] = useState(false);
  const [mensagemEstoque, setMensagemEstoque] = useState("");

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    // O schema multiunidade é exclusivo do projeto Supabase de teste.
    // O cast temporário será substituído pelos tipos gerados após a estabilização do schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      setUsuarioAtualId(authData.user.id);
      setEmailUsuarioAtual((authData.user.email ?? "").toLocaleLowerCase("pt-BR"));
      setNomePerfil(String(authData.user.user_metadata?.nome ?? ""));
      const { data: perfilData } = await db.from("usuarios_unidades").select("perfil,unidade_id").eq("user_id", authData.user.id).eq("ativo", true).maybeSingle();
      const perfil = (perfilData?.perfil as PerfilUsuario | undefined) ?? null;
      setPerfilAtual(perfil);
      setUnidadeAtualId((perfilData?.unidade_id as string | null | undefined) ?? null);
      if (perfilData?.unidade_id) setUnidadeEstoqueId(perfilData.unidade_id as string);
    }
    const [resultadoUnidades, resultadoOrdens, resultadoUsuarios] = await Promise.all([
      db.from("unidades").select("id,codigo,nome,ativa").order("nome"),
      db.from("ordens_servico")
        .select("*")
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
    const { data: pecasData, error: pecasError } = await db.from("pecas_catalogo").select("*").order("nome");
    const { data: movData } = await db.from("estoque_movimentacoes").select("*,pecas_catalogo(nome),ordens_servico(numero_os,frota)").order("created_at", { ascending: false }).limit(100);
    setPecasEstoque(pecasData ?? []);
    setMovimentacoesEstoque(movData ?? []);
    if (pecasError) setMensagemEstoque("Estoque: " + pecasError.message);
    setCarregando(false);
  };

  const cadastrarUnidade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (perfilAtual !== "gestor_central") return;
    const nome = nomeUnidadeNova.trim().replace(/\\s+/g, " ");
    if (nome.length < 2) { setMensagemUnidades("Informe um nome de unidade com pelo menos 2 caracteres."); return; }
    const base = nome.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    let codigo = base || "unidade";
    let sufixo = 2;
    while (unidades.some(u => u.codigo.toLowerCase() === codigo.toLowerCase())) { codigo = `${(base || "unidade").slice(0, 36)}_${sufixo++}`; }
    setSalvandoUnidade(true); setMensagemUnidades("");
    const { error } = await (supabase as any).from("unidades").insert({ nome, codigo, ativa: true });
    setSalvandoUnidade(false);
    if (error) { setMensagemUnidades("Não foi possível cadastrar a unidade: " + error.message); return; }
    setNomeUnidadeNova("");
    setMensagemUnidades("Unidade cadastrada no ambiente de teste.");
    await carregar();
  };

  const excluirUnidadeTeste = async (unidade: Unidade) => {
    if (perfilAtual !== "gestor_central") {
      window.alert("Apenas o Gestor Geral pode excluir unidades no ambiente de teste.");
      return;
    }
    const nomeConfirmado = window.prompt(
      `EXCLUSÃO DEFINITIVA NO AMBIENTE DE TESTE\n\nUnidade: ${unidade.nome}\n\nA exclusão só será feita se não houver OS, usuários ou peças vinculadas. Para confirmar, digite exatamente o nome da unidade:`,
    );
    if (nomeConfirmado === null) return;
    if (nomeConfirmado !== unidade.nome) {
      window.alert("Exclusão cancelada: o nome digitado não corresponde exatamente ao nome da unidade.");
      return;
    }
    setMensagemUnidades("Conferindo vínculos e permissões...");
    try {
      const { data, error } = await (supabase as any).rpc("excluir_unidade_teste", {
        p_unidade_id: unidade.id,
        p_confirmacao: nomeConfirmado,
      });
      if (error) {
        const mensagem = "Exclusão não realizada: " + error.message;
        setMensagemUnidades(mensagem);
        window.alert(mensagem);
        return;
      }
      const resultado = data as { deleted?: boolean; unidade?: string; ordens_servico?: number; usuarios_vinculados?: number; pecas_catalogo?: number; message?: string };
      const mensagem = (resultado.message || "Operação concluída.") +
        `\nOS: ${resultado.ordens_servico ?? "—"}; usuários vinculados: ${resultado.usuarios_vinculados ?? "—"}; peças: ${resultado.pecas_catalogo ?? "—"}.`;
      setMensagemUnidades(mensagem);
      window.alert(mensagem);
      if (resultado.deleted) await carregar();
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      const mensagem = "Falha inesperada ao excluir unidade: " + detalhe;
      setMensagemUnidades(mensagem);
      window.alert(mensagem);
    }
  };

  const atualizarUnidade = async (unidade: Unidade, alteracoes: Record<string, unknown>) => {
    if (perfilAtual !== "gestor_central") return;
    setMensagemUnidades("");
    const { error } = await (supabase as any).from("unidades").update(alteracoes).eq("id", unidade.id);
    if (error) { setMensagemUnidades("Não foi possível atualizar a unidade: " + error.message); return; }
    setMensagemUnidades("Unidade atualizada.");
    await carregar();
  };

  const excluirPecaEstoqueTeste = async (peca: any) => {
    if (perfilAtual !== "gestor_central") {
      window.alert("Apenas o Gestor Geral pode excluir peças no ambiente de teste.");
      return;
    }
    const nomeConfirmado = window.prompt(
      `EXCLUSÃO DE PEÇA NO AMBIENTE DE TESTE\\n\\nPeça: ${peca.nome}\\nUnidade: ${unidades.find(u => u.id === peca.unidade_id)?.nome ?? "—"}\\nSaldo atual: ${peca.estoque_atual}\\n\\nMovimentações sem vínculo com OS serão removidas junto com a peça. Histórico vinculado a OS será preservado e bloqueará a exclusão.\\n\\nDigite exatamente o nome da peça para confirmar:`,
    );
    if (nomeConfirmado === null) return;
    if (nomeConfirmado !== peca.nome) {
      window.alert("Exclusão cancelada: o nome digitado não corresponde exatamente ao nome da peça.");
      return;
    }
    setSalvandoEstoque(true);
    setMensagemEstoque("Conferindo vínculos e permissões da peça...");
    try {
      const { data, error } = await (supabase as any).rpc("excluir_peca_estoque_teste", {
        p_peca_id: peca.id,
        p_confirmacao: nomeConfirmado,
      });
      if (error) {
        const mensagem = "Peça não excluída: " + error.message;
        setMensagemEstoque(mensagem);
        window.alert(mensagem);
        return;
      }
      const resultado = data as { deleted?: boolean; peca?: string; movimentacoes_removidas?: number };
      const mensagem = resultado.deleted
        ? `Peça "${resultado.peca ?? peca.nome}" excluída do estoque de teste. Movimentações removidas: ${resultado.movimentacoes_removidas ?? 0}.`
        : "A peça não foi excluída.";
      setMensagemEstoque(mensagem);
      window.alert(mensagem);
      if (resultado.deleted) await carregar();
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      setMensagemEstoque("Falha inesperada ao excluir a peça: " + detalhe);
    } finally {
      setSalvandoEstoque(false);
    }
  };

  const cadastrarPeca = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const unidadeId = perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId;
    if (!unidadeId || !nomePeca.trim()) { setMensagemEstoque("Selecione a unidade e informe o nome da peça."); return; }
    const inicial = Number(quantidadeInicial);
    const minimo = Number(estoqueMinimo);
    if (!Number.isInteger(inicial) || inicial < 0 || !Number.isInteger(minimo) || minimo < 0) { setMensagemEstoque("As quantidades devem ser números inteiros iguais ou maiores que zero."); return; }
    setSalvandoEstoque(true); setMensagemEstoque("");
    const db = supabase as any;
    const { data: userData } = await supabase.auth.getUser();
    const { data: peca, error } = await db.from("pecas_catalogo").insert({
      unidade_id: unidadeId, nome: nomePeca.trim(), estoque_atual: 0, estoque_minimo: minimo,
      criado_por_email: userData.user?.email ?? null, ativo: true,
    }).select("*").single();
    if (error) { setMensagemEstoque("Não foi possível cadastrar a peça: " + error.message); setSalvandoEstoque(false); return; }
    if (inicial > 0) {
      const { error: entradaError } = await db.rpc("registrar_entrada_estoque", { p_peca_id: peca.id, p_quantidade: inicial, p_observacao: "Saldo inicial do cadastro" });
      if (entradaError) { setMensagemEstoque("Peça cadastrada, mas não foi possível registrar o saldo inicial: " + entradaError.message); }
    }
    setNomePeca(""); setEstoqueMinimo("0"); setQuantidadeInicial("0"); setSalvandoEstoque(false);
    await carregar();
    if (!mensagemEstoque) setMensagemEstoque("Peça cadastrada no estoque da unidade.");
  };

  const registrarEntrada = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const qtd = Number(quantidadeEntrada);
    if (!pecaEntradaId || !Number.isInteger(qtd) || qtd <= 0) { setMensagemEstoque("Selecione uma peça e informe uma quantidade inteira maior que zero."); return; }
    setSalvandoEstoque(true); setMensagemEstoque("");
    const { error } = await (supabase as any).rpc("registrar_entrada_estoque", {
      p_peca_id: pecaEntradaId, p_quantidade: qtd, p_observacao: observacaoEntrada.trim() || null,
    });
    setSalvandoEstoque(false);
    if (error) { setMensagemEstoque("Não foi possível registrar a entrada: " + error.message); return; }
    setQuantidadeEntrada("1"); setObservacaoEntrada("");
    setMensagemEstoque("Entrada registrada e saldo atualizado.");
    await carregar();
  };

  const criarOS = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor" && perfilAtual !== "gestor_central") return;
    const unidadeId = perfilAtual === "admin_unidade" ? unidadeAtualId : formUnidadeCentral;
    if (!unidadeId) { setMensagemOS("Selecione a unidade para abrir a OS."); return; }
    setSalvandoNovaOS(true);
    setMensagemOS("");
    // A política RLS valida no banco se o usuário pode criar OS na unidade escolhida.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: authData } = await supabase.auth.getUser();
    const tecnico = usuariosAdmin.find(u => u.ativo && u.unidade_id === unidadeId && u.perfil === "tecnico" && (u.email.toLowerCase() === formNovaOS.tecnico_email.trim().toLowerCase() || u.nome.toLowerCase() === formNovaOS.tecnico_nome.trim().toLowerCase()));
    const { error } = await db.from("ordens_servico").insert({
      unidade_id: unidadeId,
      numero_os: formNovaOS.numero_os.trim(),
      frota: formNovaOS.frota.trim(),
      entrada: formNovaOS.entrada.trim() || null,
      criado_por_email: authData.user?.email ?? null,
      descricao: formNovaOS.descricao.trim(),
      setor: formNovaOS.setor.trim() || null,
      localizacao: formNovaOS.localizacao.trim() || null,
      tecnico_id: tecnico?.user_id ?? null,
      tecnico_email: tecnico?.email ?? (formNovaOS.tecnico_email.trim() || null),
      tecnico_nome: tecnico?.nome ?? (formNovaOS.tecnico_nome.trim() || null),
      status: "pendente",
    });
    setSalvandoNovaOS(false);
    if (error) { setMensagemOS("Não foi possível criar a OS: " + error.message); return; }
    setMensagemOS("OS criada com sucesso.");
    setFormNovaOS({ numero_os: "", frota: "", descricao: "", setor: "", localizacao: "", tecnico_nome: "", tecnico_email: "", entrada: "" });
    setModoGestao("menu");
    await carregar();
  };

  const parsearLinhas = (valor: string, usuariosDisponiveis: UsuarioAdministrado[] = usuariosAdmin): LinhaImportacao[] => {
    // Parser TSV/CSV simples que preserva quebras de linha dentro de células entre aspas.
    const primeiraLinha = valor.split(/\r?\n/, 1)[0] ?? "";
    const delimitador = primeiraLinha.includes("\t") ? "\t" : "|";
    const matriz: string[][] = [];
    let linha: string[] = [];
    let campo = "";
    let entreAspas = false;
    for (let i = 0; i < valor.length; i++) {
      const ch = valor[i];
      if (ch === '"') {
        if (entreAspas && valor[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = !entreAspas;
        }
      } else if (ch === delimitador && !entreAspas) {
        linha.push(campo.trim());
        campo = "";
      } else if ((ch === "\n" || ch === "\r") && !entreAspas) {
        if (ch === "\r" && valor[i + 1] === "\n") i++;
        linha.push(campo.trim());
        if (linha.some(c => c.trim())) matriz.push(linha);
        linha = [];
        campo = "";
      } else {
        campo += ch;
      }
    }
    if (campo.length || linha.length) {
      linha.push(campo.trim());
      if (linha.some(c => c.trim())) matriz.push(linha);
    }
    const semSeparadores = matriz.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c.trim())));
    if (!semSeparadores.length) return [];
    const normalizada = delimitador === "|" ? semSeparadores.map(r => {
      const inicio = r[0]?.trim() === "" ? 1 : 0;
      const fim = r[r.length - 1]?.trim() === "" ? r.length - 1 : r.length;
      return r.slice(inicio, fim);
    }) : semSeparadores;
    return normalizarMatriz(normalizada, usuariosDisponiveis);
  };

  const normalizarMatriz = (matriz: unknown[][], usuariosDisponiveis: UsuarioAdministrado[] = usuariosAdmin): LinhaImportacao[] => {
    const clean = (v: unknown) => String(v ?? "").replace(/<br\s*\/?>/gi, " ").replace(/&#x20;/gi, " ").replace(/&nbsp;/gi, " ").trim();
    const norm = (v: unknown) => clean(v).replace(/<[^>]*>/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const normNome = (v: unknown) => norm(v).replace(/_/g, "");
    const rows = matriz.filter(r => r.some(c => clean(c)) && !r.every(c => /^:?-{2,}:?$/.test(clean(c))));
    if (!rows.length) return [];
    const aliases: Record<string, string[]> = {
      sequencia: ["seq", "sequencia", "ordem", "ordem_de_exibicao", "prioridade"],
      setor: ["setor", "frente", "departamento", "area"],
      numero_os: ["o_s", "os", "numero_os", "numero_da_os", "n_os", "no_os", "num_os", "ordem_de_servico"],
      frota: ["frota", "viatura", "veiculo", "matricula", "prefixo", "equipamento"],
      entrada: ["entrada", "data_entrada", "data_hora_entrada", "data"],
      descricao: ["descricao_o_s", "descricao_os", "descricao", "problema", "servico", "observacao"],
      localizacao: ["localizacao", "local", "endereco", "fazenda"],
      tecnico: ["tecnico", "nome_tecnico", "tecnico_nome", "responsavel", "mecanico", "tecnico_email", "email_tecnico"],
    };
    const canonical = (v: unknown) => { const h = norm(v); for (const [key, names] of Object.entries(aliases)) if (names.includes(h)) return key; if (/(^|_)(tecnico|mecanico|responsavel)(_|$)/.test(h) || h.startsWith("nome_do_tecnico") || h.startsWith("tecnico_")) return "tecnico"; if (h.startsWith("descricao_") || h.endsWith("_descricao")) return "descricao"; if (h.startsWith("localizacao_") || h.endsWith("_localizacao")) return "localizacao"; return h; };
    const headerIndex = rows.findIndex(r => { const hs = r.map(canonical); return hs.includes("numero_os") && hs.includes("frota") && (hs.includes("tecnico") || hs.includes("descricao") || hs.includes("entrada")); });
    const headerOriginal = headerIndex >= 0 ? rows[headerIndex] : [];
    const header = headerIndex >= 0 ? headerOriginal.map(canonical) : ["sequencia", "setor", "numero_os", "frota", "entrada", "descricao", "localizacao", "tecnico"];
    const data = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
    const get = (row: unknown[], key: string) => {
      // Para Técnico, prioriza a coluna cujo cabeçalho é literalmente "Técnico".
      // Evita capturar uma coluna auxiliar (ex.: Técnico Email) que também vira "tecnico" após normalização.
      const exactTechnicianIndex = key === "tecnico" ? headerOriginal.findIndex(c => norm(c) === "tecnico") : -1;
      const i = exactTechnicianIndex >= 0 ? exactTechnicianIndex : header.indexOf(key);
      return i >= 0 ? clean(row[i]) : "";
    };
    const unidadeId = perfilAtual === "admin_unidade" ? unidadeAtualId : formUnidadeCentral;
    const parsed = data.filter(r => r.some(c => clean(c))).map((row, rowIndex) => {
      const seqRaw = get(row, "sequencia"); const seqParsed = Number(seqRaw);
      const numero = get(row, "numero_os").replace(/\s+/g, "").trim();
      const frota = get(row, "frota").trim();
      const tecnicoRaw = get(row, "tecnico").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const matched = tecnicoRaw ? usuariosDisponiveis.find(u => u.ativo && u.perfil === "tecnico" && u.unidade_id === unidadeId && (norm(u.email) === norm(tecnicoRaw) || normNome(u.nome) === normNome(tecnicoRaw))) : undefined;
      let entrada = get(row, "entrada");
      if (/^\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{1,2}:\d{2})?$/.test(entrada)) { const parts = entrada.split(/\s+/); const d = parts[0].split("/"); entrada = d[2] + "-" + d[1].padStart(2,"0") + "-" + d[0].padStart(2,"0") + " " + (parts[1] || "00:00"); }
      return { numero_os: numero, frota, entrada, descricao: get(row, "descricao"), localizacao: get(row, "localizacao"), setor: get(row, "setor"), sequencia: Number.isFinite(seqParsed) && seqRaw !== "" ? seqParsed : rowIndex + 1, tecnico_email: matched?.email ?? "", tecnico_nome: matched?.nome ?? tecnicoRaw, tecnico_original: tecnicoRaw, tecnico_valido: !tecnicoRaw || Boolean(matched), valid: Boolean(numero && frota && (!tecnicoRaw || matched)) };
    });
    // A sequência é a posição de exibição. Ordena pela coluna Seq e corrige repetições para garantir 1, 2, 3… sem duplicar a posição.
    parsed.sort((a, b) => (a.sequencia ?? Number.MAX_SAFE_INTEGER) - (b.sequencia ?? Number.MAX_SAFE_INTEGER));
    const usados = new Set<number>(); let proxima = 1;
    return parsed.map(l => { let seq = l.sequencia; if (seq == null || usados.has(seq)) { while (usados.has(proxima)) proxima++; seq = proxima; } usados.add(seq); proxima = Math.max(proxima, seq + 1); return { ...l, sequencia: seq }; });
  };
  const salvarImportacao = async () => {
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor" && perfilAtual !== "gestor_central") {
      setMensagemOS("Importação não permitida para este perfil (" + String(perfilAtual || "não identificado") + "). Entre com o Gestor Central ou ADM da unidade no ambiente de teste.");
      return;
    }
    const unidadeId = perfilAtual === "admin_unidade" ? unidadeAtualId : formUnidadeCentral;
    if (!unidadeId) { setMensagemOS("Selecione a unidade para importar."); return; }
    const semVinculo = linhasImportacao.filter(l => Boolean(l.tecnico_original) && !l.tecnico_valido);
    if (semVinculo.length) {
      setMensagemOS(`Importação bloqueada: ${semVinculo.length} linha(s) têm um técnico informado, mas sem vínculo ativo nesta unidade. Corrija o nome/e-mail ou deixe a coluna Técnico em branco para importar sem atribuição.`);
      return;
    }
    const validas = linhasImportacao.filter(l=>l.valid);
    if (!validas.length) { setMensagemOS("Nenhuma linha válida para importar. Confira o número da OS e a frota; o técnico é opcional."); return; }
    setSalvandoLote(true); setMensagemOS("");
    const db = supabase as any;
    const {data: authData} = await supabase.auth.getUser();
    let criadas=0, atualizadas=0;
    try {
      const unicas = new Map<string,LinhaImportacao>();
      validas.forEach(l=>unicas.set(l.numero_os,l));
      for (const l of unicas.values()) {
        const normTecnico = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const tecnico = usuariosAdmin.find(u=>u.ativo && u.perfil==="tecnico" && u.unidade_id===unidadeId && (normTecnico(u.email)===normTecnico(l.tecnico_email || l.tecnico_original) || normTecnico(u.nome)===normTecnico(l.tecnico_nome || l.tecnico_original)));
        const payload = {numero_os:l.numero_os,frota:l.frota,entrada:l.entrada||null,descricao:l.descricao||null,localizacao:l.localizacao||null,setor:l.setor||null,sequencia:l.sequencia,tecnico_id:tecnico?.user_id??null,tecnico_email:tecnico?.email??(l.tecnico_original ? (l.tecnico_email || null) : null),tecnico_nome:tecnico?.nome??(l.tecnico_original ? (l.tecnico_nome || l.tecnico_original) : null),criado_por_email:authData.user?.email??null,status:"pendente"};
        const {data:existing,error:lookupError}=await db.from("ordens_servico").select("id").eq("unidade_id",unidadeId).eq("numero_os",l.numero_os).order("created_at",{ascending:true}).limit(1).maybeSingle();
        if(lookupError) throw lookupError;
        if(existing){const {error}=await db.from("ordens_servico").update(payload).eq("id",existing.id).eq("unidade_id",unidadeId);if(error)throw error;atualizadas++;}
        else {const {error}=await db.from("ordens_servico").insert({...payload,unidade_id:unidadeId});if(error)throw error;criadas++;}
      }
      setMensagemOS("Importação concluída: " + criadas + " nova(s) e " + atualizadas + " atualizada(s) nesta unidade.");
      setLinhasImportacao([]);setTextoPlanilha("");setNomeArquivo("");setModoGestao("menu");
      await carregar();
    } catch(error) { setMensagemOS("A importação falhou: "+(error instanceof Error?error.message:"erro desconhecido")); }
    finally {setSalvandoLote(false);}
  };

  const transferirOrdensSelecionadas = async () => {
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor" && perfilAtual !== "gestor_central") return;
    if (!ordensSelecionadasTransferencia.length || !tecnicoDestinoTransferencia) return;
    const tecnico = usuariosAdmin.find(u => u.user_id === tecnicoDestinoTransferencia && u.ativo && u.perfil === "tecnico");
    if (!tecnico) { setMensagemOS("Selecione um técnico ativo."); return; }
    const selecionadas = ordens.filter(o => ordensSelecionadasTransferencia.includes(o.id));
    if (selecionadas.length !== ordensSelecionadasTransferencia.length) { setMensagemOS("Atualize a seleção: uma ou mais OS não foram encontradas."); return; }
    if (selecionadas.some(o => o.status !== "pendente")) { setMensagemOS("Só é permitido transferir OS com status Pendente. Desmarque as demais OS."); return; }
    if (selecionadas.some(o => o.unidade_id !== tecnico.unidade_id)) { setMensagemOS("O técnico selecionado precisa pertencer à mesma unidade de todas as OS selecionadas."); return; }
    if (!window.confirm(`Transferir ${selecionadas.length} OS pendente(s) para ${tecnico.nome}?`)) return;
    setTransferindoOS(true); setMensagemOS("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    for (const ordem of selecionadas) {
      const { error } = await db.from("ordens_servico").update({ tecnico_id: tecnico.user_id, tecnico_email: tecnico.email, tecnico_nome: tecnico.nome }).eq("id", ordem.id).eq("unidade_id", ordem.unidade_id);
      if (error) { setMensagemOS(`A transferência foi interrompida na OS ${ordem.numero_os || ordem.frota || ordem.id}: ${error.message}`); setTransferindoOS(false); await carregar(); return; }
    }
    setMensagemOS(`${selecionadas.length} OS transferida(s) para ${tecnico.nome}.`);
    setOrdensSelecionadasTransferencia([]); setTecnicoDestinoTransferencia(""); setTransferindoOS(false); await carregar();
  };

  const excluirOS = async (ordem: Ordem) => {
    if (perfilAtual !== "gestor_central" || emailUsuarioAtual !== "faber.alexsandro2011@gmail.com") return;
    if (!window.confirm("Excluir a OS " + (ordem.numero_os || ordem.frota || ordem.id) + " desta unidade? Esta ação não pode ser desfeita.")) return;
    // A exclusão é restringida ao registro da unidade e também validada pela RLS do banco de teste.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db.from("ordens_servico").delete().eq("id", ordem.id).eq("unidade_id", ordem.unidade_id);
    if (error) { setMensagemOS("Não foi possível excluir a OS: " + error.message); return; }
    setMensagemOS("OS excluída do ambiente de teste.");
    if (edicaoOS?.id === ordem.id) setEdicaoOS(null);
    await carregar();
  };

  const salvarEdicaoOS = async () => {
    if (!edicaoOS || perfilAtual !== "gestor_central" || emailUsuarioAtual !== "faber.alexsandro2011@gmail.com") return;
    setSalvandoOS(true);
    setMensagemOS("");
    // A política RLS do banco de teste limita o UPDATE às OS da unidade do ADM.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const unidadeDaOS = ordens.find(o => o.id === edicaoOS.id)?.unidade_id;
    const { error } = await db.from("ordens_servico").update({
      numero_os: edicaoOS.numero_os.trim() || null,
      frota: edicaoOS.frota.trim() || null,
      descricao: edicaoOS.descricao.trim(),
      setor: edicaoOS.setor.trim() || null,
      tecnico_nome: edicaoOS.tecnico_nome.trim() || null,
      status: edicaoOS.status,
      pecas_utilizadas: edicaoOS.pecas_utilizadas.trim() || null,
    }).eq("id", edicaoOS.id).eq("unidade_id", unidadeDaOS);
    setSalvandoOS(false);
    if (error) {
      setMensagemOS("Não foi possível salvar: " + error.message);
      return;
    }
    setMensagemOS("OS atualizada com sucesso.");
    setEdicaoOS(null);
    await carregar();
  };

  const fecharNoPIMS = async (ordem: Ordem) => {
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor" && perfilAtual !== "gestor_central") {
      setMensagemOS("Seu perfil não tem permissão para fechar OS no PIMS.");
      return;
    }
    if (ordem.status !== "concluida" || ordem.fechada_em) {
      setMensagemOS("Esta OS não está aguardando fechamento oficial.");
      return;
    }
    const identificador = ordem.numero_os || ordem.frota || ordem.id;
    if (!window.confirm(`Confirmar o fechamento oficial no PIMS da OS ${identificador}?`)) return;
    setSalvandoOS(true);
    setMensagemOS("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setMensagemOS("Não foi possível confirmar o usuário conectado. Entre novamente e tente fechar a OS.");
      setSalvandoOS(false);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("ordens_servico")
      .update({ fechada_em: new Date().toISOString(), fechada_por_email: authData.user.email ?? null })
      .eq("id", ordem.id)
      .eq("unidade_id", ordem.unidade_id)
      .is("fechada_em", null)
      .select("id")
      .maybeSingle();
    setSalvandoOS(false);
    if (error) {
      setMensagemOS("Não foi possível fechar no PIMS: " + error.message);
      return;
    }
    if (!data) {
      setMensagemOS("A OS já foi fechada por outro usuário ou não está mais aguardando fechamento.");
      await carregar();
      return;
    }
    setOrdemDetalhes(null);
    setStatusFiltro("concluida");
    setMensagemOS(`OS ${identificador} fechada oficialmente e transferida para Concluídas.`);
    await carregar();
  };

  const executarAcaoUsuario = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("gerenciar-usuarios-teste", { body: payload });
    if (error) {
      let mensagem = error.message || "Falha ao comunicar com o serviço administrativo.";
      try {
        const contexto = (error as { context?: Response }).context;
        if (contexto && typeof contexto.clone === "function") {
          const detalhe = await contexto.clone().json();
          if (typeof detalhe?.error === "string" && detalhe.error) mensagem = detalhe.error;
        }
      } catch { /* Mantém a mensagem padrão se a resposta não trouxer JSON. */ }
      throw new Error(mensagem);
    }
    if (!data?.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
    return data;
  };

  const carregarUsuariosAdmin = async (): Promise<UsuarioAdministrado[]> => {
    setCarregandoUsuarios(true);
    setErroUsuarios("");
    try {
      const data = await executarAcaoUsuario({ action: "list" });
      const lista = (data.users ?? []) as UsuarioAdministrado[];
      setUsuariosAdmin(lista);
      return lista;
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível listar usuários.");
      return [];
    } finally {
      setCarregandoUsuarios(false);
    }
  };

  const criarUsuario = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const perfilCriado: PerfilUsuario = perfilAtual === "admin_unidade" ? "tecnico" : perfilNovo;
    const codigoUnidadeADM = unidades.find((unidade) => unidade.id === unidadeAtualId)?.codigo ?? "";
    setSalvandoUsuario(true);
    setErroUsuarios("");
    setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({
        action: "create", nome: nomeNovo, email: emailNovo, password: senhaNova,
        perfil: perfilCriado,
        unidade_codigo: (perfilCriado === "gestor_central" || perfilCriado === "gestor") ? "" : perfilAtual === "admin_unidade" ? codigoUnidadeADM : unidadeNova,
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

  const salvarNomePerfil = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nome = nomePerfil.trim();
    if (!usuarioAtualId || nome.length < 2 || nome.length > 120) {
      setErroUsuarios("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setSalvandoNomePerfil(true);
    setErroUsuarios("");
    setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({ action: "update", user_id: usuarioAtualId, nome });
      setMensagemUsuarios("Nome do Gestor Geral atualizado no ambiente de teste.");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível atualizar o nome.");
    } finally {
      setSalvandoNomePerfil(false);
    }
  };

  const atualizarUsuario = async (usuario: UsuarioAdministrado, perfil: PerfilUsuario, unidadeCodigo: string) => {
    setErroUsuarios(""); setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({
        action: "update", user_id: usuario.user_id, perfil,
        ...((perfil === "gestor_central" || perfil === "gestor") ? {} : { unidade_codigo: unidadeCodigo }),
      });
      setMensagemUsuarios("Perfil e unidade atualizados.");
      await carregarUsuariosAdmin();
      await carregar();
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
    }
  };

  const salvarSenhaUsuario = async (usuario: UsuarioAdministrado) => {
    if (emailUsuarioAtual !== "faber.alexsandro2011@gmail.com" || perfilAtual !== "gestor_central") {
      setErroUsuarios("Somente o Gestor Geral principal pode redefinir senhas.");
      return;
    }
    if (senhaUsuarioNova.length < 8 || senhaUsuarioNova.length > 128) {
      setErroUsuarios("A nova senha deve ter entre 8 e 128 caracteres.");
      return;
    }
    if (senhaUsuarioNova !== confirmarSenhaUsuarioNova) {
      setErroUsuarios("As senhas não coincidem.");
      return;
    }
    if (!window.confirm(`Redefinir a senha da conta ${usuario.email}? A senha atual não poderá ser recuperada.`)) return;
    setSalvandoSenhaUsuario(true);
    setErroUsuarios(""); setMensagemUsuarios("");
    try {
      await executarAcaoUsuario({ action: "update", user_id: usuario.user_id, password: senhaUsuarioNova });
      setMensagemUsuarios(`Senha redefinida para ${usuario.email}. Anote e compartilhe a nova senha com segurança.`);
      setUsuarioSenhaEdicao(null); setSenhaUsuarioNova(""); setConfirmarSenhaUsuarioNova("");
    } catch (error) {
      setErroUsuarios(error instanceof Error ? error.message : "Não foi possível redefinir a senha.");
    } finally {
      setSalvandoSenhaUsuario(false);
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
      const mensagem = error instanceof Error ? error.message : "Não foi possível excluir o usuário.";
      await carregarUsuariosAdmin();
      setErroUsuarios(mensagem);
    }
  };

  useEffect(() => { void carregar(); }, []);
  useEffect(() => { if (aba === "usuarios" || modoGestao === "criar" || modoGestao === "colar" || modoGestao === "importar") void carregarUsuariosAdmin(); }, [aba, modoGestao]);
  const carregarDispositivos = async () => {
    if (perfilAtual !== "gestor_central") return;
    setCarregandoDispositivos(true);
    setMensagemDispositivos("");
    const { data, error } = await (supabase as any).from("dispositivos_acesso")
      .select("id,user_id,user_email,device_id,nome_dispositivo,user_agent,bloqueado,criado_em,ultimo_acesso_em,bloqueado_em")
      .order("ultimo_acesso_em", { ascending: false });
    if (error) {
      setMensagemDispositivos("Não foi possível carregar os dispositivos: " + error.message);
      setDispositivos([]);
    } else {
      setDispositivos((data ?? []) as DispositivoAcesso[]);
    }
    setCarregandoDispositivos(false);
  };

  const administrarDispositivo = async (dispositivo: DispositivoAcesso, bloqueado: boolean, nome?: string) => {
    if (perfilAtual !== "gestor_central") return;
    const { error } = await (supabase as any).rpc("administrar_dispositivo_acesso", {
      p_dispositivo_id: dispositivo.id,
      p_bloqueado: bloqueado,
      p_nome_dispositivo: nome ?? null,
    });
    if (error) {
      setMensagemDispositivos("Não foi possível atualizar o dispositivo: " + error.message);
      return;
    }
    setMensagemDispositivos(bloqueado ? "Dispositivo bloqueado no ambiente de teste." : "Dispositivo desbloqueado no ambiente de teste.");
    await carregarDispositivos();
  };

  useEffect(() => {
    if (aba !== "dispositivos" || perfilAtual !== "gestor_central") return;
    void carregarDispositivos();
    const timer = window.setInterval(() => void carregarDispositivos(), 30000);
    return () => window.clearInterval(timer);
  }, [aba, perfilAtual]);


  const unidadesVisiveis = useMemo(
    () => perfilAtual === "admin_unidade"
      ? unidades.filter((unidade) => unidade.id === unidadeAtualId)
      : filtro === "Todas" ? unidades : unidades.filter((unidade) => unidade.nome === filtro),
    [filtro, unidades, perfilAtual, unidadeAtualId],
  );
  useEffect(() => { if ((perfilAtual === "gestor" || perfilAtual === "gestor_central") && !formUnidadeCentral && unidades.length) setFormUnidadeCentral(unidades[0].id); }, [perfilAtual, formUnidadeCentral, unidades]);
  useEffect(() => { const ativas = unidades.filter((unidade) => unidade.ativa !== false); if (perfilAtual === "gestor_central" && ativas.length && !ativas.some((unidade) => unidade.codigo === unidadeNova)) setUnidadeNova(ativas[0].codigo); }, [perfilAtual, unidades, unidadeNova]);
  useEffect(() => { if (perfilAtual === "admin_unidade" && unidadeAtualId) { const propria = unidades.find(u => u.id === unidadeAtualId); if (propria && filtro !== propria.nome) setFiltro(propria.nome); } }, [perfilAtual, unidadeAtualId, unidades, filtro]);
  const idsVisiveis = new Set(unidadesVisiveis.map((unidade) => unidade.id));
  const ordensVisiveis = ordens.filter((ordem) => idsVisiveis.has(ordem.unidade_id)).sort((a, b) => (a.sequencia ?? Number.MAX_SAFE_INTEGER) - (b.sequencia ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at));
  const resumoConsolidadoUnidades = unidadesVisiveis.map((unidade) => {
    const registros = ordensVisiveis.filter((ordem) => ordem.unidade_id === unidade.id);
    const concluidas = registros.filter((ordem) => ordem.status === "concluida" && Boolean(ordem.fechada_em));
    const canceladas = registros.filter((ordem) => ordem.status === "cancelada");
    const pendentes = registros.filter((ordem) => ordem.status === "pendente");
    const emAndamento = registros.filter((ordem) => ordem.status === "em_andamento");
    const tecnicos = new Set(registros.map((ordem) => (ordem.tecnico_email || ordem.tecnico_nome || "").trim().toLocaleLowerCase("pt-BR")).filter(Boolean));
    const duracoes = concluidas
      .filter((ordem) => ordem.data_inicio && ordem.concluida_em && new Date(ordem.concluida_em).getTime() >= new Date(ordem.data_inicio).getTime())
      .map((ordem) => (new Date(ordem.concluida_em!).getTime() - new Date(ordem.data_inicio!).getTime()) / 3_600_000);
    const mediaExecucao = duracoes.length ? duracoes.reduce((soma, horas) => soma + horas, 0) / duracoes.length : null;
    const baseTaxa = registros.length - canceladas.length;
    return { unidade, total: registros.length, pendentes: pendentes.length, emAndamento: emAndamento.length, concluidas: concluidas.length, canceladas: canceladas.length, tecnicos: tecnicos.size, taxaConclusao: baseTaxa > 0 ? Math.round(concluidas.length / baseTaxa * 100) : 0, mediaExecucao };
  });
  const formatarMediaExecucao = (horas: number | null) => horas === null ? "Sem dados" : horas < 1 ? Math.round(horas * 60) + " min" : horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " h";
  const abertas = ordensVisiveis.filter((ordem) => ordem.status === "pendente" || ordem.status === "em_andamento");
  const acima48h = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 48);
  const acima7d = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 168);
  const ordensPainelUnidade = ordemSelecionada ? ordensVisiveis.filter(ordem => ordem.unidade_id === ordemSelecionada) : [];
  const statusResumo = [
    { status: "Todas" as const, label: "Todas as OS", total: ordensPainelUnidade.length, icon: ClipboardList, color: "text-slate-100", active: "border-slate-300 bg-slate-800/70" },
    { status: "pendente" as const, label: "Pendentes", total: ordensPainelUnidade.filter(o => o.status === "pendente").length, icon: Circle, color: "text-amber-300", active: "border-amber-400 bg-amber-950/60" },
    { status: "em_andamento" as const, label: "Em andamento", total: ordensPainelUnidade.filter(o => o.status === "em_andamento").length, icon: PlayCircle, color: "text-sky-300", active: "border-sky-400 bg-sky-950/60" },
    { status: "aguardando_pims" as const, label: "Fechar no PIMS", total: ordensPainelUnidade.filter(o => o.status === "concluida" && !o.fechada_em).length, icon: Clock3, color: "text-amber-200", active: "border-amber-300 bg-amber-950/60" },
    { status: "concluida" as const, label: "Concluídas", total: ordensPainelUnidade.filter(o => o.status === "concluida" && Boolean(o.fechada_em)).length, icon: CheckCircle2, color: "text-lime-300", active: "border-lime-400 bg-lime-950/50" },
    { status: "cancelada" as const, label: "Canceladas", total: ordensPainelUnidade.filter(o => o.status === "cancelada").length, icon: XCircle, color: "text-rose-300", active: "border-rose-400 bg-rose-950/50" },
  ];
  const rotuloSituacaoOS = (o: Ordem) => o.status === "concluida"
    ? (o.fechada_em ? "Concluída" : "Aguardando fechamento no PIMS")
    : (({ pendente: "Pendente", em_andamento: "Em andamento", cancelada: "Cancelada" } as Record<string, string>)[o.status] || o.status);
  const ordensFiltradasPainel = ordensPainelUnidade.filter(ordem => {
    const statusOk = statusFiltro === "Todas"
      || (statusFiltro === "aguardando_pims" ? ordem.status === "concluida" && !ordem.fechada_em : statusFiltro === "concluida" ? ordem.status === "concluida" && Boolean(ordem.fechada_em) : ordem.status === statusFiltro);
    const termo = buscaOS.trim().toLocaleLowerCase("pt-BR");
    const texto = [ordem.numero_os, ordem.frota, ordem.descricao, ordem.setor, ordem.localizacao, ordem.tecnico_nome, unidades.find(u => u.id === ordem.unidade_id)?.nome].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const corresponde = (valor: string | null | undefined, selecionados: string[]) => selecionados.length === 0 || selecionados.includes(valor?.trim() || "—");
    const idadeFaixa = (o: Ordem) => { const h = idadeEmHoras(o.created_at); return h < 24 ? "Até 24h" : h < 48 ? "24–48h" : h < 168 ? "2–7 dias" : h < 360 ? "7–15 dias" : "Mais de 15 dias"; };
    const situacaoLabel = rotuloSituacaoOS;
    return statusOk && (!termo || texto.includes(termo))
      && corresponde(situacaoLabel(ordem), filtrosColuna.situacao)
      && corresponde(ordem.numero_os, filtrosColuna.os)
      && corresponde(ordem.frota, filtrosColuna.frota)
      && corresponde(ordem.setor, filtrosColuna.setor)
      && corresponde(ordem.tecnico_nome, filtrosColuna.tecnico)
      && corresponde(ordem.descricao, filtrosColuna.descricao)
      && corresponde(ordem.entrada, filtrosColuna.entrada)
      && corresponde(idadeFaixa(ordem), filtrosColuna.idade);
  }).sort((a, b) => {
    const valor = (o: Ordem): string | number => ordenacaoColuna.chave === "situacao" ? rotuloSituacaoOS(o)
      : ordenacaoColuna.chave === "os" ? (o.numero_os || "")
      : ordenacaoColuna.chave === "frota" ? (o.frota || "")
      : ordenacaoColuna.chave === "setor" ? (o.setor || "")
      : ordenacaoColuna.chave === "tecnico" ? (o.tecnico_nome || "")
      : ordenacaoColuna.chave === "descricao" ? (o.descricao || "")
      : ordenacaoColuna.chave === "entrada" ? (o.entrada || "")
      : idadeEmHoras(o.created_at);
    const va = valor(a), vb = valor(b);
    const comparacao = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).toLocaleLowerCase("pt-BR").localeCompare(String(vb).toLocaleLowerCase("pt-BR"), "pt-BR", { numeric: true, sensitivity: "base" });
    return ordenacaoColuna.direcao === "asc" ? comparacao : -comparacao;
  });
  const valorFiltroPainel = (o: Ordem, chave: "situacao" | "os" | "frota" | "setor" | "tecnico" | "descricao" | "entrada" | "idade") => {
    if (chave === "situacao") return rotuloSituacaoOS(o);
    if (chave === "os") return o.numero_os?.trim() || "—";
    if (chave === "frota") return o.frota?.trim() || "—";
    if (chave === "setor") return o.setor?.trim() || "—";
    if (chave === "tecnico") return o.tecnico_nome?.trim() || "—";
    if (chave === "descricao") return o.descricao?.trim() || "—";
    if (chave === "entrada") return o.entrada?.trim() || "—";
    const h = idadeEmHoras(o.created_at);
    return h < 24 ? "Até 24h" : h < 48 ? "24–48h" : h < 168 ? "2–7 dias" : h < 360 ? "7–15 dias" : "Mais de 15 dias";
  };
  const opcoesFiltroPainel = (chave: "situacao" | "os" | "frota" | "setor" | "tecnico" | "descricao" | "entrada" | "idade") => [...new Set(ordensPainelUnidade.map(o => valorFiltroPainel(o, chave)))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
  const ordensHistoricoFiltradas = ordensVisiveis.filter((ordem) => {
    const termo = historicoBusca.trim().toLocaleLowerCase("pt-BR");
    const unidadeNome = unidades.find((u) => u.id === ordem.unidade_id)?.nome ?? "";
    const texto = [ordem.numero_os, ordem.frota, ordem.descricao, ordem.setor, ordem.localizacao, ordem.tecnico_nome, ordem.tecnico_email, ordem.classe_manutencao, ordem.pecas_utilizadas, unidadeNome, ordem.status]
      .flatMap((v) => Array.isArray(v) ? v : [v]).filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const data = String(ordem.created_at ?? "").slice(0, 10);
    return (!termo || texto.includes(termo))
      && (historicoStatus === "Todas" || ordem.status === historicoStatus)
      && (!historicoFrota || String(ordem.frota ?? "") === historicoFrota)
      && (!historicoSetor || String(ordem.setor ?? "") === historicoSetor)
      && (!historicoTecnico || String(ordem.tecnico_nome ?? "") === historicoTecnico)
      && (!historicoDataInicial || data >= historicoDataInicial)
      && (!historicoDataFinal || data <= historicoDataFinal);
  }).sort((a, b) => {
    const valorHistorico = (ordem: Ordem, chave: typeof ordenacaoHistorico.chave): string | number => {
      if (chave === "unidade") return unidades.find((u) => u.id === ordem.unidade_id)?.nome ?? "";
      if (chave === "os") return ordem.numero_os ?? "";
      if (chave === "frota") return ordem.frota ?? "";
      if (chave === "setor") return ordem.setor ?? "";
      if (chave === "descricao") return ordem.descricao ?? "";
      if (chave === "localizacao") return ordem.localizacao ?? "";
      if (chave === "tecnico") return ordem.tecnico_nome ?? ordem.tecnico_email ?? "";
      if (chave === "classe") return Array.isArray(ordem.classe_manutencao) ? ordem.classe_manutencao.join(", ") : ordem.classe_manutencao ?? "";
      if (chave === "pecas") return ordem.pecas_utilizadas ?? "";
      if (chave === "status") return ({ pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" } as Record<string, string>)[ordem.status] ?? ordem.status;
      if (chave === "entrada") return ordem.entrada ?? "";
      if (chave === "criado") return ordem.created_at ? new Date(ordem.created_at).getTime() : 0;
      if (chave === "inicio") return ordem.data_inicio ? new Date(ordem.data_inicio).getTime() : 0;
      if (chave === "conclusao") return ordem.concluida_em ? new Date(ordem.concluida_em).getTime() : 0;
      return ordem.id;
    };
    const av = valorHistorico(a, ordenacaoHistorico.chave);
    const bv = valorHistorico(b, ordenacaoHistorico.chave);
    const comparacao = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
    return ordenacaoHistorico.direcao === "asc" ? comparacao : -comparacao;
  });
  const exportarHistoricoOS = () => {
    const linhas = ordensHistoricoFiltradas.map((ordem) => {
      const unidadeNome = unidades.find((u) => u.id === ordem.unidade_id)?.nome ?? "";
      const registro: Record<string, unknown> = { Unidade: unidadeNome };
      for (const [chave, valor] of Object.entries(ordem as unknown as Record<string, unknown>)) {
        const nome = chave.replace(/_/g, " ").replace(/\b\w/g, (letra) => letra.toLocaleUpperCase("pt-BR"));
        const camposData = ["created_at", "entrada", "data_inicio", "concluida_em", "fechada_em", "createdAt", "updated_at"];
        registro[nome] = Array.isArray(valor) ? valor.join(", ") : camposData.includes(chave) && valor ? formatarDataBR(String(valor), chave !== "entrada") : valor;
      }
      return registro;
    });
    const planilha = utils.json_to_sheet(linhas);
    planilha["!cols"] = Object.keys(linhas[0] ?? {}).map((chave) => ({ wch: Math.min(38, Math.max(14, chave.length + 2)) }));
    const livro = utils.book_new();
    utils.book_append_sheet(livro, planilha, "Histórico de OS");
    const metadados = utils.aoa_to_sheet([
      ["Central OS — Histórico detalhado"],
      ["Exportado em", new Date().toLocaleString("pt-BR")],
      ["Filtros", `Status: ${historicoStatus}; unidade: ${filtro}; período de criação: ${historicoDataInicial || "início"} a ${historicoDataFinal || "hoje"}`],
      ["Registros exportados", linhas.length],
    ]);
    utils.book_append_sheet(livro, metadados, "Resumo da exportação");
    writeFile(livro, `historico_os_${formatarDataBR(new Date()).replace(/\\//g,"-")}.xlsx`);
  };

  const opcoesFiltroColuna = {
    os: [...new Set(ordensVisiveis.map(o => o.numero_os?.trim() || "—"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
    frota: [...new Set(ordensVisiveis.map(o => o.frota?.trim() || "—"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
    setor: [...new Set(ordensVisiveis.map(o => o.setor?.trim() || "—"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
    localizacao: [...new Set(ordensVisiveis.map(o => o.localizacao?.trim() || "—"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
    tecnico: [...new Set(ordensVisiveis.map(o => o.tecnico_nome?.trim() || "—"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
  };
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
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="z-20 flex w-full shrink-0 flex-col border-b border-emerald-800 bg-[#00251f] md:min-h-screen md:w-56 md:border-b-0 md:border-r">
          <div className="border-b border-emerald-800 px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-300 text-emerald-950"><Building2 size={24}/></div>
              <div><div className="text-xl font-extrabold tracking-tight">Central OS</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">Painel de operações</div></div>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-950/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-300"/> Ambiente de teste</div>
          </div>
          <nav aria-label="Menu principal" className="flex gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:overflow-visible">
            <button type="button" onClick={() => {setAba("inicio");setGestaoOSAberta(false);setModoGestao("fechado");}} aria-current={aba === "inicio" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "inicio" ? "bg-lime-300 text-emerald-950 shadow-lg shadow-black/10" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><Building2 size={18}/>Página Inicial</button>
            <button type="button" onClick={() => {setAba("gestao_os");setGestaoOSAberta(true);setModoGestao("menu");setSolicitacaoEmEdicao(null);}} aria-current={aba === "gestao_os" && modoGestao !== "solicitacoes" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "gestao_os" && modoGestao !== "solicitacoes" ? "bg-lime-300 text-emerald-950 shadow-lg shadow-black/10" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><ClipboardList size={18}/>Gestão de OS<span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-emerald-950">{ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length}</span></button>
            <button type="button" onClick={() => setAba("historico")} aria-current={aba === "historico" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "historico" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><FileSpreadsheet size={18}/>Histórico de OS</button>
            <button type="button" onClick={() => setAba("analise")} aria-current={aba === "analise" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "analise" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><ShieldAlert size={18}/>Análise Técnica</button>
            {(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <button type="button" onClick={() => setAba("estoque")} aria-current={aba === "estoque" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "estoque" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><ClipboardList size={18}/>Estoque de Peças</button>}
            {perfilAtual === "gestor_central" && <button type="button" onClick={() => setAba("dispositivos")} aria-current={aba === "dispositivos" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "dispositivos" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><MonitorSmartphone size={18}/>Dispositivos</button>}
            {perfilAtual === "gestor_central" && <button type="button" onClick={() => setAba("unidades")} aria-current={aba === "unidades" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "unidades" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><Building2 size={18}/>Gestão de Unidades</button>}
            {(perfilAtual === "gestor_central" || perfilAtual === "admin_unidade") && <button type="button" onClick={() => setAba("usuarios")} aria-current={aba === "usuarios" ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition md:w-full ${aba === "usuarios" ? "bg-lime-300 text-emerald-950" : "text-emerald-100/80 hover:bg-emerald-900/70 hover:text-white"}`}><Users size={18}/>{perfilAtual === "admin_unidade" ? "Técnicos da Unidade" : "Gestão de Usuários"}</button>}
          </nav>
          <div className="hidden border-t border-emerald-800 p-4 text-[11px] leading-relaxed text-emerald-100/45 md:block">Central OS · Gestão de manutenção multiunidade<br/>Área isolada para testes e validação.</div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-emerald-800/80 bg-[#002b25]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{({inicio:"Visão geral",gestao_os:"Gestão de OS",historico:"Histórico de OS",solicitacoes:"Solicitações",analise:"Análise Técnica",estoque:"Estoque de Peças",unidades:"Gestão de Unidades",dispositivos:"Dispositivos e acessos",usuarios:perfilAtual === "admin_unidade" ? "Técnicos da Unidade" : "Gestão de Usuários"} as Record<string,string>)[aba] || "Painel"}</div><div className="mt-1 text-xs text-emerald-100/55">Acompanhe a operação em um só lugar</div></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-emerald-100/75">Unidade
                  <select value={perfilAtual === "admin_unidade" ? (unidades.find(u => u.id === unidadeAtualId)?.nome ?? "") : filtro} onChange={(e) => setFiltro(e.target.value)} disabled={perfilAtual === "admin_unidade"} className="max-w-[180px] rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white">
                    {perfilAtual !== "admin_unidade" && <option>Todas</option>}{(perfilAtual === "admin_unidade" ? unidades.filter(u => u.id === unidadeAtualId) : unidades).map((unidade) => <option key={unidade.id}>{unidade.nome}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => void carregar()} disabled={carregando} aria-label="Atualizar painel" title="Atualizar painel" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-900 disabled:opacity-50"><RefreshCw size={14} className={carregando ? "animate-spin" : ""}/><span className="hidden sm:inline">Atualizar</span></button>
                <button type="button" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) { window.alert("Não foi possível encerrar a sessão: " + error.message); return; } window.location.assign("/"); }} title="Sair da conta" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-100/70 transition hover:bg-emerald-900 hover:text-white"><LogOut size={14}/><span className="hidden sm:inline">Sair</span></button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
        {aba === "inicio" && <section className="space-y-6">
          <div className="rounded-xl border border-emerald-800 bg-gradient-to-br from-[#06483c] via-[#003b32] to-[#002e28] px-4 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-lime-300">Painel de operações</p>
            <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">Resumo das ordens de serviço</h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-emerald-100/70">Acompanhe as OS de todas as unidades e selecione uma unidade para analisar suas ordens.</p>
            <p className="mt-2 text-[11px] text-emerald-100/45">Unidade em exibição: {filtro === "Todas" ? "Todas as unidades permitidas" : filtro}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={<ClipboardList/>} label="OS abertas" value={abertas.length} accent="text-lime-300" compact/>
            <Metric icon={<Clock3/>} label="Abertas há mais de 48h" value={acima48h.length} accent="text-amber-300" compact/>
            <Metric icon={<ShieldAlert/>} label="Abertas há mais de 7 dias" value={acima7d.length} accent="text-rose-300" compact/>
            <Metric icon={<AlertTriangle/>} label="OS aberta mais antiga" value={maisAntiga ? formatarIdade(maisAntiga.created_at) : "—"} accent="text-sky-200" compact/>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Resumo geral por situação">
            <Metric icon={<ClipboardList/>} label="Total de OS" value={ordensVisiveis.length} accent="text-slate-100" compact/>
            <Metric icon={<Circle/>} label="Pendentes" value={ordensVisiveis.filter(o => o.status === "pendente").length} accent="text-amber-300" compact/>
            <Metric icon={<PlayCircle/>} label="Em andamento" value={ordensVisiveis.filter(o => o.status === "em_andamento").length} accent="text-sky-300" compact/>
            <Metric icon={<Clock3/>} label="Fechar no PIMS" value={ordensVisiveis.filter(o => o.status === "concluida" && !o.fechada_em).length} accent="text-orange-200" compact/>
            <Metric icon={<CheckCircle2/>} label="Fechadas" value={ordensVisiveis.filter(o => o.status === "concluida" && Boolean(o.fechada_em)).length} accent="text-lime-300" compact/>
          </div>
          <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-extrabold">Comparativo visual por unidade</h2><p className="mt-1 text-xs text-emerald-100/60">Clique em uma barra para abrir a lista de OS daquela unidade e situação.</p></div>
              <button type="button" onClick={() => setAba("analise")} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-lime-200 transition hover:bg-emerald-900">Abrir análise técnica →</button>
            </div>
            <div className="mt-4 h-[280px] w-full" role="img" aria-label="Gráfico comparativo de ordens por situação e unidade">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumoConsolidadoUnidades.map(item => ({ unidade: item.unidade.nome, pendentes: item.pendentes, andamento: item.emAndamento, concluidas: item.concluidas }))} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f5b4e" />
                  <XAxis dataKey="unidade" tick={{ fill: "#b7d5ca", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#356b5e" }} />
                  <YAxis allowDecimals={false} width={34} tick={{ fill: "#b7d5ca", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#002b25", border: "1px solid #286052", borderRadius: 10, color: "#f0fdf4" }} labelStyle={{ color: "#d1fae5" }} />
                  <Legend wrapperStyle={{ color: "#d1fae5", fontSize: 12 }} />
                  <Bar dataKey="pendentes" name="Pendentes" fill="#fbbf24" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data) => { const nome = data?.payload?.unidade; const unidade = unidadesVisiveis.find((u) => u.nome === nome); if (!unidade) return; setOrdemSelecionada(unidade.id); setStatusFiltro("pendente"); setBuscaOS(""); setFiltrosColuna({situacao:[],os:[],frota:[],setor:[],tecnico:[],descricao:[],entrada:[],idade:[],localizacao:[]}); }}><LabelList dataKey="pendentes" position="top" fill="#fef3c7" fontSize={11} fontWeight={700} /></Bar>
                  <Bar dataKey="andamento" name="Em andamento" fill="#38bdf8" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data) => { const nome = data?.payload?.unidade; const unidade = unidadesVisiveis.find((u) => u.nome === nome); if (!unidade) return; setOrdemSelecionada(unidade.id); setStatusFiltro("em_andamento"); setBuscaOS(""); setFiltrosColuna({situacao:[],os:[],frota:[],setor:[],tecnico:[],descricao:[],entrada:[],idade:[],localizacao:[]}); }}><LabelList dataKey="andamento" position="top" fill="#e0f2fe" fontSize={11} fontWeight={700} /></Bar>
                  <Bar dataKey="concluidas" name="Concluídas" fill="#bef264" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data) => { const nome = data?.payload?.unidade; const unidade = unidadesVisiveis.find((u) => u.nome === nome); if (!unidade) return; setOrdemSelecionada(unidade.id); setStatusFiltro("concluida"); setBuscaOS(""); setFiltrosColuna({situacao:[],os:[],frota:[],setor:[],tecnico:[],descricao:[],entrada:[],idade:[],localizacao:[]}); }}><LabelList dataKey="concluidas" position="top" fill="#ecfccb" fontSize={11} fontWeight={700} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <section>
            <div className="mb-3"><h2 className="text-xl font-extrabold">Analisar OS por unidade</h2><p className="mt-1 text-sm text-emerald-100/65">Selecione uma unidade para ver os totais e consultar as OS antigas e atuais.</p></div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{unidadesVisiveis.map(unidade => {
              const ordensUnidade=ordensVisiveis.filter(ordem=>ordem.unidade_id===unidade.id);
              const abertasUnidade=ordensUnidade.filter(ordem=>ordem.status==="pendente"||ordem.status==="em_andamento");
              const faixasUnidade=[
                abertasUnidade.filter(ordem=>idadeEmHoras(ordem.created_at)<24).length,
                abertasUnidade.filter(ordem=>idadeEmHoras(ordem.created_at)>=24&&idadeEmHoras(ordem.created_at)<48).length,
                abertasUnidade.filter(ordem=>idadeEmHoras(ordem.created_at)>=48&&idadeEmHoras(ordem.created_at)<168).length,
                abertasUnidade.filter(ordem=>idadeEmHoras(ordem.created_at)>=168&&idadeEmHoras(ordem.created_at)<360).length,
                abertasUnidade.filter(ordem=>idadeEmHoras(ordem.created_at)>=360).length
              ];
              const selecionada=ordemSelecionada===unidade.id;
              return <article key={unidade.id} className={"rounded-2xl border bg-gradient-to-br from-[#003e34] to-[#002e28] p-5 "+(selecionada?"border-lime-400 ring-1 ring-lime-400/40":"border-emerald-800")}>
                <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Unidade</div><h3 className="mt-1 text-lg font-extrabold">{unidade.nome}</h3></div><span className="rounded-lg border border-emerald-700 px-2.5 py-1.5 text-xs text-emerald-100">{unidade.ativa===false?"Inativa":"Ativa"}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3"><div><div className="text-3xl font-extrabold text-lime-300">{abertasUnidade.length}</div><div className="text-xs text-emerald-100/65">OS abertas</div></div><div><div className="text-3xl font-extrabold">{ordensUnidade.length}</div><div className="text-xs text-emerald-100/65">Total de OS</div></div><div><div className="text-xl font-bold text-lime-200">{ordensUnidade.filter(o=>o.status==="concluida"&&Boolean(o.fechada_em)).length}</div><div className="text-xs text-emerald-100/65">Concluídas</div></div><div><div className="text-xl font-bold text-amber-200">{abertasUnidade.filter(o=>idadeEmHoras(o.created_at)>=48).length}</div><div className="text-xs text-emerald-100/65">Abertas há +48h</div></div></div>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-emerald-950">{faixasUnidade.map((quantidade,indice)=><div key={faixas[indice].nome} className={faixas[indice].cor} style={{width:(quantidade/Math.max(abertasUnidade.length,1)*100)+"%"}}/>)}</div>
                <div className="mt-3 space-y-1">{faixas.map((faixa,indice)=><div key={faixa.nome} className="flex justify-between text-xs text-emerald-100/65"><span>{faixa.nome}</span><strong>{faixasUnidade[indice]}</strong></div>)}</div>
                <button type="button" onClick={()=>{setOrdemSelecionada(selecionada?null:unidade.id);setStatusFiltro("Todas");setBuscaOS("");setFiltrosColuna({situacao:[],os:[],frota:[],setor:[],tecnico:[],descricao:[],entrada:[],idade:[],localizacao:[]});}} className="mt-4 w-full rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-bold transition hover:bg-emerald-900">{selecionada?"Fechar análise":"Analisar OS desta unidade"}</button>
              </article>;
            })}</div>
          </section>
          {ordemSelecionada && <section className="space-y-4 rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5" aria-label="Análise das ordens da unidade selecionada">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">OS da unidade: {unidades.find(u=>u.id===ordemSelecionada)?.nome||"Unidade"}</h2><p className="mt-1 text-sm text-emerald-100/65">Consulte ordens atuais e antigas, filtre por situação e pesquise por OS, frota ou técnico.</p></div><button type="button" onClick={()=>setOrdemSelecionada(null)} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold">Fechar análise</button></div>
            {mensagemOS && <div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-100">{mensagemOS}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{statusResumo.map(item=>{const Icon=item.icon;const selecionado=statusFiltro===item.status;return <button key={item.status} type="button" aria-pressed={selecionado} onClick={()=>setStatusFiltro(item.status)} className={"rounded-xl border p-3 text-left transition "+(selecionado?item.active:"border-emerald-800 bg-[#002b25] hover:border-emerald-500")}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-emerald-100/75">{item.label}</span><Icon size={17} className={item.color}/></div><div className={"mt-2 text-2xl font-extrabold "+item.color}>{item.total}</div></button>})}</div>
            <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex min-w-0 flex-1 items-center"><Search size={16} className="pointer-events-none absolute left-3 text-emerald-100/50"/><input value={buscaOS} onChange={e=>setBuscaOS(e.target.value)} placeholder="Buscar OS, frota, setor, técnico ou descrição..." className="w-full rounded-xl border border-emerald-700 bg-emerald-950/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-emerald-100/40"/></label><span className="self-center text-xs text-emerald-100/60">{ordensFiltradasPainel.length} de {ordensPainelUnidade.length} OS</span></div>
            {(perfilAtual === "admin_unidade" || perfilAtual === "gestor" || perfilAtual === "gestor_central") && <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div><h3 className="font-bold">Transferir OS para outro técnico</h3><p className="mt-1 text-xs text-emerald-100/65">Somente OS com status Pendente podem ser transferidas. OS em andamento ou concluídas ficam bloqueadas.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { const pendentesVisiveis = ordensFiltradasPainel.filter(o => o.status === "pendente").map(o => o.id); if (pendentesVisiveis.length > 0 && pendentesVisiveis.every(id => ordensSelecionadasTransferencia.includes(id))) setOrdensSelecionadasTransferencia(atual => atual.filter(id => !pendentesVisiveis.includes(id))); else setOrdensSelecionadasTransferencia(atual => [...new Set([...atual, ...pendentesVisiveis])]); }} className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold hover:bg-emerald-900">{ordensFiltradasPainel.some(o => o.status === "pendente") && ordensFiltradasPainel.filter(o => o.status === "pendente").every(o => ordensSelecionadasTransferencia.includes(o.id)) ? "Desmarcar pendentes visíveis" : "Selecionar pendentes visíveis"}</button>
                  <button type="button" onClick={() => void carregarUsuariosAdmin()} disabled={carregandoUsuarios} className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold hover:bg-emerald-900 disabled:opacity-50">{carregandoUsuarios ? "Carregando técnicos..." : "Atualizar lista de técnicos"}</button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-1 text-xs font-semibold">Técnico de destino
                  <select value={tecnicoDestinoTransferencia} onChange={e => setTecnicoDestinoTransferencia(e.target.value)} className="rounded-lg border border-emerald-700 bg-[#002b25] px-3 py-2.5 text-sm text-white">
                    <option value="">Selecione o técnico</option>
                    {usuariosAdmin.filter(u => u.ativo && u.perfil === "tecnico" && u.unidade_id === ordemSelecionada).map(u => <option key={u.user_id} value={u.user_id}>{u.nome} — {u.email}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => void transferirOrdensSelecionadas()} disabled={transferindoOS || !ordensSelecionadasTransferencia.length || !tecnicoDestinoTransferencia} className="rounded-lg bg-lime-300 px-5 py-2.5 text-sm font-extrabold text-emerald-950 hover:bg-lime-200 disabled:opacity-50">{transferindoOS ? "Transferindo..." : `Transferir ${ordensSelecionadasTransferencia.length} OS`}</button>
              </div>
              <p className="mt-2 text-xs text-emerald-100/60">{ordensSelecionadasTransferencia.length} OS selecionada(s). A lista de técnicos é carregada ao clicar em “Atualizar lista de técnicos”.</p>
            </div>}
            <div className="overflow-x-auto rounded-xl border border-emerald-800"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="bg-emerald-950 text-emerald-100/80"><tr><th className="w-10 p-2"><span className="sr-only">Selecionar</span></th>{([{chave:"situacao",rotulo:"Situação"},{chave:"os",rotulo:"OS"},{chave:"frota",rotulo:"Frota"},{chave:"setor",rotulo:"Setor"},{chave:"tecnico",rotulo:"Técnico"},{chave:"descricao",rotulo:"Descrição"},{chave:"entrada",rotulo:"Entrada"},{chave:"idade",rotulo:"Idade"}] as const).map(coluna=><th key={coluna.chave} className="min-w-[125px] p-2 align-top"><div className="flex items-center justify-between gap-1"><button type="button" onClick={()=>setOrdenacaoColuna(atual=>({chave:coluna.chave,direcao:atual.chave===coluna.chave&&atual.direcao==="asc"?"desc":"asc"}))} className="inline-flex items-center gap-1 rounded px-1 py-1 text-left font-bold hover:bg-emerald-800" title={"Classificar por "+coluna.rotulo}>{coluna.rotulo}{ordenacaoColuna.chave===coluna.chave?(ordenacaoColuna.direcao==="asc"?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}</button><ListFilter size={13} className={filtrosColuna[coluna.chave].length?"text-lime-300":"text-emerald-100/50"}/></div><select aria-label={"Filtrar "+coluna.rotulo} value={filtrosColuna[coluna.chave][0]||""} onChange={e=>setFiltrosColuna(atual=>({...atual,[coluna.chave]:e.target.value?[e.target.value]:[]}))} className="mt-1 w-full max-w-[160px] rounded border border-emerald-800 bg-[#002b25] px-1.5 py-1 text-[11px] text-emerald-50"><option value="">Todos</option>{opcoesFiltroPainel(coluna.chave).map(opcao=><option key={opcao} value={opcao}>{opcao}</option>)}</select></th>)}<th className="p-3">Ação</th></tr></thead><tbody>{ordensFiltradasPainel.map(ordem=><tr key={ordem.id} role="button" tabIndex={0} aria-label={"Abrir detalhes da OS "+(ordem.numero_os||ordem.frota||"sem número")} onClick={()=>setOrdemDetalhes(ordem)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOrdemDetalhes(ordem);}}} className="cursor-pointer border-t border-emerald-900 align-top transition-colors hover:bg-emerald-900/40 focus:bg-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-lime-400"><td className="p-2" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={"Selecionar OS "+(ordem.numero_os||ordem.frota||"sem número")} checked={ordensSelecionadasTransferencia.includes(ordem.id)} disabled={ordem.status !== "pendente"} onChange={e=>setOrdensSelecionadasTransferencia(atual=>e.target.checked?[...new Set([...atual,ordem.id])]:atual.filter(id=>id!==ordem.id))} className="h-4 w-4 accent-lime-300 disabled:cursor-not-allowed disabled:opacity-30"/></td><td className="p-3">{rotuloSituacaoOS(ordem)}</td><td className="p-3 font-semibold">{ordem.numero_os||"Sem número"}</td><td className="p-3">{ordem.frota||"—"}</td><td className="p-3">{ordem.setor||"—"}</td><td className="p-3">{ordem.tecnico_nome||"—"}</td><td className="max-w-sm whitespace-normal p-3">{ordem.descricao||"—"}</td><td className="p-3">{ordem.entrada||"—"}</td><td className="p-3">{formatarIdade(ordem.created_at)}</td><td className="p-3 whitespace-nowrap">{ordem.status === "concluida" && !ordem.fechada_em && (perfilAtual === "admin_unidade" || perfilAtual === "gestor" || perfilAtual === "gestor_central") && <button type="button" disabled={salvandoOS} onClick={e=>{e.stopPropagation();void fecharNoPIMS(ordem);}} className="rounded-lg border border-amber-300 bg-amber-300 px-3 py-2 text-xs font-extrabold text-emerald-950 transition hover:bg-amber-200 disabled:opacity-50">{salvandoOS ? "Fechando..." : "Fechar no PIMS"}</button>}</td></tr>)}{ordensFiltradasPainel.length===0&&<tr><td colSpan={10} className="p-6 text-center text-emerald-100/55">Nenhuma OS corresponde aos filtros selecionados.</td></tr>}</tbody></table></div>
            {ordemDetalhes && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)setOrdemDetalhes(null);}}><section role="dialog" aria-modal="true" aria-labelledby="titulo-detalhes-os" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-emerald-700 bg-[#00352d] p-4 text-emerald-50 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4 border-b border-emerald-800 pb-4"><div><p className="text-xs font-bold uppercase tracking-widest text-lime-300">Detalhes completos da ordem de serviço</p><h2 id="titulo-detalhes-os" className="mt-1 text-2xl font-extrabold">OS {ordemDetalhes.numero_os||"Sem número"}</h2><p className="mt-1 text-sm text-emerald-100/70">Frota: {ordemDetalhes.frota||"—"}</p></div><button type="button" autoFocus onClick={()=>setOrdemDetalhes(null)} aria-label="Fechar detalhes da OS" className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold hover:bg-emerald-900">Fechar</button></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-emerald-600 bg-emerald-950/70 px-3 py-1.5 text-sm font-semibold">{rotuloSituacaoOS(ordemDetalhes)}</span>{ordemDetalhes.fechada_em&&<span className="rounded-full border border-lime-700 bg-lime-950/50 px-3 py-1.5 text-sm font-semibold text-lime-200">Fechada oficialmente</span>}</div>{ordemDetalhes.status === "concluida" && !ordemDetalhes.fechada_em && (perfilAtual === "admin_unidade" || perfilAtual === "gestor" || perfilAtual === "gestor_central") && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-950/40 p-4"><div><p className="font-bold text-amber-200">Aguardando fechamento oficial no PIMS</p><p className="mt-1 text-xs text-emerald-100/70">O técnico já finalizou o serviço. Confirme aqui o fechamento oficial para transferir esta OS para Concluídas.</p></div><button type="button" disabled={salvandoOS} onClick={()=>void fecharNoPIMS(ordemDetalhes)} className="rounded-lg border border-amber-300 bg-amber-300 px-4 py-2.5 text-sm font-extrabold text-emerald-950 hover:bg-amber-200 disabled:opacity-50">{salvandoOS ? "Fechando..." : "Fechar no PIMS"}</button></div>}<div>{mensagemOS && <div role="status" className="mt-3 rounded-lg border border-amber-400/50 bg-amber-950/40 p-3 text-sm text-amber-100">{mensagemOS}</div>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Técnico</p><p className="mt-1 break-words font-semibold">{ordemDetalhes.tecnico_nome||ordemDetalhes.tecnico_email||"Não atribuído"}</p>{ordemDetalhes.tecnico_email&&ordemDetalhes.tecnico_email!==ordemDetalhes.tecnico_nome&&<p className="mt-1 break-all text-xs text-emerald-100/60">{ordemDetalhes.tecnico_email}</p>}</div><div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Setor</p><p className="mt-1 font-semibold">{ordemDetalhes.setor||"Não informado"}</p></div><div className="rounded-xl border border-emerald-800 p-3 sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Localização</p><p className="mt-1 whitespace-pre-wrap">{ordemDetalhes.localizacao||"Não informada"}</p>{ordemDetalhes.localizacao&&<a className="mt-2 inline-flex text-sm font-semibold text-lime-300 underline underline-offset-2" href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(ordemDetalhes.localizacao)} target="_blank" rel="noreferrer">Abrir localização no mapa</a>}</div><div className="rounded-xl border border-emerald-800 p-4 sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Descrição do serviço / problema</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{ordemDetalhes.descricao||"Sem descrição informada."}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-emerald-950/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Entrada informada</p><p className="mt-1 text-sm font-medium">{ordemDetalhes.entrada||"—"}</p></div><div className="rounded-xl bg-emerald-950/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Início</p><p className="mt-1 text-sm font-medium">{ordemDetalhes.data_inicio?formatarDataBR(ordemDetalhes.data_inicio, true):"—"}</p></div><div className="rounded-xl bg-emerald-950/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Conclusão</p><p className="mt-1 text-sm font-medium">{ordemDetalhes.concluida_em?formatarDataBR(ordemDetalhes.concluida_em, true):"—"}</p></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-800 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Registro criado</p><p className="mt-1 text-sm">{ordemDetalhes.created_at?formatarDataBR(ordemDetalhes.created_at, true):"—"}</p></div><div className="rounded-xl border border-emerald-800 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Idade da OS</p><p className="mt-1 text-sm font-semibold">{formatarIdade(ordemDetalhes.created_at)}</p></div></div>{ordemDetalhes.notas_fecho&&<div className="mt-3 rounded-xl border border-lime-800 bg-lime-950/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-lime-300">Serviço realizado</p><p className="mt-2 whitespace-pre-wrap text-sm">{ordemDetalhes.notas_fecho}</p></div>}<div className="mt-3 rounded-xl border border-emerald-800 bg-emerald-950/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Classe de manutenção</p><p className="mt-2 text-sm">{Array.isArray(ordemDetalhes.classe_manutencao)?ordemDetalhes.classe_manutencao.join(", "):ordemDetalhes.classe_manutencao||"Não informada"}</p></div><div className="mt-3 rounded-xl border border-emerald-800 bg-emerald-950/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Peças utilizadas / trocadas</p><p className="mt-2 whitespace-pre-wrap text-sm">{ordemDetalhes.pecas_utilizadas||"Nenhuma peça informada"}</p></div><div className="mt-4 flex justify-end border-t border-emerald-800 pt-4"><button type="button" onClick={()=>setOrdemDetalhes(null)} className="rounded-lg bg-lime-300 px-5 py-2.5 font-bold text-emerald-950 hover:bg-lime-200">Fechar detalhes</button></div></section></div>}
          </section>}
        </section>}
        {aba === "inicio" && (
          <section className="space-y-3 rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5" aria-label="Comparativo consolidado por unidade">
            <div>
              <h2 className="text-xl font-extrabold">Comparativo consolidado por unidade</h2>
              <p className="mt-1 text-sm text-emerald-100/65">Compare volume, situação das OS e produtividade no mesmo quadro. A taxa de conclusão desconsidera OS canceladas; o tempo médio usa somente OS concluídas com início e conclusão registrados.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-emerald-800">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="bg-emerald-950 text-emerald-100/80"><tr><th className="p-3">Unidade</th><th className="p-3 text-right">Total OS</th><th className="p-3 text-right">Pendentes</th><th className="p-3 text-right">Em andamento</th><th className="p-3 text-right">Concluídas</th><th className="p-3 text-right">Canceladas</th><th className="p-3 text-right">Conclusão</th><th className="p-3 text-right">Técnicos com OS</th><th className="p-3 text-right">Tempo médio de execução</th></tr></thead>
                <tbody>
                  {resumoConsolidadoUnidades.map((item) => <tr key={item.unidade.id} className="border-t border-emerald-800/80 hover:bg-emerald-900/30">
                    <td className="p-3 font-bold">{item.unidade.nome}<div className="mt-1 text-[10px] font-normal text-emerald-100/50">{item.unidade.ativa === false ? "Inativa" : "Ativa"}</div></td>
                    <td className="p-3 text-right font-bold">{item.total}</td>
                    <td className="p-3 text-right text-amber-200">{item.pendentes}</td>
                    <td className="p-3 text-right text-sky-200">{item.emAndamento}</td>
                    <td className="p-3 text-right text-lime-200">{item.concluidas}</td>
                    <td className="p-3 text-right text-rose-200">{item.canceladas}</td>
                    <td className="p-3 text-right font-bold">{item.taxaConclusao}%</td>
                    <td className="p-3 text-right">{item.tecnicos}</td>
                    <td className="p-3 text-right">{formatarMediaExecucao(item.mediaExecucao)}</td>

              </tr>)}
                  {resumoConsolidadoUnidades.length === 0 && <tr><td colSpan={9} className="p-5 text-center text-emerald-100/60">Nenhuma unidade disponível para este perfil.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-emerald-100/45">A produtividade é apresentada como quantidade de técnicos que possuem OS vinculadas à unidade e taxa de conclusão; não é uma classificação individual de desempenho.</p>
          </section>
        )}
        {aba === "gestao_os" && modoGestao === "solicitacoes" && (perfilAtual === "admin_unidade" || perfilAtual === "gestor" || perfilAtual === "gestor_central") && <section id="solicitacoes-os" className="mb-6 space-y-4 rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Solicitações de OS</p><h1 className="text-xl font-extrabold">Ver e analisar pedidos dos técnicos</h1><p className="mt-1 text-sm text-emerald-100/70">Confira as solicitações pendentes e informe o número oficial sem criar outro registro.</p></div>
            <span className="rounded-full border border-amber-500/50 bg-amber-950/40 px-3 py-1.5 text-sm font-bold text-amber-200">{ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length} aguardando abertura</span>
          </div>
          {mensagemOS && <div role="status" className="rounded-lg border border-emerald-700 p-3 text-sm text-emerald-100">{mensagemOS}</div>}
          {ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length === 0 && <div className="rounded-xl border border-dashed border-emerald-700 p-8 text-center"><ClipboardList size={30} className="mx-auto text-emerald-100/40"/><p className="mt-2 font-semibold">Nenhuma solicitação aguardando número</p><p className="mt-1 text-sm text-emerald-100/60">As solicitações enviadas pelos técnicos aparecerão aqui.</p></div>}
          {ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").map(ordem => {
            const unidadeNome = unidades.find(u => u.id === ordem.unidade_id)?.nome ?? "Unidade";
            const editando = solicitacaoEmEdicao?.id === ordem.id;
            return <article key={ordem.id} className="rounded-xl border border-emerald-700 bg-[#002b25] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-amber-300">AGUARDANDO NÚMERO DA OS · {unidadeNome}</p><h2 className="mt-1 text-lg font-bold">{ordem.frota || "Frota não informada"}</h2><p className="mt-1 text-sm text-emerald-100/80">{ordem.descricao}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-100/60"><span>Técnico: {ordem.tecnico_nome || "Não informado"}</span><span>Setor: {ordem.setor || "—"}</span><span>Localização: {ordem.localizacao || "—"}</span><span>Solicitada: {formatarDataBR(ordem.created_at, true)}</span></div></div>
                {!editando && <button type="button" onClick={() => setSolicitacaoEmEdicao({ id: ordem.id, numero_os: "", frota: ordem.frota || "", localizacao: ordem.localizacao || "", descricao: ordem.descricao || "", setor: ordem.setor || "", tecnico_nome: ordem.tecnico_nome || "" })} className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-bold text-emerald-950">Conferir e inserir OS</button>}
              </div>
              {editando && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold text-emerald-100">Número oficial da OS *<input autoFocus value={solicitacaoEmEdicao.numero_os} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, numero_os:e.target.value} : v)} placeholder="Informe o número da OS" className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <label className="text-xs font-semibold text-emerald-100">Frota<input value={solicitacaoEmEdicao.frota} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, frota:e.target.value} : v)} className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <label className="text-xs font-semibold text-emerald-100">Técnico<input value={solicitacaoEmEdicao.tecnico_nome} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, tecnico_nome:e.target.value} : v)} className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <label className="text-xs font-semibold text-emerald-100">Setor<input value={solicitacaoEmEdicao.setor} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, setor:e.target.value} : v)} className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <label className="text-xs font-semibold text-emerald-100">Localização<input value={solicitacaoEmEdicao.localizacao} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, localizacao:e.target.value} : v)} className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <label className="text-xs font-semibold text-emerald-100 sm:col-span-2 lg:col-span-3">Descrição do serviço<textarea value={solicitacaoEmEdicao.descricao} onChange={e => setSolicitacaoEmEdicao(v => v ? {...v, descricao:e.target.value} : v)} rows={2} className="mt-1 w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"/></label>
                <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><button type="button" disabled={salvandoOS || !solicitacaoEmEdicao.numero_os.trim()} onClick={() => void (async () => {
                  if (!solicitacaoEmEdicao || !solicitacaoEmEdicao.numero_os.trim()) return;
                  setSalvandoOS(true); setMensagemOS("");
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const db = supabase as any;
                  const { error } = await db.from("ordens_servico").update({ numero_os: solicitacaoEmEdicao.numero_os.trim(), frota: solicitacaoEmEdicao.frota.trim() || null, localizacao: solicitacaoEmEdicao.localizacao.trim() || null, descricao: solicitacaoEmEdicao.descricao.trim(), setor: solicitacaoEmEdicao.setor.trim() || null, tecnico_nome: solicitacaoEmEdicao.tecnico_nome.trim() || null }).eq("id", ordem.id).eq("unidade_id", ordem.unidade_id);
                  setSalvandoOS(false);
                  if (error) { setMensagemOS("Não foi possível inserir a OS: " + error.message); return; }
                  setMensagemOS("Número da OS registrado. A solicitação original foi atualizada e retornou ao fluxo normal, sem duplicar o registro.");
                  setSolicitacaoEmEdicao(null); await carregar();
                })()} className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-50">{salvandoOS ? "Salvando..." : "Inserir OS e enviar ao técnico"}</button><button type="button" onClick={() => setSolicitacaoEmEdicao(null)} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm">Cancelar</button></div>
              </div>}
            </article>;
          })}
        </section>}
        {aba === "gestao_os" && modoGestao !== "solicitacoes" && <>
        <div className="mb-6 flex items-start gap-3"><ClipboardList className="mt-1 text-lime-300" /><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Ordens de serviço</p><h1 className="text-2xl font-extrabold sm:text-3xl">Gestão de OS</h1><p className="mt-1 text-sm text-emerald-100/70">Escolha uma ação para cadastrar ou enviar ordens de serviço.</p></div></div>
        {erro && <div role="alert" className="mb-5 rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-100"><strong>Não foi possível carregar os dados.</strong><p className="mt-1 break-words">{erro}</p><p className="mt-2 text-xs">Confira a sessão de teste e os vínculos de unidade do usuário. Nenhum dado fictício é exibido como se fosse real.</p></div>}
        {carregando && <p role="status" className="mb-4 text-sm text-emerald-100/80">Consultando o banco de teste…</p>}
        {!carregando && !erro && ordens.length === 0 && <div className="mb-5 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">A consulta retornou zero OS para este usuário. Isso pode significar que ainda falta associar o usuário a um perfil/unidade de teste.</div>}

        {mensagemOS && <div role="status" className="mb-4 rounded-lg border border-emerald-700 p-3 text-sm text-emerald-100">{mensagemOS}</div>}
        {gestaoOSAberta && (perfilAtual === "admin_unidade" || perfilAtual === "gestor" || perfilAtual === "gestor_central") && <section className="mb-5 rounded-2xl border border-emerald-700 bg-[#003b32] p-4">
          {modoGestao !== "menu" && <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-bold">{modoGestao === "criar" ? "Criar nova OS" : modoGestao === "colar" ? "Colar planilha" : "Importar planilha"}</h2><button type="button" onClick={()=>setModoGestao("menu")} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs">Voltar às opções</button></div>}
          {modoGestao === "menu" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setModoGestao("criar")} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><Plus size={26}/><b>Criar OS</b><span className="text-xs text-emerald-100/70">Cadastrar uma ordem</span></button>
            <button type="button" onClick={() => {setModoGestao("colar");setTextoPlanilha("");setLinhasImportacao([]);}} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><ClipboardPaste size={26}/><b>Colar planilha</b><span className="text-xs text-emerald-100/70">Copiar do Excel e colar</span></button>
            <button type="button" onClick={() => {setModoGestao("importar");setLinhasImportacao([]);setNomeArquivo("");}} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><Upload size={26}/><b>Importar planilha</b><span className="text-xs text-emerald-100/70">Excel, XLS ou CSV</span></button>
            <button type="button" onClick={() => setModoGestao("solicitacoes")} className="relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><ClipboardList size={26}/><b>Solicitações de OS</b><span className="text-xs text-emerald-100/70">Ver e analisar pedidos dos técnicos</span><span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-emerald-950">{ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length} pendente(s)</span></button>
          </div>}
          {modoGestao === "criar" && <form onSubmit={criarOS} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(perfilAtual === "gestor" || perfilAtual === "gestor_central") && <label className="grid gap-1 text-sm">Unidade<select required value={formUnidadeCentral} onChange={e=>setFormUnidadeCentral(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white">{unidades.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
            <label className="grid gap-1 text-sm">Número da OS<input required value={formNovaOS.numero_os} onChange={e=>setFormNovaOS({...formNovaOS,numero_os:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Frota<input required value={formNovaOS.frota} onChange={e=>setFormNovaOS({...formNovaOS,frota:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Entrada / data<input type="date" value={formNovaOS.entrada} onChange={e=>setFormNovaOS({...formNovaOS,entrada:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Setor<input value={formNovaOS.setor} onChange={e=>setFormNovaOS({...formNovaOS,setor:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Localização<input value={formNovaOS.localizacao} onChange={e=>setFormNovaOS({...formNovaOS,localizacao:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Técnico<select value={formNovaOS.tecnico_email} onChange={e=>{const tecnicoSelecionado=usuariosAdmin.find(u=>u.email===e.target.value && u.ativo);setFormNovaOS({...formNovaOS,tecnico_email:tecnicoSelecionado?.email ?? "",tecnico_nome:tecnicoSelecionado?.nome ?? ""});}} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="">Selecione um técnico (opcional)</option>{usuariosAdmin.filter(u=>u.ativo && u.perfil==="tecnico" && u.unidade_id===(perfilAtual==="admin_unidade"?unidadeAtualId:formUnidadeCentral)).map(u=><option key={u.user_id} value={u.email}>{u.nome}</option>)}</select></label>
            <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">Descrição do serviço<textarea required value={formNovaOS.descricao} onChange={e=>setFormNovaOS({...formNovaOS,descricao:e.target.value})} rows={3} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={salvandoNovaOS || !formNovaOS.numero_os.trim() || !formNovaOS.frota.trim() || !formNovaOS.descricao.trim()} className="rounded-lg bg-lime-300 px-5 py-2.5 font-bold text-emerald-950 disabled:opacity-50">{salvandoNovaOS ? "Criando OS..." : "Salvar nova OS"}</button><button type="button" onClick={()=>setModoGestao("menu")} className="rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div>
          </form>}
          {modoGestao === "colar" && <div className="mt-4 grid gap-3"><p className="text-sm text-emerald-100/80">No Excel, selecione as linhas e pressione Ctrl+C. Cole abaixo; o sistema reconhecerá os cabeçalhos quando existirem.</p><textarea value={textoPlanilha} onChange={e=>setTextoPlanilha(e.target.value)} onPaste={e=>{const v=e.clipboardData.getData("text");if(v){e.preventDefault();setTextoPlanilha(v);}}} rows={7} placeholder={"Cole aqui as linhas do Excel...\nnumero_os\tfrota\tlocalizacao\tdescricao\ttecnico_email\tentrada"} className="w-full rounded-lg border border-emerald-700 bg-emerald-950 p-3 font-mono text-sm text-white"/><div className="flex flex-wrap gap-2"><button type="button" onClick={async ()=>{const lista=await carregarUsuariosAdmin();setLinhasImportacao(parsearLinhas(textoPlanilha,lista));}} disabled={!textoPlanilha.trim()||carregandoUsuarios} className="rounded-lg bg-lime-300 px-4 py-2 font-bold text-emerald-950">Conferir linhas</button><button type="button" onClick={()=>setModoGestao("menu")} className="rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div></div>}
          {modoGestao === "importar" && <div className="mt-4 grid gap-3"><p className="text-sm text-emerald-100/80">Escolha uma planilha Excel (.xlsx/.xls) ou arquivo CSV. O sistema mostrará uma prévia antes de salvar.</p><label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-600 p-8 text-center hover:bg-emerald-950/50"><FileSpreadsheet size={30}/><b>{nomeArquivo || "Escolher ficheiro Excel ou CSV"}</b><span className="text-xs text-emerald-100/70">Máximo 20 MB</span><input type="file" accept=".xlsx,.xls,.csv" className="mt-2 max-w-full text-sm" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>20*1024*1024){setMensagemOS("O ficheiro excede o limite de 20 MB.");return;}try{const lista=await carregarUsuariosAdmin();const wb=read(await file.arrayBuffer(),{cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw new Error("Planilha vazia");const matrix=utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:true});setLinhasImportacao(normalizarMatriz(matrix,lista));setNomeArquivo(file.name);setMensagemOS("");}catch(err){setMensagemOS("Não foi possível ler o ficheiro: "+(err instanceof Error?err.message:"erro"));}}}/></label><button type="button" onClick={()=>setModoGestao("menu")} className="justify-self-start rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div>}
          {linhasImportacao.length > 0 && <div className="mt-4"><div className="mb-2 text-sm font-semibold">{linhasImportacao.filter(l=>l.valid).length} linha(s) válidas · {linhasImportacao.filter(l=>!l.valid).length} com erro</div><div className="max-h-64 overflow-auto rounded-lg border border-emerald-800"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-emerald-950"><tr><th className="p-2">Estado</th><th className="p-2">OS</th><th className="p-2">Frota</th><th className="p-2">Setor</th><th className="p-2">Técnico</th><th className="p-2">Descrição</th></tr></thead><tbody>{linhasImportacao.slice(0,150).map((l,i)=><tr key={l.numero_os+"-"+i} className="border-t border-emerald-900"><td className="p-2">{!l.numero_os || !l.frota ? "Verificar dados" : !l.tecnico_original ? "Válida · sem técnico" : !l.tecnico_valido ? "Técnico sem vínculo" : "Válida"}</td><td className="p-2">{l.numero_os||"—"}</td><td className="p-2">{l.frota||"—"}</td><td className="p-2">{l.setor||"—"}</td><td className="p-2">{l.tecnico_nome || l.tecnico_original || "—"}</td><td className="p-2">{l.descricao||"—"}</td></tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void salvarImportacao()} disabled={salvandoLote||!linhasImportacao.some(l=>l.valid)||linhasImportacao.some(l=>Boolean(l.tecnico_original)&&!l.tecnico_valido)} className="rounded-lg bg-lime-300 px-4 py-2 font-bold text-emerald-950 disabled:opacity-50">{salvandoLote ? "Salvando..." : "Importar " + linhasImportacao.filter(l=>l.valid).length + " OS"}</button><button type="button" onClick={()=>{setLinhasImportacao([]);setTextoPlanilha("");setNomeArquivo("");}} className="rounded-lg border border-emerald-700 px-4 py-2">Limpar prévia</button></div></div>}
        </section>}
        </>}
        {aba === "historico" && <section className="mt-6 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime-300">Arquivo de ordens de serviço</p><h1 className="mt-1 text-2xl font-extrabold">Histórico de OS</h1><p className="mt-2 max-w-3xl text-sm text-emerald-100/70">Consulta de registros preservados no banco de teste. Use os filtros e exporte todos os campos disponíveis de cada OS para Excel.</p></div>
            <button type="button" onClick={exportarHistoricoOS} disabled={!ordensHistoricoFiltradas.length} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-sm font-extrabold text-emerald-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet size={18}/> Exportar detalhado (.xlsx)</button>
          </div>
          <div className="grid gap-3 rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Buscar em todos os campos
              <input value={historicoBusca} onChange={e=>setHistoricoBusca(e.target.value)} placeholder="OS, frota, descrição, peças..." className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"/>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Situação
              <select value={historicoStatus} onChange={e=>setHistoricoStatus(e.target.value as typeof historicoStatus)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"><option value="Todas">Todas as situações</option><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Frota
              <select value={historicoFrota} onChange={e=>setHistoricoFrota(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"><option value="">Todas as frotas</option>{[...new Set(ordensVisiveis.map(o=>o.frota).filter((v):v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true})).map(v=><option key={v} value={v}>{v}</option>)}</select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Setor
              <select value={historicoSetor} onChange={e=>setHistoricoSetor(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"><option value="">Todos os setores</option>{[...new Set(ordensVisiveis.map(o=>o.setor).filter((v):v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=><option key={v} value={v}>{v}</option>)}</select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Técnico
              <select value={historicoTecnico} onChange={e=>setHistoricoTecnico(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"><option value="">Todos os técnicos</option>{[...new Set(ordensVisiveis.map(o=>o.tecnico_nome).filter((v):v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=><option key={v} value={v}>{v}</option>)}</select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Registro criado a partir de
              <input type="date" value={historicoDataInicial} onChange={e=>setHistoricoDataInicial(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"/>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-emerald-100/80">Registro criado até
              <input type="date" value={historicoDataFinal} onChange={e=>setHistoricoDataFinal(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2.5 text-sm font-normal text-white"/>
            </label>
            <div className="flex items-end"><button type="button" onClick={()=>{setHistoricoBusca("");setHistoricoStatus("Todas");setHistoricoFrota("");setHistoricoSetor("");setHistoricoTecnico("");setHistoricoDataInicial("");setHistoricoDataFinal("");}} className="w-full rounded-lg border border-emerald-700 px-3 py-2.5 text-sm font-semibold hover:bg-emerald-900">Limpar filtros</button></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-bold text-lime-200">{ordensHistoricoFiltradas.length} OS encontradas</span><span className="text-xs text-emerald-100/60">A unidade selecionada no topo limita a consulta; “Todas” mostra o consolidado conforme sua permissão.</span></div>
          <div className="overflow-x-auto rounded-2xl border border-emerald-800">
            <table className="w-full min-w-[1500px] text-left text-xs">
              <thead className="bg-emerald-950/80 text-emerald-100"><tr>{([
              ["unidade", "Unidade"], ["os", "Nº OS"], ["frota", "Frota"], ["setor", "Setor"], ["descricao", "Descrição detalhada"], ["localizacao", "Localização"], ["tecnico", "Técnico"], ["classe", "Classe manutenção"], ["pecas", "Peças utilizadas"], ["status", "Status"], ["entrada", "Entrada informada"], ["criado", "Registro criado"], ["inicio", "Início"], ["conclusao", "Conclusão"], ["id", "ID do registro"],
            ] as [typeof ordenacaoHistorico.chave, string][]).map(([chave, titulo]) => <th key={chave} className="p-3"><button type="button" onClick={() => setOrdenacaoHistorico(atual => ({ chave, direcao: atual.chave === chave && atual.direcao === "asc" ? "desc" : "asc" }))} className="inline-flex items-center gap-1 whitespace-nowrap text-left hover:text-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-300 rounded" title={`Classificar por ${titulo}`}>{titulo}{ordenacaoHistorico.chave === chave ? (ordenacaoHistorico.direcao === "asc" ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13} className="opacity-50"/>}</button></th>)}</tr></thead>
              <tbody>{ordensHistoricoFiltradas.map(ordem=><tr key={ordem.id} className="border-t border-emerald-900 align-top hover:bg-emerald-900/30"><td className="p-3 whitespace-nowrap">{unidades.find(u=>u.id===ordem.unidade_id)?.nome ?? "—"}</td><td className="p-3 font-bold whitespace-nowrap">{ordem.numero_os || "Sem número"}</td><td className="p-3 whitespace-nowrap">{ordem.frota || "—"}</td><td className="p-3">{ordem.setor || "—"}</td><td className="p-3 min-w-[260px] whitespace-pre-wrap">{ordem.descricao || "—"}</td><td className="p-3 min-w-[160px]">{ordem.localizacao || "—"}</td><td className="p-3 whitespace-nowrap">{ordem.tecnico_nome || ordem.tecnico_email || "—"}</td><td className="p-3 min-w-[150px]">{Array.isArray(ordem.classe_manutencao) ? ordem.classe_manutencao.join(", ") : ordem.classe_manutencao || "—"}</td><td className="p-3 min-w-[180px] whitespace-pre-wrap">{ordem.pecas_utilizadas || "—"}</td><td className="p-3 whitespace-nowrap">{({pendente:"Pendente",em_andamento:"Em andamento",concluida:"Concluída",cancelada:"Cancelada"} as Record<string,string>)[ordem.status] || ordem.status}</td><td className="p-3 whitespace-nowrap">{ordem.entrada ? String(ordem.entrada) : "—"}</td><td className="p-3 whitespace-nowrap">{ordem.created_at ? formatarDataBR(ordem.created_at, true) : "—"}</td><td className="p-3 whitespace-nowrap">{ordem.data_inicio ? formatarDataBR(ordem.data_inicio, true) : "—"}</td><td className="p-3 whitespace-nowrap">{ordem.concluida_em ? formatarDataBR(ordem.concluida_em, true) : "—"}</td><td className="p-3 font-mono text-[10px]">{ordem.id}</td></tr>)}
                {ordensHistoricoFiltradas.length===0 && <tr><td colSpan={15} className="p-8 text-center text-emerald-100/60">Nenhuma OS encontrada com os filtros selecionados.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-emerald-100/55">A exportação Excel inclui todos os campos que o banco de teste retornar para cada OS, além do nome da unidade e uma aba de resumo com data, filtros e quantidade exportada. A aba Histórico é somente consulta; ela não altera nem apaga ordens.</p>
        </section>}
        {aba === "analise" && <section className="mt-6 space-y-5">
          {(() => {
            const diasPeriodo = Number(periodoGrafico);
            const hojeGrafico = new Date();
            hojeGrafico.setHours(0, 0, 0, 0);
            const inicioGrafico = new Date(hojeGrafico);
            inicioGrafico.setDate(inicioGrafico.getDate() - (diasPeriodo - 1));
            const chavesDias: string[] = [];
            for (let i = 0; i < diasPeriodo; i++) { const dia = new Date(inicioGrafico); dia.setDate(inicioGrafico.getDate() + i); chavesDias.push(`${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`); }
            const chaveDataLocal = (valor: string) => { const data = new Date(valor); return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`; };
            const evolucaoDiaria = chavesDias.map(chave => {
              const [ano, mes, dia] = chave.split("-").map(Number);
              return { dia: new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                abertas: ordensVisiveis.filter(o => chaveDataLocal(o.created_at) === chave).length,
                concluidas: ordensVisiveis.filter(o => o.concluida_em && chaveDataLocal(o.concluida_em) === chave).length };
            });
            const totalCadastradasPeriodo = evolucaoDiaria.reduce((soma, item) => soma + item.abertas, 0);
            const totalConcluidasPeriodo = evolucaoDiaria.reduce((soma, item) => soma + item.concluidas, 0);
            const saldoPeriodo = totalCadastradasPeriodo - totalConcluidasPeriodo;
            const total = ordensVisiveis.length;
            const concluidas = ordensVisiveis.filter(o => o.status === "concluida").length;
            const canceladas = ordensVisiveis.filter(o => o.status === "cancelada").length;
            const andamento = ordensVisiveis.filter(o => o.status === "em_andamento").length;
            const pendentes = ordensVisiveis.filter(o => o.status === "pendente").length;
            const validas = Math.max(total - canceladas, 0);
            const taxaConclusao = validas ? Math.round(concluidas / validas * 100) : 0;
            const setores = Object.entries(ordensVisiveis.reduce<Record<string, number>>((acc, o) => { const k = o.setor?.trim() || "Sem setor"; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a,b)=>b[1]-a[1]).slice(0,8);
            const classes = Object.entries(ordensVisiveis.reduce<Record<string, number>>((acc, o) => { const raw = Array.isArray(o.classe_manutencao) ? o.classe_manutencao : [o.classe_manutencao]; const values = raw.flatMap(v => typeof v === "string" ? v.split(",") : []).map(v=>v.trim()).filter(Boolean); for (const k of (values.length ? values : ["Não informada"])) acc[k]=(acc[k]||0)+1; return acc; }, {})).sort((a,b)=>b[1]-a[1]).slice(0,8);
            const tecnicos = Object.entries(ordensVisiveis.reduce<Record<string,{total:number;concluidas:number;abertas:number;andamento:number}>>((acc,o)=>{const k=o.tecnico_nome?.trim()||"Sem técnico";acc[k]??={total:0,concluidas:0,abertas:0,andamento:0};acc[k].total++;if(o.status==="concluida")acc[k].concluidas++;if(o.status==="pendente")acc[k].abertas++;if(o.status==="em_andamento")acc[k].andamento++;return acc;},{})).sort((a,b)=>b[1].concluidas-a[1].concluidas||b[1].total-a[1].total).slice(0,10);
            const pecas = ordensVisiveis.filter(o=>o.pecas_utilizadas?.trim());
            const semTecnico = ordensVisiveis.filter(o=>!o.tecnico_nome?.trim()).length;
            const semSetor = ordensVisiveis.filter(o=>!o.setor?.trim()).length;
            const semClasse = ordensVisiveis.filter(o=>!o.classe_manutencao || (Array.isArray(o.classe_manutencao) ? o.classe_manutencao.length===0 : !String(o.classe_manutencao).trim())).length;
            const fmt = (v:number) => total ? Math.round(v/total*100) : 0;
            const bar = (v:number, max:number) => Math.max(0, Math.min(100, max ? v/max*100 : 0));
            return <>
              <div className="overflow-hidden rounded-3xl border border-emerald-700 bg-gradient-to-br from-[#064b3e] via-[#034033] to-[#022c26] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><p className="text-xs font-bold uppercase tracking-[.22em] text-lime-300">Inteligência operacional · ambiente de teste</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Análise Técnica & Desempenho</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/75">Visão executiva da operação: volume de serviços, andamento da carteira, produtividade, concentração por setor e qualidade do preenchimento. Os indicadores respeitam a unidade selecionada e os dados disponíveis.</p></div>
                  <div className="rounded-xl border border-lime-300/30 bg-black/10 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-100/65">Escopo analisado</div><div className="mt-1 text-sm font-bold">{perfilAtual === "admin_unidade" ? (unidades.find(u=>u.id===unidadeAtualId)?.nome || "Sua unidade") : filtro === "Todas" ? "Todas as unidades" : filtro}</div><div className="mt-1 text-xs text-emerald-100/60">{total} ordens de serviço no filtro atual</div></div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-emerald-800 bg-[#003b32] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-100/65">Ordens analisadas</span><ClipboardList size={18} className="text-emerald-300"/></div><div className="mt-3 text-3xl font-extrabold">{total}</div><div className="mt-1 text-xs text-emerald-100/55">Carteira dentro do filtro atual</div></article>
                <article className="rounded-2xl border border-lime-700/50 bg-[#003b32] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-100/65">Taxa de conclusão</span><CheckCircle2 size={18} className="text-lime-300"/></div><div className="mt-3 text-3xl font-extrabold text-lime-300">{taxaConclusao}%</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-950"><div className="h-full rounded-full bg-lime-300" style={{width:taxaConclusao+"%"}}/></div><div className="mt-2 text-xs text-emerald-100/55">{concluidas} concluídas de {validas} não canceladas</div></article>
                <article className="rounded-2xl border border-amber-700/40 bg-[#003b32] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-100/65">Em aberto</span><Clock3 size={18} className="text-amber-300"/></div><div className="mt-3 text-3xl font-extrabold text-amber-200">{pendentes+andamento}</div><div className="mt-1 text-xs text-emerald-100/55">{pendentes} pendentes · {andamento} em andamento</div></article>
                <article className="rounded-2xl border border-sky-800/70 bg-[#003b32] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-100/65">Registros com peças</span><Building2 size={18} className="text-sky-300"/></div><div className="mt-3 text-3xl font-extrabold text-sky-200">{pecas.length}</div><div className="mt-1 text-xs text-emerald-100/55">{fmt(pecas.length)}% das OS possuem peça descrita</div></article>
              </div>
              <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-base font-extrabold">Evolução diária das OS</h3><p className="mt-1 text-xs text-emerald-100/60">Ordens cadastradas e concluídas por dia, conforme os registros disponíveis</p></div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-emerald-100/75">Período
                    <select aria-label="Período do gráfico de evolução" value={periodoGrafico} onChange={e => setPeriodoGrafico(e.target.value as "7" | "14" | "30")} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option></select>
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-sky-700/60 bg-sky-950/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-sky-200/75">OS cadastradas no período</p><p className="mt-1 text-2xl font-extrabold text-sky-200">{totalCadastradasPeriodo}</p><p className="mt-1 text-[10px] text-emerald-100/50">Soma dos registros criados nos dias exibidos</p></div>
                  <div className="rounded-xl border border-lime-700/60 bg-lime-950/20 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-lime-200/75">OS concluídas no período</p><p className="mt-1 text-2xl font-extrabold text-lime-200">{totalConcluidasPeriodo}</p><p className="mt-1 text-[10px] text-emerald-100/50">Soma das conclusões registradas nos dias exibidos</p></div>
                  <div className="rounded-xl border border-emerald-700 bg-emerald-950/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100/70">Diferença entre entradas e conclusões</p><p className={`mt-1 text-2xl font-extrabold ${saldoPeriodo > 0 ? "text-amber-200" : saldoPeriodo < 0 ? "text-lime-200" : "text-emerald-100"}`}>{saldoPeriodo > 0 ? "+" : ""}{saldoPeriodo}</p><p className="mt-1 text-[10px] text-emerald-100/50">Indicador de fluxo, não o saldo total da carteira</p></div>
                </div>
                <div className="mt-4 h-[300px] w-full" role="img" aria-label={`Gráfico de OS cadastradas e concluídas nos últimos ${diasPeriodo} dias`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evolucaoDiaria} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f5b4e" />
                      <XAxis dataKey="dia" tick={{ fill: "#b7d5ca", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#356b5e" }} />
                      <YAxis allowDecimals={false} width={34} tick={{ fill: "#b7d5ca", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#002b25", border: "1px solid #286052", borderRadius: 10, color: "#f0fdf4" }} labelStyle={{ color: "#d1fae5" }} />
                      <Legend wrapperStyle={{ color: "#d1fae5", fontSize: 12 }} />
                      <Bar dataKey="abertas" name="OS cadastradas" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="concluidas" name="OS concluídas" fill="#bef264" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-emerald-100/45">O gráfico considera a data de cadastro e a data de conclusão registrada; dias sem movimentação aparecem com zero.</p>
              </article>
              <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-extrabold">Situação da carteira</h3><p className="mt-1 text-xs text-emerald-100/60">Distribuição por status de atendimento</p></div><span className="rounded-full border border-emerald-700 px-3 py-1 text-xs text-emerald-100/70">Total: {total}</span></div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-[160px_1fr] sm:items-center">
                    <div className="relative mx-auto h-36 w-36 rounded-full" style={{background:total ? "conic-gradient(#bef264 0% "+fmt(concluidas)+"%, #38bdf8 "+fmt(concluidas)+"% "+(fmt(concluidas)+fmt(andamento))+"%, #fbbf24 "+(fmt(concluidas)+fmt(andamento))+"% "+(fmt(concluidas)+fmt(andamento)+fmt(pendentes))+"%, #64748b "+(fmt(concluidas)+fmt(andamento)+fmt(pendentes))+"% 100%)" : "#123b32"}}><div className="absolute inset-4 flex flex-col items-center justify-center rounded-full border border-emerald-800 bg-[#00352d]"><strong className="text-3xl">{total}</strong><span className="text-[10px] uppercase tracking-wide text-emerald-100/60">ordens</span></div></div>
                    <div className="space-y-3">{[{label:"Concluídas",value:concluidas,color:"bg-lime-300",status:"concluida"},{label:"Em andamento",value:andamento,color:"bg-sky-400",status:"em_andamento"},{label:"Pendentes",value:pendentes,color:"bg-amber-300",status:"pendente"},{label:"Canceladas",value:canceladas,color:"bg-slate-500",status:"cancelada"}].map(item=><button type="button" key={item.label} onClick={()=>{setHistoricoStatus(item.status as "concluida" | "em_andamento" | "pendente" | "cancelada");setAba("historico");}} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-emerald-900/60 focus:outline-none focus:ring-2 focus:ring-lime-300" title={`Abrir histórico: ${item.label}`}><span className={"h-2.5 w-2.5 shrink-0 rounded-sm "+item.color}/><span className="min-w-0 flex-1 text-sm text-emerald-100/80">{item.label}</span><strong className="text-sm tabular-nums">{item.value}</strong><span className="w-11 text-right text-xs text-emerald-100/55">{fmt(item.value)}%</span><span className="text-[10px] text-lime-300">Ver OS →</span></button>)}</div>
                  </div>
                </article>
                <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-5">
                  <div><h3 className="text-base font-extrabold">Distribuição por classe de serviço</h3><p className="mt-1 text-xs text-emerald-100/60">Classes de manutenção informadas nas OS</p></div>
                  <div className="mt-5 space-y-4">{classes.length ? classes.map(([nome,valor])=><div key={nome}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate text-emerald-100/85">{nome}</span><strong className="tabular-nums">{valor}</strong></div><div className="h-2 overflow-hidden rounded-full bg-emerald-950"><div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-300" style={{width:bar(valor,classes[0]?.[1]||1)+"%"}}/></div></div>) : <p className="text-sm text-emerald-100/55">Ainda não há classes registradas.</p>}</div>
                </article>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-5">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-extrabold">Volume de OS por setor</h3><p className="mt-1 text-xs text-emerald-100/60">Onde a demanda está concentrada · até 8 setores</p></div><Users size={18} className="text-emerald-300"/></div>
                  <div className="mt-5 space-y-4">{setores.length ? setores.map(([nome,valor])=><div key={nome}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-emerald-100/85">{nome}</span><strong>{valor} <span className="text-xs font-normal text-emerald-100/50">({fmt(valor)}%)</span></strong></div><div className="h-2.5 overflow-hidden rounded-full bg-emerald-950"><div className="h-full rounded-full bg-sky-400" style={{width:bar(valor,setores[0]?.[1]||1)+"%"}}/></div></div>) : <p className="text-sm text-emerald-100/55">Ainda não há setores registrados.</p>}</div>
                </article>
                <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-extrabold">Produtividade por técnico</h3><p className="mt-1 text-xs text-emerald-100/60">Concluídas em relação ao volume atribuído · até 10 técnicos</p></div><Users size={18} className="text-lime-300"/></div>
                  <div className="mt-5 space-y-4">{tecnicos.length ? tecnicos.map(([nome,resumo])=>{const taxa=resumo.total?Math.round(resumo.concluidas/resumo.total*100):0;return <div key={nome}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold">{nome}</span><span className="shrink-0 text-xs text-emerald-100/70">{resumo.concluidas}/{resumo.total} concluídas</span></div><div className="h-2 overflow-hidden rounded-full bg-emerald-950"><div className="h-full rounded-full bg-lime-300" style={{width:taxa+"%"}}/></div><div className="mt-1 text-right text-[10px] text-emerald-100/50">{taxa}% de conclusão · {resumo.abertas} pendentes · {resumo.andamento} em andamento</div></div>}) : <p className="text-sm text-emerald-100/55">Ainda não há OS atribuídas a técnicos.</p>}</div>
                </article>
              </div>
              <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
                <article className="rounded-2xl border border-amber-700/40 bg-[#00352d] p-5">
                  <div><h3 className="text-base font-extrabold">Qualidade dos dados</h3><p className="mt-1 text-xs text-emerald-100/60">Campos que podem limitar a análise gerencial</p></div>
                  <div className="mt-4 space-y-3">{[{label:"Sem técnico atribuído",value:semTecnico},{label:"Sem setor informado",value:semSetor},{label:"Sem classe de manutenção",value:semClasse}].map(item=><div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-800 bg-[#002b25] p-3"><span className="text-sm text-emerald-100/80">{item.label}</span><span className={"rounded-lg px-2.5 py-1 text-sm font-bold "+(item.value ? "bg-amber-400/15 text-amber-200" : "bg-lime-300/10 text-lime-200")}>{item.value}</span></div>)}</div>
                  <p className="mt-3 text-xs leading-5 text-emerald-100/50">A qualidade dos campos influencia a leitura de produtividade e a comparação entre setores.</p>
                </article>
                <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-extrabold">Detalhamento dos serviços e peças</h3><p className="mt-1 text-xs text-emerald-100/60">Registro operacional por OS · sem estimativas financeiras</p></div><span className="rounded-full border border-emerald-700 px-3 py-1 text-xs">{pecas.length} com peças descritas</span></div>
                  <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">{ordensVisiveis.filter(o=>o.pecas_utilizadas?.trim()||o.descricao?.trim()).sort((a,b)=>(b.concluida_em||b.created_at).localeCompare(a.concluida_em||a.created_at)).map(o=><div key={o.id} className="rounded-xl border border-emerald-800 bg-[#002b25] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-xs font-bold uppercase tracking-wide text-emerald-300">{o.numero_os || "OS sem número"} · {o.frota || "Frota não informada"}</div><div className="mt-1 font-semibold">{o.descricao || "Descrição não informada"}</div></div><span className={"rounded-full px-2.5 py-1 text-[10px] font-bold uppercase "+(o.status==="concluida"?"bg-lime-300/15 text-lime-200":o.status==="em_andamento"?"bg-sky-300/15 text-sky-200":o.status==="cancelada"?"bg-slate-500/20 text-slate-300":"bg-amber-300/15 text-amber-200")}>{o.status.replace("_"," ")}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-100/60"><span>Técnico: {o.tecnico_nome || "Não atribuído"}</span><span>Setor: {o.setor || "Não informado"}</span><span>Classe: {Array.isArray(o.classe_manutencao)?o.classe_manutencao.join(", "):o.classe_manutencao || "Não informada"}</span></div><div className="mt-3 border-t border-emerald-800 pt-3 text-sm"><span className="text-xs font-bold uppercase tracking-wide text-emerald-100/50">Peças utilizadas</span><p className="mt-1 text-emerald-100/80">{o.pecas_utilizadas || "Nenhuma peça descrita"}</p></div></div>)}
                    {ordensVisiveis.filter(o=>o.pecas_utilizadas?.trim()||o.descricao?.trim()).length===0 && <p className="rounded-xl border border-dashed border-emerald-700 p-6 text-center text-sm text-emerald-100/55">Não há detalhes de serviços para exibir neste filtro.</p>}
                  </div>
                </article>
              </div>
              <article className="rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-base font-extrabold">Base técnica de ordens de serviço</h3><p className="mt-1 text-xs text-emerald-100/60">Estrutura equivalente à análise do aplicativo original, preenchida somente com os registros do ambiente de teste.</p></div>
                  {edicaoOS && perfilAtual === "gestor_central" && emailUsuarioAtual === "faber.alexsandro2011@gmail.com" && <form onSubmit={e => { e.preventDefault(); void salvarEdicaoOS(); }} className="mt-4 grid gap-3 rounded-xl border border-lime-700 bg-emerald-950/70 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <h4 className="sm:col-span-2 lg:col-span-3 font-bold text-lime-200">Editar OS {edicaoOS.numero_os || "(sem número)"}</h4>
                    <label className="grid gap-1">Nº OS<input value={edicaoOS.numero_os} onChange={e=>setEdicaoOS(v=>v?{...v,numero_os:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <label className="grid gap-1">Frota<input value={edicaoOS.frota} onChange={e=>setEdicaoOS(v=>v?{...v,frota:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <label className="grid gap-1">Setor<input value={edicaoOS.setor} onChange={e=>setEdicaoOS(v=>v?{...v,setor:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <label className="grid gap-1">Técnico<input value={edicaoOS.tecnico_nome} onChange={e=>setEdicaoOS(v=>v?{...v,tecnico_nome:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <label className="grid gap-1">Status<select value={edicaoOS.status} onChange={e=>setEdicaoOS(v=>v?{...v,status:e.target.value as Ordem["status"]}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída / Fechar no PIMS</option><option value="cancelada">Cancelada</option></select></label>
                    <label className="grid gap-1 sm:col-span-2 lg:col-span-3">Descrição<input value={edicaoOS.descricao} onChange={e=>setEdicaoOS(v=>v?{...v,descricao:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <label className="grid gap-1 sm:col-span-2 lg:col-span-3">Peças utilizadas<input value={edicaoOS.pecas_utilizadas} onChange={e=>setEdicaoOS(v=>v?{...v,pecas_utilizadas:e.target.value}:v)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2"/></label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={salvandoOS} className="rounded-lg bg-lime-400 px-4 py-2 font-bold text-emerald-950 disabled:opacity-50">{salvandoOS?"Salvando...":"Salvar alterações"}</button><button type="button" onClick={()=>setEdicaoOS(null)} className="rounded-lg border border-emerald-700 px-4 py-2">Cancelar</button></div>
                  </form>}
                  <label className="grid gap-1 text-xs text-emerald-100/70">Pesquisar na base
                    <input value={buscaBaseTecnica} onChange={e=>setBuscaBaseTecnica(e.target.value)} placeholder="OS, frota, setor, técnico, classe ou peça..." className="w-full min-w-64 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white placeholder:text-emerald-100/35"/>
                  </label>
                </div>
                <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-800">
                  <table className="min-w-[1500px] w-full text-left text-xs">
                    <thead className="sticky top-0 bg-emerald-950 text-emerald-100/80"><tr>{["Unidade","Nº OS","Frota","Setor","Localização","Descrição do serviço","Classe de manutenção","Técnico","E-mail do técnico","Peças utilizadas","Status","Entrada","Início","Conclusão","Fechamento PIMS",...(perfilAtual === "gestor_central" && emailUsuarioAtual === "faber.alexsandro2011@gmail.com" ? ["Ações"] : [])].map(c=><th key={c} className="whitespace-nowrap px-3 py-3 font-bold">{c}</th>)}</tr></thead>
                    <tbody>{ordensVisiveis.filter(o => [o.numero_os,o.frota,o.setor,o.localizacao,o.descricao,o.classe_manutencao,o.tecnico_nome,o.tecnico_email,o.pecas_utilizadas,o.status,unidades.find(u=>u.id===o.unidade_id)?.nome].flatMap(v=>Array.isArray(v)?v:[v]).filter(Boolean).some(v=>String(v).toLocaleLowerCase("pt-BR").includes(buscaBaseTecnica.trim().toLocaleLowerCase("pt-BR")))).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).map(o=><tr key={o.id} className="border-t border-emerald-900 align-top hover:bg-emerald-900/30">
                      <td className="whitespace-nowrap px-3 py-3">{unidades.find(u=>u.id===o.unidade_id)?.nome || "—"}</td>
                      <td className="px-3 py-3 font-bold text-lime-200">{o.numero_os || "Sem número"}</td><td className="px-3 py-3">{o.frota || "—"}</td><td className="px-3 py-3">{o.setor || "—"}</td><td className="px-3 py-3">{o.localizacao || "—"}</td><td className="max-w-64 whitespace-normal px-3 py-3">{o.descricao || "—"}</td>
                      <td className="px-3 py-3">{Array.isArray(o.classe_manutencao)?o.classe_manutencao.join(", "):o.classe_manutencao || "Não informada"}</td><td className="px-3 py-3">{o.tecnico_nome || "—"}</td><td className="px-3 py-3">{o.tecnico_email || "—"}</td><td className="max-w-56 whitespace-normal px-3 py-3">{o.pecas_utilizadas || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3">{o.status==="concluida"?(o.fechada_em?"Fechada no PIMS":"Fechar no PIMS"):o.status==="em_andamento"?"Em andamento":o.status==="cancelada"?"Cancelada":"Pendente"}</td><td className="whitespace-nowrap px-3 py-3">{o.entrada || "—"}</td><td className="whitespace-nowrap px-3 py-3">{o.data_inicio?formatarDataBR(o.data_inicio, true):"—"}</td><td className="whitespace-nowrap px-3 py-3">{o.concluida_em?formatarDataBR(o.concluida_em, true):"—"}</td><td className="whitespace-nowrap px-3 py-3">{o.fechada_em?formatarDataBR(o.fechada_em, true):"—"}</td>
                      {perfilAtual === "gestor_central" && emailUsuarioAtual === "faber.alexsandro2011@gmail.com" && <td className="whitespace-nowrap px-3 py-3"><div className="flex gap-2"><button type="button" onClick={()=>setEdicaoOS({id:o.id,numero_os:o.numero_os||"",frota:o.frota||"",descricao:o.descricao||"",setor:o.setor||"",tecnico_nome:o.tecnico_nome||"",status:o.status,pecas_utilizadas:o.pecas_utilizadas||""})} className="rounded-lg border border-lime-600 px-3 py-1.5 font-bold text-lime-200">Editar</button><button type="button" onClick={()=>void excluirOS(o)} className="rounded-lg border border-red-700 px-3 py-1.5 font-bold text-red-300">Excluir</button></div></td>}
                    </tr>)}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-emerald-100/50">A tabela respeita o filtro de unidade atual. Os campos sem informação permanecem em branco; nenhum dado do aplicativo oficial foi importado.</p>
              </article>
              <p className="rounded-xl border border-emerald-800 bg-[#002b25] p-3 text-xs leading-5 text-emerald-100/50">Nota de leitura: os gráficos usam os registros de OS atualmente carregados no ambiente de teste. A taxa de conclusão exclui as OS canceladas do denominador. Não são estimados custos, horas de trabalho ou economia, pois esses dados não estão disponíveis neste painel.</p>
            </>;
          })()}
        </section>}
        {aba === "estoque" && (perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <section className="mt-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Controle administrativo</p><h2 className="mt-1 text-2xl font-extrabold">Estoque de Peças</h2><p className="mt-1 text-sm text-emerald-100/70">Cadastro, saldo por unidade e histórico de movimentações. A baixa por consumo será registrada ao finalizar uma OS.</p></div>
            {perfilAtual === "gestor_central" && <label className="grid gap-1 text-sm">Unidade do estoque<select value={unidadeEstoqueId} onChange={e=>setUnidadeEstoqueId(e.target.value)} className="min-w-56 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="">Selecione uma unidade</option>{unidades.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
          </div>
          {mensagemEstoque && <div role="status" className="mb-4 rounded-lg border border-emerald-700 bg-emerald-950/50 p-3 text-sm text-emerald-100">{mensagemEstoque}</div>}
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <form onSubmit={cadastrarPeca} className="grid gap-3 rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
              <div><h3 className="font-bold">Cadastrar peça</h3><p className="text-xs text-emerald-100/70">O item pertence ao estoque da unidade selecionada.</p></div>
              <label className="grid gap-1 text-sm">Nome da peça<input required maxLength={120} value={nomePeca} onChange={e=>setNomePeca(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Saldo inicial<input type="number" min="0" step="1" required value={quantidadeInicial} onChange={e=>setQuantidadeInicial(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label><label className="grid gap-1 text-sm">Estoque mínimo<input type="number" min="0" step="1" required value={estoqueMinimo} onChange={e=>setEstoqueMinimo(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label></div>
              <button disabled={salvandoEstoque || !(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId) || !nomePeca.trim()} className="rounded-lg bg-lime-300 px-4 py-2.5 font-bold text-emerald-950 disabled:opacity-50">{salvandoEstoque ? "Salvando..." : "Cadastrar peça"}</button>
            </form>
            <form onSubmit={registrarEntrada} className="grid gap-3 rounded-2xl border border-emerald-800 bg-[#003b32] p-4">
              <div><h3 className="font-bold">Registrar entrada</h3><p className="text-xs text-emerald-100/70">A entrada é registrada no histórico com o saldo anterior e o novo saldo.</p></div>
              <label className="grid gap-1 text-sm">Peça<select required value={pecaEntradaId} onChange={e=>setPecaEntradaId(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="">Selecione a peça</option>{pecasEstoque.filter(p=>p.ativo && p.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).map(p=><option key={p.id} value={p.id}>{p.nome} · saldo {p.estoque_atual}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Quantidade recebida<input type="number" min="1" step="1" required value={quantidadeEntrada} onChange={e=>setQuantidadeEntrada(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label><label className="grid gap-1 text-sm">Observação<input value={observacaoEntrada} onChange={e=>setObservacaoEntrada(e.target.value)} placeholder="Ex.: reposição mensal" className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label></div>
              <button disabled={salvandoEstoque || !pecaEntradaId} className="rounded-lg border border-lime-400 px-4 py-2.5 font-bold text-lime-200 disabled:opacity-50">{salvandoEstoque ? "Registrando..." : "Registrar entrada"}</button>
            </form>
          </div>
          <div className="mb-5 overflow-x-auto rounded-2xl border border-emerald-800">
            <div className="border-b border-emerald-800 bg-[#003b32] p-4"><h3 className="font-bold">Saldo atual por peça</h3><p className="text-xs text-emerald-100/70">Itens em nível mínimo ficam destacados para reposição.</p></div>
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-emerald-950/70 text-emerald-100"><tr><th className="p-3">Peça</th><th className="p-3">Unidade</th><th className="p-3">Saldo</th><th className="p-3">Mínimo</th><th className="p-3">Situação</th>{perfilAtual === "gestor_central" && <th className="p-3">Ações</th>}</tr></thead><tbody>
              {pecasEstoque.filter(p=>p.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).map(p=><tr key={p.id} className="border-t border-emerald-900"><td className="p-3 font-semibold">{p.nome}</td><td className="p-3">{unidades.find(u=>u.id===p.unidade_id)?.nome || "—"}</td><td className="p-3 text-lg font-extrabold">{p.estoque_atual}</td><td className="p-3">{p.estoque_minimo}</td><td className="p-3"><span className={p.estoque_atual<=p.estoque_minimo ? "rounded-md bg-amber-950 px-2 py-1 text-amber-200" : "rounded-md bg-emerald-950 px-2 py-1 text-emerald-200"}>{p.estoque_atual<=p.estoque_minimo ? "Repor estoque" : "Disponível"}</span></td>{perfilAtual === "gestor_central" && <td className="p-3"><button type="button" disabled={salvandoEstoque} onClick={()=>void excluirPecaEstoqueTeste(p)} className="inline-flex items-center gap-1 rounded-lg border border-red-700 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950 disabled:opacity-50"><Trash2 size={14}/> Excluir peça</button></td>}</tr>)}
              {pecasEstoque.filter(p=>p.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).length===0 && <tr><td colSpan={perfilAtual === "gestor_central" ? 6 : 5} className="p-5 text-center text-emerald-100/60">{unidadeEstoqueId || perfilAtual === "admin_unidade" ? "Nenhuma peça cadastrada nesta unidade." : "Selecione uma unidade para consultar o estoque."}</td></tr>}
            </tbody></table>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-emerald-800">
            <div className="border-b border-emerald-800 bg-[#003b32] p-4"><h3 className="font-bold">Últimas movimentações</h3><p className="text-xs text-emerald-100/70">Entradas e consumo vinculado às OS.</p></div>
            <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-emerald-950/70 text-emerald-100"><tr><th className="p-3">Data</th><th className="p-3">Peça</th><th className="p-3">Movimentação</th><th className="p-3">Quantidade</th><th className="p-3">Saldo</th><th className="p-3">Observação</th></tr></thead><tbody>
              {movimentacoesEstoque.filter(m=>m.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).map(m=><tr key={m.id} className="border-t border-emerald-900"><td className="p-3 whitespace-nowrap">{formatarDataBR(m.created_at, true)}</td><td className="p-3">{m.pecas_catalogo?.nome || "Peça"}</td><td className="p-3">{m.tipo==="entrada" ? "Entrada" : m.tipo==="consumo_os" ? "Consumo em OS" : "Ajuste"}</td><td className="p-3">{m.quantidade}</td><td className="p-3">{m.saldo_anterior} → {m.saldo_posterior}</td><td className="p-3">{m.observacao || (m.ordens_servico?.numero_os ? "OS " + m.ordens_servico.numero_os : "—")}</td></tr>)}
              {movimentacoesEstoque.filter(m=>m.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).length===0 && <tr><td colSpan={6} className="p-5 text-center text-emerald-100/60">Nenhuma movimentação registrada.</td></tr>}
            </tbody></table>
          </div>
        </section>}
        {aba === "unidades" && perfilAtual === "gestor_central" && <section className="mt-8 space-y-5">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime-300">Administração global</p><h1 className="mt-1 text-2xl font-extrabold">Gestão de Unidades</h1><p className="mt-2 max-w-3xl text-sm text-emerald-100/70">Cadastre novas unidades e controle sua disponibilidade. As permissões são verificadas também no banco de dados do ambiente de teste.</p></div>
          {mensagemUnidades && <div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/60 p-3 text-sm">{mensagemUnidades}</div>}
          <form onSubmit={cadastrarUnidade} className="grid gap-3 rounded-2xl border border-emerald-700 bg-[#00352d] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-semibold">Nome da nova unidade<input required minLength={2} maxLength={100} value={nomeUnidadeNova} onChange={e=>setNomeUnidadeNova(e.target.value)} placeholder="Ex.: Unidade Santa Fé" className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-3 text-sm font-normal text-white"/></label>
            <button type="submit" disabled={salvandoUnidade || nomeUnidadeNova.trim().length<2} className="rounded-lg bg-lime-300 px-5 py-3 text-sm font-bold text-emerald-950 disabled:opacity-50">{salvandoUnidade ? "Cadastrando..." : "＋ Adicionar unidade"}</button>
          </form>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {unidades.map(unidade => <article key={unidade.id} className="rounded-2xl border border-emerald-800 bg-[#00352d] p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{unidade.nome}</h2><p className="mt-1 text-xs text-emerald-100/60">Código interno: {unidade.codigo}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${unidade.ativa === false ? "bg-slate-700 text-slate-200" : "bg-lime-300/15 text-lime-200"}`}>{unidade.ativa === false ? "Inativa" : "Ativa"}</span></div>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>{const novoNome=window.prompt("Novo nome da unidade:",unidade.nome);if(novoNome?.trim() && novoNome.trim()!==unidade.nome) void atualizarUnidade(unidade,{nome:novoNome.trim()});}} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold hover:bg-emerald-900">Editar nome</button><button type="button" onClick={()=>void atualizarUnidade(unidade,{ativa:unidade.ativa===false})} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold hover:bg-emerald-900">{unidade.ativa===false ? "Ativar unidade" : "Desativar unidade"}</button><button type="button" onClick={()=>void excluirUnidadeTeste(unidade)} className="rounded-lg border border-red-700 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950">Excluir definitivamente</button></div>
              <p className="mt-3 text-xs text-emerald-100/55">OS vinculadas e histórico não são apagados ao desativar.</p>
            </article>)}
            {unidades.length===0 && <div className="rounded-xl border border-dashed border-emerald-700 p-8 text-sm text-emerald-100/60">Nenhuma unidade retornada pelo banco de teste.</div>}
          </div>
        </section>}
        {aba === "dispositivos" && perfilAtual === "gestor_central" && <section className="mt-8 space-y-5">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime-300">Segurança de acesso</p><h1 className="mt-1 text-2xl font-extrabold">Dispositivos e acessos</h1><p className="mt-2 max-w-3xl text-sm text-emerald-100/70">Identifique navegadores usados por cada conta e bloqueie ou libere um dispositivo. O bloqueio será aplicado no próximo acesso e também verificado periodicamente enquanto a sessão estiver aberta.</p></div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-700 bg-emerald-950/40 p-4"><div className="text-sm text-emerald-100/80"><strong>{dispositivos.length}</strong> dispositivos registrados · <strong>{dispositivos.filter(d => !d.bloqueado && Date.now() - new Date(d.ultimo_acesso_em).getTime() < 120000).length}</strong> vistos nos últimos 2 minutos</div><button type="button" onClick={() => void carregarDispositivos()} disabled={carregandoDispositivos} className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-900 disabled:opacity-50">{carregandoDispositivos ? "Atualizando…" : "Atualizar lista"}</button></div>
          {mensagemDispositivos && <div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/60 p-3 text-sm">{mensagemDispositivos}</div>}
          <div className="grid gap-3">
            {dispositivos.map(dispositivo => {
              const online = Date.now() - new Date(dispositivo.ultimo_acesso_em).getTime() < 120000;
              return <article key={dispositivo.id} className="rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3"><div className="rounded-xl bg-emerald-900 p-3 text-lime-200"><MonitorSmartphone size={22}/></div><div className="min-w-0"><h2 className="break-words text-lg font-bold">{dispositivo.nome_dispositivo}</h2><p className="mt-1 break-all text-sm text-emerald-100/80">{dispositivo.user_email || "E-mail não identificado"}</p><p className="mt-1 text-xs text-emerald-100/50">ID da conta: {dispositivo.user_id}</p></div></div>
                  <span className={dispositivo.bloqueado ? "rounded-full bg-red-950 px-3 py-1 text-xs font-bold text-red-200" : online ? "rounded-full bg-lime-300/15 px-3 py-1 text-xs font-bold text-lime-200" : "rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-slate-200"}>{dispositivo.bloqueado ? "Bloqueado" : online ? "Visto agora" : "Offline"}</span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-emerald-100/70 sm:grid-cols-2"><p><strong>Último acesso:</strong> {formatarDataBR(dispositivo.ultimo_acesso_em, true)}</p><p><strong>Registrado em:</strong> {formatarDataBR(dispositivo.criado_em, true)}</p><p className="sm:col-span-2"><strong>Navegador/dispositivo:</strong> {dispositivo.user_agent || "Informação indisponível"}</p><p className="sm:col-span-2 break-all"><strong>Identificador deste navegador:</strong> {dispositivo.device_id}</p></div>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { const nome = window.prompt("Nome para identificar este computador ou celular:", dispositivo.nome_dispositivo); if (nome?.trim()) void administrarDispositivo(dispositivo, dispositivo.bloqueado, nome.trim()); }} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-3 py-2 text-xs font-semibold hover:bg-emerald-900"><Pencil size={14}/>Renomear</button>{dispositivo.bloqueado ? <button type="button" onClick={() => { if (window.confirm("Desbloquear este dispositivo?")) void administrarDispositivo(dispositivo, false); }} className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-emerald-950 hover:bg-lime-200"><ShieldCheck size={14}/>Desbloquear acesso</button> : <button type="button" onClick={() => { if (window.confirm("Bloquear este dispositivo? O navegador será desconectado na próxima verificação de acesso.")) void administrarDispositivo(dispositivo, true); }} className="inline-flex items-center gap-2 rounded-lg border border-red-700 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-950"><ShieldX size={14}/>Bloquear acesso</button>}</div>
              </article>;
            })}
            {dispositivos.length === 0 && <div className="rounded-xl border border-dashed border-emerald-700 p-8 text-center text-sm text-emerald-100/60">{carregandoDispositivos ? "Carregando dispositivos…" : "Nenhum dispositivo registrado ainda. Cada dispositivo aparecerá depois que o usuário entrar no ambiente de teste."}</div>}
          </div>
          <p className="text-xs text-emerald-100/55">Observação: o site identifica o navegador/dispositivo e seu identificador local; não consegue ler com segurança o nome real do computador. Se o usuário limpar os dados do navegador ou usar outro navegador, poderá aparecer como um novo dispositivo.</p>
        </section>}
        {aba === "usuarios" && (perfilAtual === "gestor_central" || perfilAtual === "admin_unidade") && <section className="mt-8">
          <div className="mb-4"><h2 className="text-2xl font-extrabold">{perfilAtual === "admin_unidade" ? "Técnicos da Unidade" : "Gestão de Usuários"}</h2><p className="mt-1 text-sm text-emerald-100/70">{perfilAtual === "admin_unidade" ? "Cadastre técnicos somente para a sua unidade. Você não pode criar ADMs nem alterar contas administrativas." : "Cadastro e gerenciamento de contas somente no banco de teste multiunidade."}</p></div>
          <div className="mb-5 rounded-xl border border-emerald-700 bg-emerald-950/40 p-4 text-sm text-emerald-100"><strong>Área administrativa protegida.</strong><p className="mt-1">{perfilAtual === "admin_unidade" ? "O servidor vincula automaticamente cada técnico à sua própria unidade." : "O servidor confirma o perfil Gestor Geral ativo antes de executar qualquer operação."} Senhas existentes nunca são exibidas; somente a conta principal pode redefini-las.</p></div>
          {erroUsuarios && <div role="alert" className="mb-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-100">{erroUsuarios}</div>}
          {mensagemUsuarios && <div role="status" className="mb-4 rounded-xl border border-lime-700 bg-lime-950/30 p-3 text-sm text-lime-100">{mensagemUsuarios}</div>}
          {perfilAtual === "gestor_central" && <form onSubmit={salvarNomePerfil} className="mb-5 grid gap-3 rounded-2xl border border-lime-700/70 bg-lime-950/20 p-4 sm:grid-cols-[1fr_auto] sm:items-end"><div><h3 className="font-bold">Nome do seu perfil</h3><p className="mt-1 text-xs text-emerald-100/70">Atualize somente o nome exibido da sua conta principal. E-mail, senha e permissões não serão alterados.</p><label className="mt-3 grid gap-1 text-sm">Nome completo<input required minLength={2} maxLength={120} value={nomePerfil} onChange={e=>setNomePerfil(e.target.value)} placeholder="Digite seu nome completo" className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label></div><button type="submit" disabled={salvandoNomePerfil || nomePerfil.trim().length<2 || !usuarioAtualId} className="rounded-lg bg-lime-300 px-4 py-2.5 font-bold text-emerald-950 disabled:opacity-50">{salvandoNomePerfil ? "Salvando…" : "Salvar meu nome"}</button></form>}
          <form onSubmit={criarUsuario} className="mb-6 grid gap-3 rounded-2xl border border-emerald-800 bg-[#003b32] p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3"><h3 className="font-bold">Cadastrar usuário</h3><p className="mt-1 text-xs text-emerald-100/70">A senha inicial deve ter pelo menos 8 caracteres. Informe uma senha temporária e compartilhe-a com segurança.</p></div>
            <label className="grid gap-1 text-sm">Nome completo<input required maxLength={120} value={nomeNovo} onChange={e=>setNomeNovo(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            <label className="grid gap-1 text-sm">E-mail<input required type="email" value={emailNovo} onChange={e=>setEmailNovo(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            <label className="grid gap-1 text-sm">Senha inicial<input required type="password" minLength={8} maxLength={128} value={senhaNova} onChange={e=>setSenhaNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white" /></label>
            {perfilAtual === "gestor_central" && <label className="grid gap-1 text-sm">Perfil<select value={perfilNovo} onChange={e=>setPerfilNovo(e.target.value as PerfilUsuario)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="tecnico">Técnico</option><option value="admin_unidade">ADM da unidade</option><option value="visualizador">Somente visualização</option><option value="gestor">Gestor</option><option value="gestor_central">Gestor Geral</option></select></label>}
            {perfilAtual === "gestor_central" && perfilNovo !== "gestor_central" && perfilNovo !== "gestor" && <label className="grid gap-1 text-sm">Unidade<select required value={unidadeNova} onChange={e=>setUnidadeNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"><option value="" disabled>Selecione uma unidade</option>{unidades.filter(unidade => unidade.ativa !== false).map(unidade => <option key={unidade.id} value={unidade.codigo}>{unidade.nome}</option>)}</select></label>}
            {perfilAtual === "admin_unidade" && <div className="grid gap-1 text-sm"><span>Unidade vinculada</span><div className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2">{unidades.find(unidade => unidade.id === unidadeAtualId)?.nome ?? "Carregando unidade..."}</div></div>}
            <div className="flex items-end"><button disabled={salvandoUsuario} type="submit" className="w-full rounded-lg bg-lime-300 px-4 py-2.5 font-bold text-emerald-950 hover:bg-lime-200 disabled:opacity-50">{salvandoUsuario ? "Salvando…" : "Criar usuário"}</button></div>
          </form>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-bold">Contas e permissões</h3>{perfilAtual === "gestor_central" && <label className="mt-2 grid gap-1 text-xs font-semibold text-emerald-100/80">Filtrar por unidade<select value={filtroUnidadeUsuarios} onChange={e=>setFiltroUnidadeUsuarios(e.target.value)} className="min-w-56 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-white"><option value="todas">Todas as unidades</option><option value="sem_unidade">Sem unidade / acesso global</option>{unidades.map(unidade=><option key={unidade.id} value={unidade.id}>{unidade.nome}</option>)}</select></label>}</div><button type="button" onClick={()=>void carregarUsuariosAdmin()} disabled={carregandoUsuarios} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm hover:bg-emerald-900 disabled:opacity-50">{carregandoUsuarios ? "Atualizando…" : "Atualizar lista"}</button></div>
          <div className="overflow-x-auto rounded-xl border border-emerald-800">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#003b32] text-emerald-100"><tr><th className="p-3">Usuário</th><th className="p-3">Perfil / unidade</th><th className="p-3">Situação</th><th className="p-3">Ações</th></tr></thead>
              <tbody>{usuariosAdmin.filter(usuario => filtroUnidadeUsuarios === "todas" || (filtroUnidadeUsuarios === "sem_unidade" ? !usuario.unidade_id : usuario.unidade_id === filtroUnidadeUsuarios)).map(usuario => <tr key={usuario.user_id} className="border-t border-emerald-900 align-top">
                <td className="p-3"><div className="font-semibold">{usuario.nome || "Nome não informado"}</div><div className="text-xs text-emerald-100/70">{usuario.email}</div><div className="mt-1 font-mono text-[10px] text-emerald-100/40">{usuario.user_id}</div></td>
                <td className="p-3"><div>{({admin_unidade:"ADM da unidade",tecnico:"Técnico",gestor:"Gestor",gestor_central:"Gestor Geral",visualizador:"Somente visualização"} as Record<string,string>)[usuario.perfil] || usuario.perfil}</div><div className="text-xs text-emerald-100/70">{usuario.unidade_id ? unidades.find(u=>u.id===usuario.unidade_id)?.nome || "Unidade não encontrada" : "Todas as unidades"}</div>
                  {perfilAtual === "gestor_central" && usuario.perfil !== "gestor_central" && <div className="mt-2 flex flex-wrap gap-2"><select aria-label={`Perfil de ${usuario.email}`} defaultValue={usuario.perfil} id={`perfil-${usuario.user_id}`} className="rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-xs text-white"><option value="tecnico">Técnico</option><option value="admin_unidade">ADM</option><option value="gestor">Gestor</option><option value="visualizador">Visualizador</option></select><select aria-label={`Unidade de ${usuario.email}`} defaultValue={unidades.find(u=>u.id===usuario.unidade_id)?.codigo || "vale_parana"} id={`unidade-${usuario.user_id}`} className="rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-xs text-white">{unidades.map(unidade=><option key={unidade.id} value={unidade.codigo} disabled={unidade.ativa === false}>{unidade.nome}{unidade.ativa === false ? " (inativa)" : ""}</option>)}</select><button type="button" onClick={()=>{const p=document.getElementById(`perfil-${usuario.user_id}`) as HTMLSelectElement|null;const u=document.getElementById(`unidade-${usuario.user_id}`) as HTMLSelectElement|null;if(p&&u)void atualizarUsuario(usuario,p.value as PerfilUsuario,u.value)}} className="rounded border border-emerald-600 px-2 py-1 text-xs hover:bg-emerald-900">Salvar</button></div>}
                </td>
                <td className="p-3"><span className={usuario.ativo ? "rounded-md bg-emerald-900 px-2 py-1 text-emerald-200" : "rounded-md bg-red-950 px-2 py-1 text-red-200"}>{usuario.ativo ? "Ativo" : "Inativo"}</span></td>
                <td className="p-3">{perfilAtual === "gestor_central" && <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setUsuarioSenhaEdicao(usuario.user_id);setSenhaUsuarioNova("");setConfirmarSenhaUsuarioNova("");setErroUsuarios("");setMensagemUsuarios("");}} className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-200 hover:bg-amber-950">Redefinir senha</button><button type="button" onClick={()=>void alternarAtivo(usuario)} className="rounded border border-emerald-600 px-2 py-1 text-xs hover:bg-emerald-900">{usuario.ativo ? "Desativar" : "Ativar"}</button><button type="button" onClick={()=>void excluirUsuario(usuario)} className="rounded border border-red-800 px-2 py-1 text-xs text-red-200 hover:bg-red-950">Excluir</button></div>}{usuarioSenhaEdicao === usuario.user_id && perfilAtual === "gestor_central" && <div className="mt-3 grid gap-2 rounded-lg border border-amber-800 bg-amber-950/20 p-3"><strong>Redefinir senha: {usuario.email}</strong><p className="text-xs text-emerald-100/70">A senha atual não pode ser visualizada. Digite uma nova senha com pelo menos 8 caracteres.</p><label className="grid gap-1 text-xs">Nova senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={senhaUsuarioNova} onChange={e=>setSenhaUsuarioNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label><label className="grid gap-1 text-xs">Confirmar senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmarSenhaUsuarioNova} onChange={e=>setConfirmarSenhaUsuarioNova(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label><div className="flex flex-wrap gap-2"><button type="button" disabled={salvandoSenhaUsuario} onClick={()=>void salvarSenhaUsuario(usuario)} className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50">{salvandoSenhaUsuario ? "Salvando…" : "Confirmar senha"}</button><button type="button" onClick={()=>{setUsuarioSenhaEdicao(null);setSenhaUsuarioNova("");setConfirmarSenhaUsuarioNova("");}} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs">Cancelar</button></div></div>}</td>
              </tr>)}
              {usuariosAdmin.filter(usuario => filtroUnidadeUsuarios === "todas" || (filtroUnidadeUsuarios === "sem_unidade" ? !usuario.unidade_id : usuario.unidade_id === filtroUnidadeUsuarios)).length===0 && <tr><td colSpan={4} className="p-5 text-center text-emerald-100/60">{carregandoUsuarios ? "Carregando usuários…" : "Nenhum usuário encontrado para esta unidade."}</td></tr>}</tbody>
            </table>
          </div>
          {perfilAtual === "gestor_central" && <p className="mt-3 text-xs text-emerald-100/60">Gestores Gerais só podem ser criados pela conta principal. A exclusão remove a conta de autenticação do ambiente de teste; confirme antes de excluir.</p>}
        </section>}
        <p className="mt-6 rounded-xl border border-emerald-800 bg-[#003b32] p-3 text-xs text-emerald-100/80">Ambiente isolado de teste. As permissões de criar e editar OS são validadas também pelas políticas RLS do banco de teste; o banco oficial e suas OS não são consultados por esta rota.</p>
        {atualizadoEm && <p className="mt-2 text-right text-xs text-emerald-100/50">Última atualização: {formatarDataBR(atualizadoEm, true)}</p>}
          </main>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, accent, compact = false }: { icon: React.ReactNode; label: string; value: string | number; accent: string; compact?: boolean }) {
  return <section className="min-w-0 rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100/70">{icon}{label}</div><div className={`mt-3 break-words font-extrabold ${accent} ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>{value}</div></section>;
}