import { json, corsHeaders, githubConfig, getFile, normalizeGamesFile, defaultGamesFile, gameKeyOrDefault } from "./_lib.mjs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const game = gameKeyOrDefault(url.searchParams.get("game"));

  const cfg = githubConfig();
  const file = await getFile(cfg, "state.json");
  const games = file ? normalizeGamesFile(file.content) : defaultGamesFile();
  return json(games.games[game]);
};

export const config = { path: "/api/state" };
