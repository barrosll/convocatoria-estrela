import { DEFAULT_STATE, json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey } from "./_lib.mjs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

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

  const cfg = githubConfig();
  const draft = await getFile(cfg, "draft.json");
  const contentToPublish = draft ? draft.content : (body && body.state) || DEFAULT_STATE;

  const r = await putFileWithRetry(cfg, "state.json", contentToPublish, "Publica convocatória");
  if (!r.ok) {
    const text = await r.text();
    return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
  }
  return json({ ok: true, published: contentToPublish });
};

export const config = { path: "/api/publish" };
