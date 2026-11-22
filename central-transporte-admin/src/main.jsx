import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/central-transporte`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const fmt = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const statusLabel = (s) => s === "COMPLETED" ? "Finalizada" : s === "IN_PROGRESS" ? "Em andamento" : s || "—";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("faber.alexsandro2011@gmail.com");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("visao");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "admin_dashboard" })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível carregar os dados.");
      setData(payload); setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || "Falha ao consultar o painel.");
    } finally { setBusy(false); }
  }, [session]);

  useEffect(() => { if (session) load(); }, [session, load]);

  const sendLink = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: "https://central-transporte-admin-test.vercel.app" } });
      if (error) throw error;
      setSent(true);
    } catch (e) { setError(e.message || "Não foi possível enviar o link."); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setData(null); setSent(false); };
  const adminAction = async (action, fields={}) => {
    const response = await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Authorization:"Bearer "+session.access_token},body:JSON.stringify({action,...fields})});
    const payload = await response.json();
    if(!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  };
  const saveDriver = async (driver=null) => {
    const matricula = window.prompt("Matrícula do motorista:",driver?.matricula || "");
    if(matricula===null) return;
    const nome = window.prompt("Nome do motorista:",driver?.nome || "");
    if(nome===null) return;
    const unidade_id = driver?.unidade_id || data?.units?.find(u=>u.ativo)?.id;
    if(!unidade_id){window.alert("Não há unidade de teste ativa.");return;}
    try { await adminAction("admin_save_driver",{id:driver?.id,matricula,nome,unidade_id}); await load(); }
    catch(e){window.alert(e.message);}
  };
  const toggleDriver = async d => { try{await adminAction("admin_toggle_driver",{id:d.id,ativo:!d.ativo});await load();}catch(e){window.alert(e.message);} };
  const provisionDevice = async () => {
    const trucks=(data?.trucks||[]).filter(t=>t.ativo);
    if(!trucks.length){window.alert("Cadastre um caminhão de teste antes.");return;}
    const choices=trucks.map((t,i)=>(i+1)+" - "+t.codigo+" ("+t.descricao+")").join("\n");
    const pick=window.prompt("Escolha o caminhão pelo número:\n"+choices,"1");
    if(pick===null)return;
    const truck=trucks[Number(pick)-1];
    if(!truck){window.alert("Número inválido.");return;}
    const nome=window.prompt("Nome do dispositivo:","SOL 7 - "+truck.codigo);
    if(nome===null)return;
    try{const result=await adminAction("admin_provision_device",{frota_id:truck.id,nome});window.alert("Dispositivo criado. Copie e guarde este token; ele será exibido somente agora:\n\n"+result.device_token);await load();}catch(e){window.alert(e.message);}
  };
  const toggleDevice = async d => {try{await adminAction("admin_toggle_device",{id:d.id,ativo:!d.ativo});await load();}catch(e){window.alert(e.message);}};
  const truckFor = id => (data?.trucks||[]).find(t=>t.id===id);

  const trips = data?.trips || [];
  const filteredTrips = useMemo(() => trips.filter(t => [t.motorista_nome,t.motorista_matricula,t.origem,t.destino,t.tipo,t.status].join(" ").toLowerCase().includes(search.toLowerCase())), [trips, search]);
  const filteredDrivers = (data?.drivers || []).filter(d => [d.nome,d.matricula].join(" ").toLowerCase().includes(search.toLowerCase()));
  const filteredDevices = (data?.devices || []).filter(d => [d.nome,d.frota_id,truckFor(d.frota_id)?.codigo,truckFor(d.frota_id)?.descricao].join(" ").toLowerCase().includes(search.toLowerCase()));

  if (!SUPABASE_URL || !SUPABASE_KEY) return <main className="login-shell"><section className="login-card"><h1>Configuração pendente</h1><p>Defina as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de testes.</p></section></main>;

  if (!session) return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">CT</div><p className="eyebrow">AMBIENTE DE TESTES</p><h1>Central Transporte</h1><p className="muted">Painel administrativo de viagens, motoristas e dispositivos SOL 7.</p>
    {sent ? <div className="notice"><strong>Link enviado.</strong><br/>Confira a caixa de entrada de {email} e abra o link neste navegador.</div> : <form onSubmit={sendLink}>
      <label htmlFor="email">E-mail do administrador</label><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <button disabled={busy}>{busy ? "Enviando..." : "Enviar link de acesso"}</button>
    </form>}
    {error && <p className="error">{error}</p>}<p className="footnote">Acesso restrito ao administrador autorizado. Nenhuma senha é solicitada neste painel.</p>
  </section></main>;

  return <div className="app">
    <aside className="sidebar"><div className="brand"><span className="brand-mark small">CT</span><div><b>Central Transporte</b><small>ADMINISTRAÇÃO</small></div></div>
      <nav>{[["visao","Visão geral"],["viagens","Viagens"],["motoristas","Motoristas"],["dispositivos","Dispositivos"],["caminhoes","Caminhões"]].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setSearch("");}}>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span>{session.user.email}</span><button className="ghost" onClick={signOut}>Sair</button></div>
    </aside>
    <main className="content">
      <header className="topbar"><div><p className="eyebrow">CENTRAL OS · MÓDULO DE TRANSPORTE</p><h1>{({visao:"Visão geral",viagens:"Viagens",motoristas:"Motoristas",dispositivos:"Dispositivos",caminhoes:"Caminhões"})[tab]}</h1></div><div className="actions"><span className="test-pill">TESTE</span><button className="refresh" onClick={load} disabled={busy}>{busy?"Atualizando...":"↻ Atualizar"}</button></div></header>
      {error && <div className="error-banner">{error}</div>}
      {busy && !data ? <div className="loading">Carregando dados...</div> : !data ? <div className="empty">Nenhum dado disponível.</div> : <>
        {tab==="visao" && <>
          <div className="stats">
            <Stat label="Viagens recebidas" value={data.summary.trips} hint="Registros sincronizados"/>
            <Stat label="Em andamento" value={data.summary.inProgress} hint="Viagens abertas"/>
            <Stat label="Finalizadas" value={data.summary.completed} hint="Viagens concluídas"/>
            <Stat label="Motoristas" value={data.summary.drivers} hint="Cadastros identificados"/>
            <Stat label="Dispositivos" value={data.summary.devices} hint={`${data.summary.activeDevices} ativos`}/>
          </div>
          <section className="panel"><div className="panel-head"><div><h2>Viagens recentes</h2><p>Últimos registros recebidos do aplicativo SOL 7</p></div><button className="text-button" onClick={()=>setTab("viagens")}>Ver todas →</button></div><TripTable trips={trips.slice(0,8)} equipment={data.equipment} onSelect={setSelectedTrip}/></section>
          <div className="two-col"><section className="panel"><h2>Motoristas</h2>{data.drivers.slice(0,5).map(d=><div className="list-row" key={d.id}><div><b>{d.nome}</b><small>Matrícula {d.matricula}</small></div><span className={d.ativo?"dot on":"dot"} /></div>)}</section><section className="panel"><h2>Dispositivos</h2>{data.devices.map(d=><div className="list-row" key={d.id}><div><b>{d.nome}</b><small>Frota vinculada: {d.frota_id.slice(0,8)}…</small></div><span className={d.ativo?"tag green":"tag"}>{d.ativo?"Ativo":"Inativo"}</span></div>)}</section></div>
        </>}
        {tab!=="visao" && <section className="panel full-panel"><div className="panel-head"><div><h2>{tab==="viagens"?"Histórico de viagens":tab==="motoristas"?"Motoristas cadastrados":"Dispositivos cadastrados"}</h2><p>{tab==="viagens"?"Até 200 viagens mais recentes":tab==="motoristas"?"Motoristas identificados nas sincronizações":"Instalações vinculadas a caminhões"}</p></div><input className="search" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          {tab==="viagens" ? <TripTable trips={filteredTrips} equipment={data.equipment} onSelect={setSelectedTrip}/> : tab==="motoristas" ? <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Último registro</th><th>Situação</th></tr></thead><tbody>{filteredDrivers.map(d=><tr key={d.id}><td><b>{d.nome}</b></td><td>{d.matricula}</td><td>{fmt(d.ultimo_registro_em)}</td><td><span className={d.ativo?"tag green":"tag"}>{d.ativo?"Ativo":"Inativo"}</span></td></tr>)}</tbody></table>{!filteredDrivers.length&&<div className="empty">Nenhum motorista encontrado.</div>}</div> : <div className="table-wrap"><table><thead><tr><th>Dispositivo</th><th>Identificador da frota</th><th>Última comunicação</th><th>Situação</th></tr></thead><tbody>{filteredDevices.map(d=><tr key={d.id}><td><b>{d.nome}</b><small className="subline">{d.id}</small></td><td className="mono">{d.frota_id}</td><td>{fmt(d.ultimo_acesso_em)}</td><td><span className={d.ativo?"tag green":"tag"}>{d.ativo?"Ativo":"Inativo"}</span></td></tr>)}</tbody></table>{!filteredDevices.length&&<div className="empty">Nenhum dispositivo encontrado.</div>}</div>}
        </section>}
        <footer>Dados atualizados {lastUpdated?fmt(lastUpdated):"—"} · Ambiente isolado de testes</footer>
      </>}
    </main>
    {selectedTrip && <TripDetails trip={selectedTrip} equipment={data?.equipment || []} events={data?.events || []} onClose={() => setSelectedTrip(null)}/>}
  </div>;
}

function Stat({label,value,hint}) { return <article className="stat"><span>{label}</span><strong>{value ?? 0}</strong><small>{hint}</small></article>; }
function TripTable({trips,equipment,onSelect}) {
  if (!trips.length) return <div className="empty">Ainda não há viagens para exibir.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Motorista</th><th>Trajeto</th><th>Tipo</th><th>Início</th><th>Equipamentos</th><th>Status</th><th></th></tr></thead><tbody>{trips.map(t=>{const items=equipment.filter(e=>e.viagem_id===t.id);return <tr key={t.id} className="clickable-row" onClick={()=>onSelect?.(t)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect?.(t);}}} tabIndex={0} title="Abrir detalhes da viagem"><td><b>{t.motorista_nome}</b><small className="subline">Matrícula {t.motorista_matricula}</small></td><td>{t.origem} <span className="arrow">→</span> {t.destino}</td><td><span className="tag">{t.tipo==="LOADED"?"Carregada":"Vazia"}</span></td><td>{fmt(t.started_at)}<small className="subline">Fim: {fmt(t.ended_at)}</small></td><td>{items.length?items.map(i=><span className={i.removido_em?"equipment removed":"equipment"} key={i.id}>{i.nome}{i.removido_em?" · removido":""}</span>):"—"}</td><td><span className={t.status==="COMPLETED"?"tag green":"tag amber"}>{statusLabel(t.status)}</span></td><td><button className="open-trip" onClick={e=>{e.stopPropagation();onSelect?.(t);}}>Ver detalhes</button></td></tr>})}</tbody></table></div>;
}
function TripDetails({trip,equipment,events,onClose}) {
  const items = equipment.filter(e=>e.viagem_id===trip.id);
  const history = events.filter(e=>e.viagem_id===trip.id).sort((a,b)=>new Date(a.ocorrido_em)-new Date(b.ocorrido_em));
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="trip-modal" role="dialog" aria-modal="true" aria-labelledby="trip-detail-title">
      <header className="modal-head"><div><p className="eyebrow">DETALHES DA VIAGEM</p><h2 id="trip-detail-title">{trip.origem} <span className="arrow">→</span> {trip.destino}</h2></div><button className="modal-close" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="detail-grid">
        <div><small>Motorista</small><b>{trip.motorista_nome}</b><span>Matrícula {trip.motorista_matricula}</span></div>
        <div><small>Tipo</small><b>{trip.tipo==="LOADED"?"Viagem carregada":"Deslocamento vazio"}</b></div>
        <div><small>Status</small><b><span className={trip.status==="COMPLETED"?"tag green":"tag amber"}>{statusLabel(trip.status)}</span></b></div>
        <div><small>Início</small><b>{fmt(trip.started_at)}</b></div>
        <div><small>Finalização</small><b>{fmt(trip.ended_at)}</b></div>
        <div><small>Identificador</small><b className="mono">{trip.trip_uuid}</b></div>
      </div>
      <section className="detail-section"><h3>Equipamentos da viagem</h3>{items.length ? <div className="detail-list">{items.map(item=><div className="detail-item" key={item.id}><div><b>{item.nome}</b><small>Adicionado: {fmt(item.adicionado_em)}</small>{item.frota_item_id && <small>Item de frota: {item.frota_item_id}</small>}</div><span className={item.removido_em?"tag":"tag green"}>{item.removido_em ? "Removido em " + fmt(item.removido_em) : "Permanece ativo"}</span></div>)}</div> : <p className="muted-line">Nenhum equipamento registrado.</p>}</section>
      <section className="detail-section"><h3>Histórico de alterações</h3>{history.length ? <div className="timeline">{history.map(ev=><div className="timeline-item" key={ev.id}><span className={ev.acao==="REMOVED"?"timeline-dot removed":"timeline-dot"}></span><div><b>{ev.acao==="ADDED"?"Equipamento adicionado":"Equipamento removido"}</b><small>{fmt(ev.ocorrido_em)}</small><small>Equipamento local: {ev.equipamento_local_id || "—"}</small></div></div>)}</div> : <p className="muted-line">Nenhuma alteração registrada.</p>}</section>
      <section className="detail-section"><h3>Observação de finalização</h3><p className="note-box">{trip.final_note || "Nenhuma observação informada."}</p></section>
      <footer className="modal-footer"><button className="refresh" onClick={onClose}>Fechar detalhes</button></footer>
    </section>
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
