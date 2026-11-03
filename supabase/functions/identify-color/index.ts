// Supabase Edge Function: proxy seguro entre o GitHub Pages e o Roboflow.
// A ROBOFLOW_API_KEY fica como secret no Supabase, nunca no front.
//
// Deploy:
//   supabase secrets set ROBOFLOW_API_KEY=...   (ALLOWED_ORIGIN opcional, padrão: GitHub Pages)
//   supabase functions deploy identify-color

const API_KEY = Deno.env.get("ROBOFLOW_API_KEY") ?? "";
const WORKSPACE = Deno.env.get("ROBOFLOW_WORKSPACE") ?? "rodrigos-workspace-1ibon";
const WORKFLOW_ID = Deno.env.get("ROBOFLOW_WORKFLOW_ID") ?? "identificador-de-cores-mvp";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://rodrigosilvacio.github.io";
const MAX_BASE64_CHARS = 11_000_000; // ~8 MB de imagem

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Procura o primeiro array [r, g, b] na resposta do workflow
function findRgb(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((v) => typeof v === "number")) return value.map(Math.round);
    for (const v of value) { const r = findRgb(v); if (r) return r; }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) { const r = findRgb(v); if (r) return r; }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  if (!API_KEY) return json({ error: "ROBOFLOW_API_KEY não configurada" }, 500);

  let image: string;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (typeof image !== "string" || !image) return json({ error: "Campo 'image' (base64) obrigatório" }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: "Imagem muito grande" }, 413);

  const started = Date.now();
  const rf = await fetch(`https://serverless.roboflow.com/${WORKSPACE}/workflows/${WORKFLOW_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, inputs: { image: { type: "base64", value: image } } }),
  });
  const data = await rf.json().catch(() => ({}));
  // Log mínimo para auditoria, sem gravar a imagem
  console.log(JSON.stringify({ event: "identify-color", status: rf.status, ms: Date.now() - started }));

  if (!rf.ok) return json({ error: "Falha no Roboflow", status: rf.status }, 502);

  const out = data?.outputs?.[0] ?? {};
  const rgb = findRgb(out.rgb) ?? findRgb(out.dominant_color) ?? findRgb(data?.outputs);
  if (!rgb) return json({ error: "Workflow não retornou a cor (saída rgb)" }, 502);
  return json({ rgb });
});
