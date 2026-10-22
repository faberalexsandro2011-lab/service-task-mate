import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Clock3, ClipboardList, RefreshCw, ShieldAlert, ClipboardPaste, Upload, Plus, FileSpreadsheet, CheckCircle2, Circle, PlayCircle, XCircle, Search, ListFilter, ArrowUpDown, ArrowUp, ArrowDown, Users } from "lucide-react";
import { read, utils } from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/painel-teste")({
  component: PainelTeste,
});

type Unidade = { id: string; codigo: string; nome: string };
type PerfilUsuario = "admin_unidade" | "tecnico" | "gestor_central" | "visualizador";
type UsuarioUnidade = { user_id: string; unidade_id: string | null; perfil: PerfilUsuario; ativo: boolean };
type UsuarioAdministrado = UsuarioUnidade & { email: string; nome: string; created_at?: string };
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
  const [statusFiltro, setStatusFiltro] = useState<"Todas" | Ordem["status"]>("Todas");
  const [buscaOS, setBuscaOS] = useState("");
  const [filtrosColuna, setFiltrosColuna] = useState<{ os: string[]; frota: string[]; setor: string[]; localizacao: string[]; tecnico: string[] }>({ os: [], frota: [], setor: [], localizacao: [], tecnico: [] });
  const [ordenacaoColuna, setOrdenacaoColuna] = useState<{ chave: "os" | "frota" | "setor" | "localizacao" | "tecnico"; direcao: "asc" | "desc" }>({ chave: "os", direcao: "asc" });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [ordemSelecionada, setOrdemSelecionada] = useState<string | null>(null);
  const [aba, setAba] = useState<"painel" | "solicitacoes" | "analise" | "usuarios" | "estoque">("painel");
  const [solicitacaoEmEdicao, setSolicitacaoEmEdicao] = useState<{ id: string; numero_os: string; frota: string; localizacao: string; descricao: string; setor: string; tecnico_nome: string } | null>(null);
  const [perfilAtual, setPerfilAtual] = useState<PerfilUsuario | null>(null);
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
      const { data: perfilData } = await db.from("usuarios_unidades").select("perfil,unidade_id").eq("user_id", authData.user.id).eq("ativo", true).maybeSingle();
      const perfil = (perfilData?.perfil as PerfilUsuario | undefined) ?? null;
      setPerfilAtual(perfil);
      setUnidadeAtualId((perfilData?.unidade_id as string | null | undefined) ?? null);
      if (perfilData?.unidade_id) setUnidadeEstoqueId(perfilData.unidade_id as string);
    }
    const [resultadoUnidades, resultadoOrdens, resultadoUsuarios] = await Promise.all([
      db.from("unidades").select("id,codigo,nome").order("nome"),
      db.from("ordens_servico")
        .select("id,unidade_id,numero_os,frota,descricao,setor,localizacao,sequencia,tecnico_nome,status,created_at,data_inicio,concluida_em,classe_manutencao,pecas_utilizadas")
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
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor_central") return;
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
      return { numero_os: numero, frota, entrada, descricao: get(row, "descricao"), localizacao: get(row, "localizacao"), setor: get(row, "setor"), sequencia: Number.isFinite(seqParsed) && seqRaw !== "" ? seqParsed : rowIndex + 1, tecnico_email: matched?.email ?? "", tecnico_nome: matched?.nome ?? tecnicoRaw, tecnico_original: tecnicoRaw, tecnico_valido: Boolean(tecnicoRaw && matched), valid: Boolean(numero && frota && tecnicoRaw && matched) };
    });
    // A sequência é a posição de exibição. Ordena pela coluna Seq e corrige repetições para garantir 1, 2, 3… sem duplicar a posição.
    parsed.sort((a, b) => (a.sequencia ?? Number.MAX_SAFE_INTEGER) - (b.sequencia ?? Number.MAX_SAFE_INTEGER));
    const usados = new Set<number>(); let proxima = 1;
    return parsed.map(l => { let seq = l.sequencia; if (seq == null || usados.has(seq)) { while (usados.has(proxima)) proxima++; seq = proxima; } usados.add(seq); proxima = Math.max(proxima, seq + 1); return { ...l, sequencia: seq }; });
  };
  const salvarImportacao = async () => {
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor_central") {
      setMensagemOS("Importação não permitida para este perfil (" + String(perfilAtual || "não identificado") + "). Entre com o Gestor Central ou ADM da unidade no ambiente de teste.");
      return;
    }
    const unidadeId = perfilAtual === "admin_unidade" ? unidadeAtualId : formUnidadeCentral;
    if (!unidadeId) { setMensagemOS("Selecione a unidade para importar."); return; }
    const semVinculo = linhasImportacao.filter(l => !l.tecnico_original || !l.tecnico_valido);
    if (semVinculo.length) {
      setMensagemOS(`Importação bloqueada: ${semVinculo.length} linha(s) estão sem técnico ou sem vínculo ativo nesta unidade. Preencha a coluna Técnico com o nome/e-mail cadastrado no ambiente de teste e confira novamente.`);
      return;
    }
    const validas = linhasImportacao.filter(l=>l.valid);
    if (!validas.length) { setMensagemOS("Nenhuma linha válida para importar. Confira número da OS, frota e técnico."); return; }
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
        const payload = {numero_os:l.numero_os,frota:l.frota,entrada:l.entrada||null,descricao:l.descricao||null,localizacao:l.localizacao||null,setor:l.setor||null,sequencia:l.sequencia,tecnico_id:tecnico?.user_id??null,tecnico_email:tecnico?.email??l.tecnico_email??null,tecnico_nome:tecnico?.nome??l.tecnico_nome??l.tecnico_original??null,criado_por_email:authData.user?.email??null,status:"pendente"};
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
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor_central") return;
    if (!ordensSelecionadasTransferencia.length || !tecnicoDestinoTransferencia) return;
    const tecnico = usuariosAdmin.find(u => u.user_id === tecnicoDestinoTransferencia && u.ativo && u.perfil === "tecnico");
    if (!tecnico) { setMensagemOS("Selecione um técnico ativo."); return; }
    const selecionadas = ordens.filter(o => ordensSelecionadasTransferencia.includes(o.id));
    if (selecionadas.some(o => o.unidade_id !== tecnico.unidade_id)) { setMensagemOS("O técnico selecionado precisa pertencer à mesma unidade de todas as OS selecionadas."); return; }
    if (!window.confirm(`Transferir ${selecionadas.length} OS para ${tecnico.nome}?`)) return;
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
    if (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor_central") return;
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
    if (!edicaoOS || (perfilAtual !== "admin_unidade" && perfilAtual !== "gestor_central")) return;
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

  const executarAcaoUsuario = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("gerenciar-usuarios-teste", { body: payload });
    if (error) throw new Error(error.message || "Falha ao comunicar com o serviço administrativo.");
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
  useEffect(() => { if (aba === "usuarios" || modoGestao === "colar" || modoGestao === "importar") void carregarUsuariosAdmin(); }, [aba, modoGestao]);

  const unidadesVisiveis = useMemo(
    () => perfilAtual === "admin_unidade"
      ? unidades.filter((unidade) => unidade.id === unidadeAtualId)
      : filtro === "Todas" ? unidades : unidades.filter((unidade) => unidade.nome === filtro),
    [filtro, unidades, perfilAtual, unidadeAtualId],
  );
  useEffect(() => { if (perfilAtual === "gestor_central" && !formUnidadeCentral && unidades.length) setFormUnidadeCentral(unidades[0].id); }, [perfilAtual, formUnidadeCentral, unidades]);
  useEffect(() => { if (perfilAtual === "admin_unidade" && unidadeAtualId) { const propria = unidades.find(u => u.id === unidadeAtualId); if (propria && filtro !== propria.nome) setFiltro(propria.nome); } }, [perfilAtual, unidadeAtualId, unidades, filtro]);
  const idsVisiveis = new Set(unidadesVisiveis.map((unidade) => unidade.id));
  const ordensVisiveis = ordens.filter((ordem) => idsVisiveis.has(ordem.unidade_id)).sort((a, b) => (a.sequencia ?? Number.MAX_SAFE_INTEGER) - (b.sequencia ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at));
  const abertas = ordensVisiveis.filter((ordem) => ordem.status === "pendente" || ordem.status === "em_andamento");
  const acima48h = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 48);
  const acima7d = abertas.filter((ordem) => idadeEmHoras(ordem.created_at) >= 168);
  const statusResumo = [
    { status: "Todas" as const, label: "Todas as OS", total: ordensVisiveis.length, icon: ClipboardList, color: "text-slate-100", active: "border-slate-300 bg-slate-800/70" },
    { status: "pendente" as const, label: "Pendentes", total: ordensVisiveis.filter(o => o.status === "pendente").length, icon: Circle, color: "text-amber-300", active: "border-amber-400 bg-amber-950/60" },
    { status: "em_andamento" as const, label: "Em andamento", total: ordensVisiveis.filter(o => o.status === "em_andamento").length, icon: PlayCircle, color: "text-sky-300", active: "border-sky-400 bg-sky-950/60" },
    { status: "concluida" as const, label: "Concluídas", total: ordensVisiveis.filter(o => o.status === "concluida").length, icon: CheckCircle2, color: "text-lime-300", active: "border-lime-400 bg-lime-950/50" },
    { status: "cancelada" as const, label: "Canceladas", total: ordensVisiveis.filter(o => o.status === "cancelada").length, icon: XCircle, color: "text-rose-300", active: "border-rose-400 bg-rose-950/50" },
  ];
  const ordensFiltradasPainel = ordensVisiveis.filter(ordem => {
    const statusOk = statusFiltro === "Todas" || ordem.status === statusFiltro;
    const termo = buscaOS.trim().toLocaleLowerCase("pt-BR");
    const texto = [ordem.numero_os, ordem.frota, ordem.descricao, ordem.setor, ordem.localizacao, ordem.tecnico_nome, unidades.find(u => u.id === ordem.unidade_id)?.nome].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const corresponde = (valor: string | null | undefined, selecionados: string[]) => selecionados.length === 0 || selecionados.includes(valor?.trim() || "—");
    return statusOk && (!termo || texto.includes(termo))
      && corresponde(ordem.numero_os, filtrosColuna.os)
      && corresponde(ordem.frota, filtrosColuna.frota)
      && corresponde(ordem.setor, filtrosColuna.setor)
      && corresponde(ordem.localizacao, filtrosColuna.localizacao)
      && corresponde(ordem.tecnico_nome, filtrosColuna.tecnico);
  }).sort((a, b) => {
    const valor = (o: Ordem) => ordenacaoColuna.chave === "os" ? (o.numero_os || "")
      : ordenacaoColuna.chave === "frota" ? (o.frota || "")
      : ordenacaoColuna.chave === "setor" ? (o.setor || "")
      : ordenacaoColuna.chave === "localizacao" ? (o.localizacao || "")
      : (o.tecnico_nome || "");
    const va = valor(a).toLocaleLowerCase("pt-BR");
    const vb = valor(b).toLocaleLowerCase("pt-BR");
    const comparacao = va.localeCompare(vb, "pt-BR", { numeric: true, sensitivity: "base" });
    return ordenacaoColuna.direcao === "asc" ? comparacao : -comparacao;
  });
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
      <header className="border-b border-emerald-800 bg-[#00251f] px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><div className="text-xl font-extrabold">Central OS</div><div className="text-xs text-emerald-200">PAINEL CONSOLIDADO · AMBIENTE DE TESTE</div></div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-3 text-sm text-emerald-100">Unidade
              <select value={perfilAtual === "admin_unidade" ? (unidades.find(u => u.id === unidadeAtualId)?.nome ?? "") : filtro} onChange={(e) => setFiltro(e.target.value)} disabled={perfilAtual === "admin_unidade"} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white">
                {perfilAtual !== "admin_unidade" && <option>Todas</option>}{(perfilAtual === "admin_unidade" ? unidades.filter(u => u.id === unidadeAtualId) : unidades).map((unidade) => <option key={unidade.id}>{unidade.nome}</option>)}
              </select>
            </label>
            <nav aria-label="Seções do painel" className="flex items-center gap-1 rounded-lg border border-emerald-800 bg-[#00352d] p-1">
              <button type="button" onClick={() => { if (aba === "painel" && gestaoOSAberta) { setGestaoOSAberta(false); setModoGestao("fechado"); } else { setAba("painel"); setGestaoOSAberta(true); setModoGestao("menu"); } setSolicitacaoEmEdicao(null); }} aria-current={aba === "painel" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "painel" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Gestão de OS <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-emerald-950">{ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length}</span></button>
              <button type="button" onClick={() => setAba("analise")} aria-current={aba === "analise" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "analise" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Análise Técnica</button>
              {(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <button type="button" onClick={() => setAba("estoque")} aria-current={aba === "estoque" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "estoque" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Estoque de Peças</button>}
              {perfilAtual === "gestor_central" && <button type="button" onClick={() => setAba("usuarios")} aria-current={aba === "usuarios" ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-semibold ${aba === "usuarios" ? "bg-lime-300 text-emerald-950" : "text-emerald-100 hover:bg-emerald-900"}`}>Gestão de Usuários</button>}
            </nav>
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm hover:bg-emerald-900 disabled:opacity-50"><RefreshCw size={16} className={carregando ? "animate-spin" : ""} /> Atualizar</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        {aba === "painel" && modoGestao === "solicitacoes" && (perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <section id="solicitacoes-os" className="mb-6 space-y-4 rounded-2xl border border-emerald-800 bg-[#00352d] p-4 sm:p-5">
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
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-amber-300">AGUARDANDO NÚMERO DA OS · {unidadeNome}</p><h2 className="mt-1 text-lg font-bold">{ordem.frota || "Frota não informada"}</h2><p className="mt-1 text-sm text-emerald-100/80">{ordem.descricao}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-100/60"><span>Técnico: {ordem.tecnico_nome || "Não informado"}</span><span>Setor: {ordem.setor || "—"}</span><span>Localização: {ordem.localizacao || "—"}</span><span>Solicitada: {new Date(ordem.created_at).toLocaleString("pt-BR")}</span></div></div>
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
        {aba === "painel" && <>
        <div className="mb-6 flex items-start gap-3"><Building2 className="mt-1 text-lime-300" /><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Centralização das ordens</p><h1 className="text-2xl font-extrabold sm:text-3xl">Gestão de OS</h1><p className="mt-1 text-sm text-emerald-100/70">Crie OS, importe arquivos, cole planilhas e acompanhe todas as ordens neste mesmo espaço.</p></div></div>

        {erro && <div role="alert" className="mb-5 rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-100"><strong>Não foi possível carregar os dados.</strong><p className="mt-1 break-words">{erro}</p><p className="mt-2 text-xs">Confira a sessão de teste e os vínculos de unidade do usuário. Nenhum dado fictício é exibido como se fosse real.</p></div>}
        {carregando && <p role="status" className="mb-4 text-sm text-emerald-100/80">Consultando o banco de teste…</p>}
        {!carregando && !erro && ordens.length === 0 && <div className="mb-5 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">A consulta retornou zero OS para este usuário. Isso pode significar que ainda falta associar o usuário a um perfil/unidade de teste.</div>}

        {mensagemOS && <div role="status" className="mb-4 rounded-lg border border-emerald-700 p-3 text-sm text-emerald-100">{mensagemOS}</div>}
        {gestaoOSAberta && (perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <section className="mb-5 rounded-2xl border border-emerald-700 bg-[#003b32] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Gestão de ordens de serviço</h2><p className="text-sm text-emerald-100/70">Escolha como deseja adicionar novas ordens ao sistema.</p></div><button type="button" onClick={() => { setModoGestao(modoGestao === "menu" ? "fechado" : "menu"); setMensagemOS(""); }} className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2 font-bold text-emerald-950 hover:bg-lime-200"><Plus size={17}/> Adicionar OS</button></div>
          {modoGestao === "menu" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setModoGestao("criar")} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><Plus size={26}/><b>Criar OS</b><span className="text-xs text-emerald-100/70">Cadastrar uma ordem</span></button>
            <button type="button" onClick={() => {setModoGestao("colar");setTextoPlanilha("");setLinhasImportacao([]);}} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><ClipboardPaste size={26}/><b>Colar planilha</b><span className="text-xs text-emerald-100/70">Copiar do Excel e colar</span></button>
            <button type="button" onClick={() => {setModoGestao("importar");setLinhasImportacao([]);setNomeArquivo("");}} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><Upload size={26}/><b>Importar planilha</b><span className="text-xs text-emerald-100/70">Excel, XLS ou CSV</span></button>
            <button type="button" onClick={() => setModoGestao("solicitacoes")} className="relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-950/50 p-4 hover:bg-emerald-900"><ClipboardList size={26}/><b>Solicitações de OS</b><span className="text-xs text-emerald-100/70">Ver e analisar pedidos dos técnicos</span><span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-emerald-950">{ordensVisiveis.filter(o => !o.numero_os?.trim() && o.status !== "cancelada").length} pendente(s)</span></button>
          </div>}
          {modoGestao === "criar" && <form onSubmit={criarOS} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {perfilAtual === "gestor_central" && <label className="grid gap-1 text-sm">Unidade<select required value={formUnidadeCentral} onChange={e=>setFormUnidadeCentral(e.target.value)} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white">{unidades.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
            <label className="grid gap-1 text-sm">Número da OS<input required value={formNovaOS.numero_os} onChange={e=>setFormNovaOS({...formNovaOS,numero_os:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Frota<input required value={formNovaOS.frota} onChange={e=>setFormNovaOS({...formNovaOS,frota:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Entrada / data<input type="date" value={formNovaOS.entrada} onChange={e=>setFormNovaOS({...formNovaOS,entrada:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Setor<input value={formNovaOS.setor} onChange={e=>setFormNovaOS({...formNovaOS,setor:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Localização<input value={formNovaOS.localizacao} onChange={e=>setFormNovaOS({...formNovaOS,localizacao:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">Técnico (nome)<input value={formNovaOS.tecnico_nome} onChange={e=>setFormNovaOS({...formNovaOS,tecnico_nome:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm">E-mail do técnico<input type="email" value={formNovaOS.tecnico_email} onChange={e=>setFormNovaOS({...formNovaOS,tecnico_email:e.target.value})} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">Descrição do serviço<textarea required value={formNovaOS.descricao} onChange={e=>setFormNovaOS({...formNovaOS,descricao:e.target.value})} rows={3} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-white"/></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={salvandoNovaOS || !formNovaOS.numero_os.trim() || !formNovaOS.frota.trim() || !formNovaOS.descricao.trim()} className="rounded-lg bg-lime-300 px-5 py-2.5 font-bold text-emerald-950 disabled:opacity-50">{salvandoNovaOS ? "Criando OS..." : "Salvar nova OS"}</button><button type="button" onClick={()=>setModoGestao("menu")} className="rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div>
          </form>}
          {modoGestao === "colar" && <div className="mt-4 grid gap-3"><p className="text-sm text-emerald-100/80">No Excel, selecione as linhas e pressione Ctrl+C. Cole abaixo; o sistema reconhecerá os cabeçalhos quando existirem.</p><textarea value={textoPlanilha} onChange={e=>setTextoPlanilha(e.target.value)} onPaste={e=>{const v=e.clipboardData.getData("text");if(v){e.preventDefault();setTextoPlanilha(v);}}} rows={7} placeholder={"Cole aqui as linhas do Excel...\nnumero_os\tfrota\tlocalizacao\tdescricao\ttecnico_email\tentrada"} className="w-full rounded-lg border border-emerald-700 bg-emerald-950 p-3 font-mono text-sm text-white"/><div className="flex flex-wrap gap-2"><button type="button" onClick={async ()=>{const lista=await carregarUsuariosAdmin();setLinhasImportacao(parsearLinhas(textoPlanilha,lista));}} disabled={!textoPlanilha.trim()||carregandoUsuarios} className="rounded-lg bg-lime-300 px-4 py-2 font-bold text-emerald-950">Conferir linhas</button><button type="button" onClick={()=>setModoGestao("menu")} className="rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div></div>}
          {modoGestao === "importar" && <div className="mt-4 grid gap-3"><p className="text-sm text-emerald-100/80">Escolha uma planilha Excel (.xlsx/.xls) ou arquivo CSV. O sistema mostrará uma prévia antes de salvar.</p><label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-600 p-8 text-center hover:bg-emerald-950/50"><FileSpreadsheet size={30}/><b>{nomeArquivo || "Escolher ficheiro Excel ou CSV"}</b><span className="text-xs text-emerald-100/70">Máximo 20 MB</span><input type="file" accept=".xlsx,.xls,.csv" className="mt-2 max-w-full text-sm" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>20*1024*1024){setMensagemOS("O ficheiro excede o limite de 20 MB.");return;}try{const lista=await carregarUsuariosAdmin();const wb=read(await file.arrayBuffer(),{cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw new Error("Planilha vazia");const matrix=utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:true});setLinhasImportacao(normalizarMatriz(matrix,lista));setNomeArquivo(file.name);setMensagemOS("");}catch(err){setMensagemOS("Não foi possível ler o ficheiro: "+(err instanceof Error?err.message:"erro"));}}}/></label><button type="button" onClick={()=>setModoGestao("menu")} className="justify-self-start rounded-lg border border-emerald-700 px-4 py-2">Voltar</button></div>}
          {linhasImportacao.length > 0 && <div className="mt-4"><div className="mb-2 text-sm font-semibold">{linhasImportacao.filter(l=>l.valid).length} linha(s) válidas · {linhasImportacao.filter(l=>!l.valid).length} com erro</div><div className="max-h-64 overflow-auto rounded-lg border border-emerald-800"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-emerald-950"><tr><th className="p-2">Estado</th><th className="p-2">OS</th><th className="p-2">Frota</th><th className="p-2">Setor</th><th className="p-2">Técnico</th><th className="p-2">Descrição</th></tr></thead><tbody>{linhasImportacao.slice(0,150).map((l,i)=><tr key={l.numero_os+"-"+i} className="border-t border-emerald-900"><td className="p-2">{!l.tecnico_original ? "Técnico em branco" : !l.tecnico_valido ? "Técnico sem vínculo" : !l.numero_os || !l.frota ? "Verificar dados" : "Válida"}</td><td className="p-2">{l.numero_os||"—"}</td><td className="p-2">{l.frota||"—"}</td><td className="p-2">{l.setor||"—"}</td><td className="p-2">{l.tecnico_nome || l.tecnico_original || "—"}</td><td className="p-2">{l.descricao||"—"}</td></tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void salvarImportacao()} disabled={salvandoLote||!linhasImportacao.some(l=>l.valid)||linhasImportacao.some(l=>!l.tecnico_original||!l.tecnico_valido)} className="rounded-lg bg-lime-300 px-4 py-2 font-bold text-emerald-950 disabled:opacity-50">{salvandoLote ? "Salvando..." : "Importar " + linhasImportacao.filter(l=>l.valid).length + " OS"}</button><button type="button" onClick={()=>{setLinhasImportacao([]);setTextoPlanilha("");setNomeArquivo("");}} className="rounded-lg border border-emerald-700 px-4 py-2">Limpar prévia</button></div></div>}
        </section>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<ClipboardList />} label="OS abertas" value={abertas.length} accent="text-lime-300" />
          <Metric icon={<Clock3 />} label="Abertas há mais de 48h" value={acima48h.length} accent="text-red-300" />
          <Metric icon={<ShieldAlert />} label="Alerta · mais de 7 dias" value={acima7d.length} accent="text-pink-300" />
          <Metric icon={<AlertTriangle />} label="OS mais antiga" value={maisAntiga ? formatarIdade(maisAntiga.created_at) : "—"} accent="text-sky-200" compact />
        </div>
        <section className="mt-5" aria-label="Resumo interativo dos status das ordens de serviço">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-bold">Status das ordens de serviço</h2><p className="text-sm text-emerald-100/70">Selecione um cartão para filtrar a lista. Os totais acompanham a unidade selecionada.</p></div>
            <div className="flex items-center gap-2 text-xs text-emerald-100/60"><span className="h-2 w-2 animate-pulse rounded-full bg-lime-300" /> Dados do ambiente de teste</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {statusResumo.map(item => {
              const Icon = item.icon;
              const selecionado = statusFiltro === item.status;
              return <button key={item.status} type="button" aria-pressed={selecionado} onClick={() => setStatusFiltro(item.status)} className={`group rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-lime-300 ${selecionado ? item.active : "border-emerald-800 bg-[#00352d] hover:border-emerald-500"}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-emerald-100/75">{item.label}</span><Icon size={19} className={item.color} /></div>
                <div className={`mt-3 text-3xl font-extrabold tabular-nums ${item.color}`}>{item.total}</div>
                <div className="mt-2 text-[11px] text-emerald-100/50">{selecionado ? "Filtro selecionado" : "Clique para filtrar"}</div>
              </button>;
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-800 bg-[#00352d] p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative flex min-w-0 flex-1 items-center">
                <Search size={17} className="pointer-events-none absolute left-3 text-emerald-100/50" />
                <input value={buscaOS} onChange={e => setBuscaOS(e.target.value)} placeholder="Buscar por OS, frota, técnico, setor ou descrição..." className="w-full rounded-xl border border-emerald-700 bg-emerald-950/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-emerald-100/40 focus:border-lime-300 focus:outline-none focus:ring-1 focus:ring-lime-300" />
              </label>
              <div className="flex items-center gap-2 text-sm text-emerald-100/70"><ListFilter size={16}/><span>{ordensFiltradasPainel.length} de {ordensVisiveis.length} OS</span>
                {(statusFiltro !== "Todas" || buscaOS) && <button type="button" onClick={() => { setStatusFiltro("Todas"); setBuscaOS(""); }} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900">Limpar filtros</button>}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-800 bg-[#002b25] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100/65"><ListFilter size={15}/> Filtros e classificação por coluna</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {([
                  { chave: "os", label: "OS", placeholder: "Nº da OS" },
                  { chave: "frota", label: "Frota", placeholder: "Filtrar frota" },
                  { chave: "setor", label: "Setor", placeholder: "Filtrar setor" },
                  { chave: "localizacao", label: "Localização", placeholder: "Filtrar localização" },
                  { chave: "tecnico", label: "Técnico", placeholder: "Filtrar técnico" },
                ] as const).map(coluna => {
                  const ativa = ordenacaoColuna.chave === coluna.chave;
                  return <div key={coluna.chave} className="min-w-0">
                    <button type="button" onClick={() => setOrdenacaoColuna(atual => ({ chave: coluna.chave, direcao: atual.chave === coluna.chave && atual.direcao === "asc" ? "desc" : "asc" }))} className={"mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-bold transition hover:bg-emerald-900 " + (ativa ? "text-lime-300" : "text-emerald-100/80")} title={"Classificar por " + coluna.label + ", alternando crescente e decrescente"}>
                      <span>{coluna.label}</span>{ativa ? (ordenacaoColuna.direcao === "asc" ? <ArrowUp size={14}/> : <ArrowDown size={14}/>) : <ArrowUpDown size={14} className="opacity-50"/>}
                    </button>
                    <details className="group rounded-lg border border-emerald-700 bg-emerald-950/70">
                      <summary className="cursor-pointer list-none px-2.5 py-2 text-xs text-white">{filtrosColuna[coluna.chave].length ? `${filtrosColuna[coluna.chave].length} selecionado(s)` : "Todos"} <span className="float-right text-emerald-100/60">▾</span></summary>
                      <div className="max-h-52 overflow-y-auto border-t border-emerald-800 p-2">
                        <button type="button" onClick={() => setFiltrosColuna(atual => ({ ...atual, [coluna.chave]: [] }))} className="mb-2 text-xs font-semibold text-lime-300 hover:underline">Limpar seleção</button>
                        {opcoesFiltroColuna[coluna.chave].map(opcao => <label key={opcao} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs text-emerald-50 hover:bg-emerald-900">
                          <input type="checkbox" checked={filtrosColuna[coluna.chave].includes(opcao)} onChange={e => setFiltrosColuna(atual => ({ ...atual, [coluna.chave]: e.target.checked ? [...atual[coluna.chave], opcao] : atual[coluna.chave].filter(valor => valor !== opcao) }))} className="mt-0.5 accent-lime-300"/>
                          <span className="break-words">{opcao}</span>
                        </label>)}
                        {opcoesFiltroColuna[coluna.chave].length === 0 && <p className="text-xs text-emerald-100/50">Nenhuma opção disponível</p>}
                      </div>
                    </details>
                  </div>;
                })}
              </div>
              {(Object.values(filtrosColuna).some(valores => valores.length > 0) || buscaOS || statusFiltro !== "Todas") && <button type="button" onClick={() => { setFiltrosColuna({ os: [], frota: [], setor: [], localizacao: [], tecnico: [] }); setBuscaOS(""); setStatusFiltro("Todas"); }} className="mt-3 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900">Limpar todos os filtros</button>}
            </div>
            {(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <div className="mb-3 rounded-xl border border-emerald-700 bg-emerald-950/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Transferir várias OS</strong><span className="text-xs text-emerald-100/70">{ordensSelecionadasTransferencia.length} selecionada(s)</span></div>
              <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setOrdensSelecionadasTransferencia(ordensFiltradasPainel.slice(0,100).map(o=>o.id))} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs">Selecionar todas as filtradas</button><button type="button" onClick={() => setOrdensSelecionadasTransferencia([])} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs">Limpar seleção</button><button type="button" onClick={() => void carregarUsuariosAdmin()} disabled={carregandoUsuarios} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs">{carregandoUsuarios ? "Carregando técnicos..." : "Atualizar técnicos"}</button></div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row"><select value={tecnicoDestinoTransferencia} onChange={e=>setTecnicoDestinoTransferencia(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"><option value="">Selecione o técnico de destino</option>{usuariosAdmin.filter(u=>u.ativo && u.perfil==="tecnico" && ordens.filter(o=>ordensSelecionadasTransferencia.includes(o.id)).every(o=>o.unidade_id===u.unidade_id)).map(u=><option key={u.user_id} value={u.user_id}>{u.nome} · {unidades.find(un=>un.id===u.unidade_id)?.nome || "Unidade"}</option>)}</select><button type="button" onClick={()=>void transferirOrdensSelecionadas()} disabled={transferindoOS || !ordensSelecionadasTransferencia.length || !tecnicoDestinoTransferencia} className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-50"><Users size={15} className="mr-1 inline"/>{transferindoOS ? "Transferindo..." : "Transferir selecionadas"}</button></div>
              <p className="mt-2 text-xs text-emerald-100/60">Marque mais de uma OS na lista abaixo. O técnico de destino deve ser da mesma unidade.</p>
            </div>}
            <div className="mt-3 space-y-2">
              {ordensFiltradasPainel.slice(0, 100).map(ordem => {
                const statusInfo = statusResumo.find(s => s.status === ordem.status);
                const StatusIcon = statusInfo?.icon ?? ClipboardList;
                const unidadeNome = unidades.find(u => u.id === ordem.unidade_id)?.nome ?? "Unidade";
                const statusLabel = ordem.status === "em_andamento" ? "Em andamento" : ordem.status === "concluida" ? "Concluída" : ordem.status === "cancelada" ? "Cancelada" : "Pendente";
                return <article key={ordem.id} className="rounded-xl border border-emerald-800 bg-[#002b25] p-3 transition hover:border-emerald-600 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <label className="mb-1 flex items-center gap-2 text-xs text-emerald-100/70"><input type="checkbox" checked={ordensSelecionadasTransferencia.includes(ordem.id)} onChange={e=>setOrdensSelecionadasTransferencia(v=>e.target.checked ? [...v,ordem.id] : v.filter(id=>id!==ordem.id))} className="h-4 w-4 accent-lime-300"/>Selecionar para transferência</label>}
                      <div className="flex flex-wrap items-center gap-2"><strong className="text-sm sm:text-base">{ordem.numero_os ? `OS ${ordem.numero_os}` : "OS sem número"} · {ordem.frota || "Frota não informada"}</strong><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${ordem.status === "pendente" ? "border-amber-700 bg-amber-950/50 text-amber-200" : ordem.status === "em_andamento" ? "border-sky-700 bg-sky-950/50 text-sky-200" : ordem.status === "concluida" ? "border-lime-700 bg-lime-950/40 text-lime-200" : "border-rose-800 bg-rose-950/40 text-rose-200"}`}><StatusIcon size={13}/>{statusLabel}</span></div>
                      <p className="mt-1 truncate text-sm text-emerald-100/85">{ordem.descricao || "Sem descrição"}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-100/55"><span>{unidadeNome}</span><span>{ordem.setor || "Sem setor"}</span><span>{ordem.localizacao || "Sem localização"}</span><span>{ordem.tecnico_nome || "Sem técnico"}</span><span>{ordem.status === "concluida" ? "Concluída" : "Aberta há " + formatarIdade(ordem.created_at)}</span></div>
                    </div>
                    {(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => { setMensagemOS(""); setEdicaoOS({ id: ordem.id, numero_os: ordem.numero_os || "", frota: ordem.frota || "", descricao: ordem.descricao || "", setor: ordem.setor || "", tecnico_nome: ordem.tecnico_nome || "", status: ordem.status, pecas_utilizadas: ordem.pecas_utilizadas || "" }); }} className="rounded-lg border border-lime-600 px-3 py-2 text-xs font-bold text-lime-200 transition hover:bg-emerald-900">Editar</button><button type="button" onClick={() => void excluirOS(ordem)} className="rounded-lg border border-rose-800 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-950">Excluir</button></div>}
                  </div>
                  {edicaoOS?.id === ordem.id && <div className="mt-3 grid gap-3 rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs">Número da OS<input value={edicaoOS.numero_os} onChange={e => setEdicaoOS({ ...edicaoOS, numero_os: e.target.value })} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <label className="grid gap-1 text-xs">Frota<input value={edicaoOS.frota} onChange={e => setEdicaoOS({ ...edicaoOS, frota: e.target.value })} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <label className="grid gap-1 text-xs sm:col-span-2">Descrição<textarea required value={edicaoOS.descricao} onChange={e => setEdicaoOS({ ...edicaoOS, descricao: e.target.value })} rows={2} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <label className="grid gap-1 text-xs">Setor<input value={edicaoOS.setor} onChange={e => setEdicaoOS({ ...edicaoOS, setor: e.target.value })} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <label className="grid gap-1 text-xs">Técnico<input value={edicaoOS.tecnico_nome} onChange={e => setEdicaoOS({ ...edicaoOS, tecnico_nome: e.target.value })} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <label className="grid gap-1 text-xs">Status<select value={edicaoOS.status} onChange={e => setEdicaoOS({ ...edicaoOS, status: e.target.value as Ordem["status"] })} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label>
                    <label className="grid gap-1 text-xs sm:col-span-2">Peças utilizadas<textarea value={edicaoOS.pecas_utilizadas} onChange={e => setEdicaoOS({ ...edicaoOS, pecas_utilizadas: e.target.value })} rows={2} className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" disabled={salvandoOS} onClick={() => void salvarEdicaoOS()} className="rounded-lg bg-lime-300 px-4 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50">{salvandoOS ? "Salvando..." : "Salvar alterações"}</button><button type="button" onClick={() => setEdicaoOS(null)} className="rounded-lg border border-emerald-700 px-4 py-2 text-xs">Cancelar</button></div>
                  </div>}
                </article>;
              })}
              {ordensFiltradasPainel.length === 0 && <div className="rounded-xl border border-dashed border-emerald-700 p-8 text-center"><ClipboardList size={28} className="mx-auto text-emerald-100/40"/><p className="mt-2 font-semibold">Nenhuma OS encontrada</p><p className="mt-1 text-sm text-emerald-100/60">Altere o status ou a busca para ver outras ordens.</p></div>}
              {ordensFiltradasPainel.length > 100 && <p className="pt-2 text-center text-xs text-emerald-100/50">Mostrando as primeiras 100 OS. Use a busca para refinar os resultados.</p>}
            </div>
          </div>
        </section>

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
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Unidade</div><h3 className="mt-1 text-lg font-extrabold">{unidade.nome}</h3></div><span className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-emerald-100">{perfilAtual === "admin_unidade" || perfilAtual === "gestor_central" ? "Gerenciar OS" : "Leitura"}</span></div>
            <div className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-extrabold text-lime-300">{abertasUnidade.length}</span><span className="text-sm text-emerald-100/70">OS abertas</span></div>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-emerald-950">{faixaUnidade.map((quantidade, indice) => <div key={faixas[indice].nome} className={faixas[indice].cor} style={{ width: (quantidade / Math.max(abertasUnidade.length, 1) * 100) + "%" }} />)}</div>
            <div className="mt-4 space-y-2 border-t border-emerald-800 pt-3">{faixas.map((faixa, indice) => <div key={faixa.nome} className="flex justify-between text-sm"><span className="flex items-center gap-2 text-emerald-100/80"><i className={`h-2.5 w-2.5 rounded-full ${faixa.cor}`} />{faixa.nome}</span><strong>{faixaUnidade[indice]}</strong></div>)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-800 pt-3"><div><div className="text-xl font-bold text-lime-300">{ordensUnidade.filter((ordem) => ordem.status === "concluida").length}</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Concluídas</div></div><div><div className="text-xl font-bold text-lime-300">{ordensUnidade.length}</div><div className="text-[10px] uppercase tracking-wide text-emerald-100/70">Total de OS</div></div></div>
            <button type="button" onClick={() => setOrdemSelecionada(ordemSelecionada === unidade.id ? null : unidade.id)} className="mt-4 w-full rounded-lg border border-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-900">{ordemSelecionada === unidade.id ? "Ocultar OS" : "Ver OS da unidade"}</button>
            {ordemSelecionada === unidade.id && <div className="mt-3 space-y-2">{ordensUnidade.length === 0 ? <p className="text-sm text-emerald-100/70">Nenhuma OS visível para esta unidade.</p> : ordensUnidade.map((ordem) => <div key={ordem.id} className="rounded-lg border border-emerald-800 bg-[#002b25] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{ordem.sequencia != null ? "Seq. " + ordem.sequencia + " · " : ""}{ordem.numero_os || "OS sem número"} · {ordem.frota || "Frota não informada"}</strong><span className="rounded-md bg-emerald-950 px-2 py-1 text-xs">{ordem.status.replace("_", " ")}</span></div><p className="mt-1 text-emerald-100/90">{ordem.descricao}</p><p className="mt-1 text-xs text-emerald-100/60">{ordem.setor || "Sem setor"} · {ordem.tecnico_nome || "Sem técnico"} · Criada há {formatarIdade(ordem.created_at)}</p>{(perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setMensagemOS(""); setEdicaoOS({ id: ordem.id, numero_os: ordem.numero_os || "", frota: ordem.frota || "", descricao: ordem.descricao || "", setor: ordem.setor || "", tecnico_nome: ordem.tecnico_nome || "", status: ordem.status, pecas_utilizadas: ordem.pecas_utilizadas || "" }); }} className="rounded-lg border border-lime-500 px-3 py-2 text-xs font-bold text-lime-200 hover:bg-emerald-900">Editar OS</button><button type="button" onClick={() => void excluirOS(ordem)} className="rounded-lg border border-red-800 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-950">Excluir OS</button></div>}{edicaoOS?.id === ordem.id && (perfilAtual === "admin_unidade" || perfilAtual === "gestor_central") && <div className="mt-3 grid gap-3 rounded-lg border border-emerald-700 p-3"><label className="grid gap-1 text-xs">Número da OS<input value={edicaoOS.numero_os} onChange={e => setEdicaoOS({ ...edicaoOS, numero_os: e.target.value })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Frota<input value={edicaoOS.frota} onChange={e => setEdicaoOS({ ...edicaoOS, frota: e.target.value })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Descrição<textarea value={edicaoOS.descricao} onChange={e => setEdicaoOS({ ...edicaoOS, descricao: e.target.value })} required className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" rows={3} /></label><label className="grid gap-1 text-xs">Setor<input value={edicaoOS.setor} onChange={e => setEdicaoOS({ ...edicaoOS, setor: e.target.value })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Técnico responsável<input value={edicaoOS.tecnico_nome} onChange={e => setEdicaoOS({ ...edicaoOS, tecnico_nome: e.target.value })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Status<select value={edicaoOS.status} onChange={e => setEdicaoOS({ ...edicaoOS, status: e.target.value as Ordem["status"] })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm"><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label><label className="grid gap-1 text-xs">Peças utilizadas<textarea value={edicaoOS.pecas_utilizadas} onChange={e => setEdicaoOS({ ...edicaoOS, pecas_utilizadas: e.target.value })} className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm" rows={2} /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={salvandoOS} onClick={() => void salvarEdicaoOS()} className="rounded-lg bg-lime-300 px-4 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50">{salvandoOS ? "Salvando..." : "Salvar alterações"}</button><button type="button" onClick={() => setEdicaoOS(null)} className="rounded-lg border border-emerald-700 px-4 py-2 text-xs">Cancelar</button></div></div>}</div>)}</div>}
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
            <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-emerald-950/70 text-emerald-100"><tr><th className="p-3">Peça</th><th className="p-3">Unidade</th><th className="p-3">Saldo</th><th className="p-3">Mínimo</th><th className="p-3">Situação</th></tr></thead><tbody>
              {pecasEstoque.filter(p=>p.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).map(p=><tr key={p.id} className="border-t border-emerald-900"><td className="p-3 font-semibold">{p.nome}</td><td className="p-3">{unidades.find(u=>u.id===p.unidade_id)?.nome || "—"}</td><td className="p-3 text-lg font-extrabold">{p.estoque_atual}</td><td className="p-3">{p.estoque_minimo}</td><td className="p-3"><span className={p.estoque_atual<=p.estoque_minimo ? "rounded-md bg-amber-950 px-2 py-1 text-amber-200" : "rounded-md bg-emerald-950 px-2 py-1 text-emerald-200"}>{p.estoque_atual<=p.estoque_minimo ? "Repor estoque" : "Disponível"}</span></td></tr>)}
              {pecasEstoque.filter(p=>p.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).length===0 && <tr><td colSpan={5} className="p-5 text-center text-emerald-100/60">{unidadeEstoqueId || perfilAtual === "admin_unidade" ? "Nenhuma peça cadastrada nesta unidade." : "Selecione uma unidade para consultar o estoque."}</td></tr>}
            </tbody></table>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-emerald-800">
            <div className="border-b border-emerald-800 bg-[#003b32] p-4"><h3 className="font-bold">Últimas movimentações</h3><p className="text-xs text-emerald-100/70">Entradas e consumo vinculado às OS.</p></div>
            <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-emerald-950/70 text-emerald-100"><tr><th className="p-3">Data</th><th className="p-3">Peça</th><th className="p-3">Movimentação</th><th className="p-3">Quantidade</th><th className="p-3">Saldo</th><th className="p-3">Observação</th></tr></thead><tbody>
              {movimentacoesEstoque.filter(m=>m.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).map(m=><tr key={m.id} className="border-t border-emerald-900"><td className="p-3 whitespace-nowrap">{new Date(m.created_at).toLocaleString("pt-BR")}</td><td className="p-3">{m.pecas_catalogo?.nome || "Peça"}</td><td className="p-3">{m.tipo==="entrada" ? "Entrada" : m.tipo==="consumo_os" ? "Consumo em OS" : "Ajuste"}</td><td className="p-3">{m.quantidade}</td><td className="p-3">{m.saldo_anterior} → {m.saldo_posterior}</td><td className="p-3">{m.observacao || (m.ordens_servico?.numero_os ? "OS " + m.ordens_servico.numero_os : "—")}</td></tr>)}
              {movimentacoesEstoque.filter(m=>m.unidade_id===(perfilAtual === "admin_unidade" ? unidadeAtualId : unidadeEstoqueId)).length===0 && <tr><td colSpan={6} className="p-5 text-center text-emerald-100/60">Nenhuma movimentação registrada.</td></tr>}
            </tbody></table>
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
        <p className="mt-6 rounded-xl border border-emerald-800 bg-[#003b32] p-3 text-xs text-emerald-100/80">Ambiente isolado de teste. As permissões de criar e editar OS são validadas também pelas políticas RLS do banco de teste; o banco oficial e suas OS não são consultados por esta rota.</p>
        {atualizadoEm && <p className="mt-2 text-right text-xs text-emerald-100/50">Última atualização: {atualizadoEm.toLocaleString("pt-BR")}</p>}
      </main>
    </div>
  );
}

function Metric({ icon, label, value, accent, compact = false }: { icon: React.ReactNode; label: string; value: string | number; accent: string; compact?: boolean }) {
  return <section className="min-w-0 rounded-2xl border border-emerald-800 bg-gradient-to-br from-[#003e34] to-[#002e28] p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-100/70">{icon}{label}</div><div className={`mt-3 break-words font-extrabold ${accent} ${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"}`}>{value}</div></section>;
}
