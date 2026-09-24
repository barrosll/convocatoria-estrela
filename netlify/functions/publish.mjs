import { json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey, normalizeGamesFile, defaultGamesFile, gameKeyOrDefault } from "./_lib.mjs";

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
  const game = gameKeyOrDefault(body && body.game);
  if (!checkSyncKey(syncKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  const cfg = githubConfig();
  const draftFile = await getFile(cfg, "draft.json");
  const draftGames = draftFile ? normalizeGamesFile(draftFile.content) : null;
  const contentToPublish = draftGames ? draftGames.games[game] : null;

  const existingState = await getFile(cfg, "state.json");
  const stateGames = existingState ? normalizeGamesFile(existingState.content) : defaultGamesFile();
  stateGames.games[game] = contentToPublish || stateGames.games[game];

  const r = await putFileWithRetry(cfg, "state.json", stateGames, "Publica convocatoria (" + game + ")");
  if (!r.ok) {
    const text = await r.text();
    return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
  }
  return json({ ok: true, published: stateGames.games[game] });
};

export const config = { path: "/api/publish" };
