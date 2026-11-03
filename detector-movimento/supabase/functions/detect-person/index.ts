// Supabase Edge Function: confirma se o movimento captado pela webcam é uma pessoa
// e se ela está com celular visível. Proxy seguro para o Roboflow Workflow
// detector-pessoa-celular (a API key fica só aqui).
//
// O workflow roda UM modelo (RF-DETR Medium) com as classes person e cell phone
// e limiar baixo (15%). Os limites de cada classe são aplicados aqui, o que permite
// devolver a maior confiança de celular vista, mesmo abaixo do limite (diagnóstico).

const API_KEY = Deno.env.get("ROBOFLOW_API_KEY") ?? "";
const WORKSPACE = Deno.env.get("ROBOFLOW_WORKSPACE") ?? "rodrigos-workspace-1ibon";
const WORKFLOW_ID = Deno.env.get("ROBOFLOW_PERSON_WORKFLOW_ID") ?? "detector-pessoa-celular";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://rodrigosilvacio.github.io";
const MAX_BASE64_CHARS = 3_000_000; // quadros da webcam são pequenos
const MODEL_FLOOR = 0.15; // limiar mínimo enviado ao modelo

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clamp = (v: unknown, min: number, max: number, def: number) =>
  Math.min(max, Math.max(min, Number(v) || def));

type Box = { confidence: number; x: number; y: number; width: number; height: number };

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
  const personMin = clamp(body.confidence, 0.2, 0.9, 0.5);
  const phoneMin = clamp(body.phone_confidence, MODEL_FLOOR, 0.9, 0.25);

  const started = Date.now();
  const rf = await fetch(`https://serverless.roboflow.com/${WORKSPACE}/workflows/${WORKFLOW_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      inputs: { image: { type: "base64", value: image }, confidence: MODEL_FLOOR },
    }),
  });
  const data = await rf.json().catch(() => ({}));
  const ms = Date.now() - started;

  if (!rf.ok) {
    console.log(JSON.stringify({ event: "detect-person", status: rf.status, ms }));
    return json({ error: "Falha no Roboflow", status: rf.status }, 502);
  }

  const pred = data?.outputs?.[0]?.predictions ?? {};
  const all: (Box & { class: string })[] = (pred.predictions ?? []).map((p: Record<string, number | string>) => ({
    class: String(p.class),
    confidence: Math.round(Number(p.confidence) * 1000) / 1000,
    x: Number(p.x), y: Number(p.y), width: Number(p.width), height: Number(p.height),
  }));
  const strip = ({ class: _c, ...b }: Box & { class: string }): Box => b;
  const people = all.filter((p) => p.class === "person" && p.confidence >= personMin).map(strip);
  const phoneCandidates = all.filter((p) => p.class === "cell phone");
  const phones = phoneCandidates.filter((p) => p.confidence >= phoneMin).map(strip);
  const bestPhone = phoneCandidates.reduce((m, p) => Math.max(m, p.confidence), 0);

  // Log sem imagem: status, latência e o que foi visto (para calibrar)
  console.log(JSON.stringify({ event: "detect-person", status: rf.status, ms, people: people.length, phones: phones.length, best_phone: bestPhone }));

  return json({
    count: people.length,
    phone_count: phones.length,
    best_phone_confidence: bestPhone,
    best_person_confidence: all.filter((p) => p.class === "person").reduce((m, p) => Math.max(m, p.confidence), 0),
    image: pred.image ?? null,
    ms,
    people,
    phones,
  });
});
