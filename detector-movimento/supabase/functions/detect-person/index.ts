// Supabase Edge Function: confirma se o movimento captado pela webcam é uma pessoa
// e se ela está com celular visível. Proxy seguro para o Roboflow Workflow
// detector-pessoa-celular (a API key fica só aqui).

const API_KEY = Deno.env.get("ROBOFLOW_API_KEY") ?? "";
const WORKSPACE = Deno.env.get("ROBOFLOW_WORKSPACE") ?? "rodrigos-workspace-1ibon";
const WORKFLOW_ID = Deno.env.get("ROBOFLOW_PERSON_WORKFLOW_ID") ?? "detector-pessoa-celular";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://rodrigosilvacio.github.io";
const MAX_BASE64_CHARS = 3_000_000; // quadros da webcam são pequenos

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Box = { confidence: number; x: number; y: number; width: number; height: number };

const toBoxes = (preds: unknown): Box[] =>
  ((preds as { predictions?: Record<string, number>[] } | null)?.predictions ?? []).map((p) => ({
    confidence: Math.round(Number(p.confidence) * 1000) / 1000,
    x: p.x, y: p.y, width: p.width, height: p.height,
  }));

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const y1 = Math.max(a.y - a.height / 2, b.y - b.height / 2);
  const x2 = Math.min(a.x + a.width / 2, b.x + b.width / 2);
  const y2 = Math.min(a.y + a.height / 2, b.y + b.height / 2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter || 1);
}

// Junta as duas buscas de celular (perto das pessoas + imagem inteira) sem duplicar
function mergePhones(a: Box[], b: Box[]): Box[] {
  const all = [...a, ...b].sort((p, q) => q.confidence - p.confidence);
  const kept: Box[] = [];
  for (const p of all) if (!kept.some((k) => iou(k, p) > 0.4)) kept.push(p);
  return kept;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  if (!API_KEY) return json({ error: "ROBOFLOW_API_KEY não configurada" }, 500);

  let body: { image?: unknown; confidence?: unknown; phone_confidence?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { image } = body;
  if (typeof image !== "string" || !image) return json({ error: "Campo 'image' (base64) obrigatório" }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: "Imagem muito grande" }, 413);
  const confidence = Math.min(0.9, Math.max(0.2, Number(body.confidence) || 0.5));
  const phone_confidence = Math.min(0.9, Math.max(0.15, Number(body.phone_confidence) || 0.3));

  const started = Date.now();
  const rf = await fetch(`https://serverless.roboflow.com/${WORKSPACE}/workflows/${WORKFLOW_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      inputs: { image: { type: "base64", value: image }, confidence, phone_confidence },
    }),
  });
  const data = await rf.json().catch(() => ({}));
  // Log sem imagem: só status e latência
  console.log(JSON.stringify({ event: "detect-person", status: rf.status, ms: Date.now() - started }));

  if (!rf.ok) return json({ error: "Falha no Roboflow", status: rf.status }, 502);

  const out = data?.outputs?.[0] ?? {};
  const people = toBoxes(out.people);
  // Sem pessoa, o recorte não roda e "phones_near_people" vem null: tratado em toBoxes
  const phones = mergePhones(toBoxes(out.phones_near_people), toBoxes(out.phones_full_image));
  return json({
    count: people.length,
    phone_count: phones.length,
    image: out.people?.image ?? out.phones_full_image?.image ?? null,
    people,
    phones,
  });
});
