import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function readSupabaseSecret() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? "";
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const expectedToken = Deno.env.get("SOLINFTEC_INGEST_TOKEN") ?? "";
  if (expectedToken.length < 32) {
    console.error("SOLINFTEC_INGEST_TOKEN não configurado ou muito curto.");
    return jsonResponse({ error: "Integração não configurada no servidor." }, 503);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!constantTimeEquals(suppliedToken, expectedToken)) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseSecret = readSupabaseSecret();
  if (!supabaseUrl || !supabaseSecret) {
    console.error("Credenciais internas do Supabase não estão disponíveis.");
    return jsonResponse({ error: "Backend não configurado." }, 503);
  }

  let payload: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 2_000_000) {
      return jsonResponse({ error: "Envio muito grande." }, 413);
    }
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("equipamentos" in payload) ||
    !Array.isArray((payload as { equipamentos: unknown }).equipamentos)
  ) {
    return jsonResponse({ error: "Campo 'equipamentos' precisa ser uma lista." }, 400);
  }

  const incoming = (payload as { equipamentos: unknown[] }).equipamentos;
  if (incoming.length < 1 || incoming.length > 500) {
    return jsonResponse({ error: "A lista deve conter de 1 a 500 equipamentos." }, 400);
  }

  const collectedInput = (payload as { coletado_em?: unknown }).coletado_em;
  const collectedAt =
    typeof collectedInput === "string" && !Number.isNaN(Date.parse(collectedInput))
      ? new Date(collectedInput).toISOString()
      : new Date().toISOString();

  const rows = [];
  const seen = new Set<string>();

  for (const value of incoming) {
    if (typeof value !== "object" || value === null) {
      return jsonResponse({ error: "Registro de equipamento inválido." }, 400);
    }
    const item = value as Record<string, unknown>;
    const codigo = String(item.codigo ?? "").trim().slice(0, 100);
    const equipamento = String(item.equipamento ?? "").trim().slice(0, 250);
    if (!codigo || !equipamento) {
      return jsonResponse({ error: "Cada registro exige código e equipamento." }, 400);
    }
    if (seen.has(codigo)) {
      return jsonResponse({ error: `Código duplicado no envio: ${codigo}` }, 400);
    }
    seen.add(codigo);

    const rawHours = item.horas_sem_comunicacao;
    const hours =
      typeof rawHours === "number" && Number.isFinite(rawHours) && rawHours >= 0
        ? rawHours
        : null;

    rows.push({
      codigo,
      equipamento,
      regional: String(item.regional ?? "").slice(0, 250) || null,
      unidade: String(item.unidade ?? "").slice(0, 250) || null,
      grupo: String(item.grupo ?? "").slice(0, 250) || null,
      operacao: String(item.operacao ?? "").slice(0, 250) || null,
      tipo: String(item.tipo ?? "").slice(0, 150) || null,
      data_inicial: String(item.data_inicial ?? "").slice(0, 100) || null,
      data_final: String(item.data_final ?? "").slice(0, 100) || null,
      funcionario: String(item.funcionario ?? "").slice(0, 250) || null,
      tempo_sem_comunicacao: String(item.tempo ?? "").slice(0, 100),
      horas_sem_comunicacao: hours,
      coletado_em: collectedAt,
    });
  }

  const client = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client
    .from("solinftec_monitoramento")
    .upsert(rows, { onConflict: "codigo" });

  if (error) {
    console.error("Falha ao gravar os registros da Solinftec:", error.message);
    return jsonResponse({ error: "Não foi possível gravar os registros." }, 500);
  }

  return jsonResponse({
    ok: true,
    received: rows.length,
    collected_at: collectedAt,
  });
});
