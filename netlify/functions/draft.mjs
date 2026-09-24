import { DEFAULT_STATE, json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey } from "./_lib.mjs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const cfg = githubConfig();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const syncKey = url.searchParams.get("syncKey") || "";
    if (!checkSyncKey(syncKey)) {
      return json({ error: "unauthorized" }, 401);
    }
    const draft = await getFile(cfg, "draft.json");
    if (draft) return json(draft.content);
    const published = await getFile(cfg, "state.json");
    return json(published ? published.content : DEFAULT_STATE);
  }

  if (req.method === "PUT") {
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

    const r = await putFileWithRetry(cfg, "draft.json", body.state, "Atualiza rascunho da convocatória");
    if (!r.ok) {
      const text = await r.text();
      return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
    }
    return json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/draft" };
