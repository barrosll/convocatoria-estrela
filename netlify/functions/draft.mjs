import { json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey, normalizeGamesFile, defaultGamesFile, gameKeyOrDefault } from "./_lib.mjs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const cfg = githubConfig();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const syncKey = url.searchParams.get("syncKey") || "";
    const game = gameKeyOrDefault(url.searchParams.get("game"));
    if (!checkSyncKey(syncKey)) {
      return json({ error: "unauthorized" }, 401);
    }
    const draftFile = await getFile(cfg, "draft.json");
    if (draftFile && draftFile.content && draftFile.content.games && draftFile.content.games[game]) {
      return json(normalizeGamesFile(draftFile.content).games[game]);
    }
    const published = await getFile(cfg, "state.json");
    const games = published ? normalizeGamesFile(published.content) : defaultGamesFile();
    return json(games.games[game]);
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "invalid_json" }, 400);
    }
    const syncKey = (body && body.syncKey) || "";
    const game = gameKeyOrDefault(body && body.game);
    if (!checkSyncKey(syncKey)) {
      return json({ error: "unauthorized" }, 401);
    }

    const existing = await getFile(cfg, "draft.json");
    const games = existing ? normalizeGamesFile(existing.content) : defaultGamesFile();
    games.games[game] = body.state;

    const r = await putFileWithRetry(cfg, "draft.json", games, "Atualiza rascunho da convocatoria (" + game + ")");
    if (!r.ok) {
      const text = await r.text();
      return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
    }
    return json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/draft" };
