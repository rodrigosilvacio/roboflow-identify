// Supabase Edge Function: confirma se o movimento captado pela webcam é uma pessoa.
// Proxy seguro para o Roboflow Workflow detector-de-pessoas (a API key fica só aqui).

const API_KEY = Deno.env.get("ROBOFLOW_API_KEY") ?? "";
const WORKSPACE = Deno.env.get("ROBOFLOW_WORKSPACE") ?? "rodrigos-workspace-1ibon";
const WORKFLOW_ID = Deno.env.get("ROBOFLOW_PERSON_WORKFLOW_ID") ?? "detector-de-pessoas";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://rodrigosilvacio.github.io";
const MAX_BASE64_CHARS = 3_000_000; // quadros da webcam são pequenos (~2 MB no máximo)

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  if (!API_KEY) return json({ error: "ROBOFLOW_API_KEY não configurada" }, 500);

  let body: { image?: unknown; confidence?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { image } = body;
  if (typeof image !== "string" || !image) return json({ error: "Campo 'image' (base64) obrigatório" }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: "Imagem muito grande" }, 413);
  const confidence = Math.min(0.9, Math.max(0.2, Number(body.confidence) || 0.5));

  const started = Date.now();
  const rf = await fetch(`https://serverless.roboflow.com/${WORKSPACE}/workflows/${WORKFLOW_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, inputs: { image: { type: "base64", value: image }, confidence } }),
  });
  const data = await rf.json().catch(() => ({}));
  // Log sem imagem: só status e latência
  console.log(JSON.stringify({ event: "detect-person", status: rf.status, ms: Date.now() - started }));

  if (!rf.ok) return json({ error: "Falha no Roboflow", status: rf.status }, 502);

  const out = data?.outputs?.[0] ?? {};
  const preds = out.predictions?.predictions ?? [];
  const people = preds.map((p: Record<string, number>) => ({
    confidence: Math.round(Number(p.confidence) * 1000) / 1000,
    x: p.x, y: p.y, width: p.width, height: p.height,
  }));
  return json({
    count: typeof out.count === "number" ? out.count : people.length,
    image: out.predictions?.image ?? null,
    people,
  });
});
