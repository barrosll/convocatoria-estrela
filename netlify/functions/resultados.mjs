import { json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey } from "./_lib.mjs";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const cfg = githubConfig();

  if (req.method === "GET") {
    const file = await getFile(cfg, "resultados.json");
    const resultados = (file && file.content && file.content.resultados) || [];
    return json({ resultados });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "invalid_json" }, 400);
    }
    const syncKey = (body && body.syncKey) || "";
    if (!checkSyncKey(syncKey)) {
      return json({ error: "unauthorized" }, 401);
    }

    const action = body.action || "add";
    const existing = await getFile(cfg, "resultados.json");
    const current = (existing && existing.content && existing.content.resultados) || [];

    let next;
    if (action === "add") {
      const r = {
        id: uid(),
        adversario: String(body.adversario || "").slice(0, 200),
        data: String(body.data || "").slice(0, 50),
        local: body.local === "casa" ? "casa" : "fora",
        golosEstrela: Number(body.golosEstrela) || 0,
        golosAdversario: Number(body.golosAdversario) || 0
      };
      next = [r, ...current];
    } else if (action === "delete") {
      next = current.filter((r) => r.id !== body.id);
    } else {
      return json({ error: "invalid_action" }, 400);
    }

    const r = await putFileWithRetry(cfg, "resultados.json", { resultados: next }, "Atualiza resultados");
    if (!r.ok) {
      const text = await r.text();
      return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
    }
    return json({ ok: true, resultados: next });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/resultados" };
