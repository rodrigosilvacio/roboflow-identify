// Supabase Edge Function: proxy seguro entre o GitHub Pages e o Roboflow Workflow contador-de-carros.
// Usa o mesmo secret ROBOFLOW_API_KEY do projeto de cores.

const API_KEY = Deno.env.get("ROBOFLOW_API_KEY") ?? "";
const WORKSPACE = Deno.env.get("ROBOFLOW_WORKSPACE") ?? "rodrigos-workspace-1ibon";
const WORKFLOW_ID = Deno.env.get("ROBOFLOW_CARS_WORKFLOW_ID") ?? "contador-de-carros";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://rodrigosilvacio.github.io";
const MAX_BASE64_CHARS = 11_000_000; // ~8 MB de imagem
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

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

  let body: { image?: unknown; confidence?: unknown; classes?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { image } = body;
  if (typeof image !== "string" || !image) return json({ error: "Campo 'image' (base64) obrigatório" }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: "Imagem muito grande" }, 413);

  // Validação dos parâmetros: só aceita classes de veículo e confiança entre 0.1 e 0.9
  const confidence = Math.min(0.9, Math.max(0.1, Number(body.confidence) || 0.4));
  const classes = Array.isArray(body.classes)
    ? body.classes.filter((c): c is string => typeof c === "string" && VEHICLE_CLASSES.has(c))
    : [];
  const finalClasses = classes.length ? classes : ["car"];

  const started = Date.now();
  const rf = await fetch(`https://serverless.roboflow.com/${WORKSPACE}/workflows/${WORKFLOW_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      inputs: { image: { type: "base64", value: image }, confidence, classes: finalClasses },
    }),
  });
  const data = await rf.json().catch(() => ({}));
  console.log(JSON.stringify({ event: "count-cars", status: rf.status, ms: Date.now() - started }));

  if (!rf.ok) return json({ error: "Falha no Roboflow", status: rf.status }, 502);

  const out = data?.outputs?.[0] ?? {};
  const preds = out.predictions?.predictions ?? [];
  const detections = preds.map((p: Record<string, number | string>) => ({
    class: p.class,
    confidence: Math.round(Number(p.confidence) * 1000) / 1000,
    x: p.x, y: p.y, width: p.width, height: p.height,
  }));
  return json({
    count: typeof out.count === "number" ? out.count : detections.length,
    image: out.predictions?.image ?? null,
    detections,
  });
});
