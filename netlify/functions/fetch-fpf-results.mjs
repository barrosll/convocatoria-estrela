import { githubConfig, getFile, putFileWithRetry } from "./_lib.mjs";

const TEAM_NAME_MATCH = /afonsoeirense/i;

function extractSerieDBlock(html) {
  const marker = /<span>\s*S[ÉE]RIE\s*D\s*<\/span>/i;
  const m = marker.exec(html);
  if (!m) return null;
  const blockStart = html.lastIndexOf('class="game-results', m.index);
  if (blockStart === -1) return null;
  const nextBlock = html.indexOf('class="game-results', m.index + 10);
  const blockEnd = nextBlock === -1 ? html.length : nextBlock;
  return html.slice(blockStart, blockEnd);
}

function extractGames(block) {
  const games = [];
  const gameRe = /<div class="game" style="min-height: 31px">([\s\S]*?)<\/div>/g;
  let gm;
  while ((gm = gameRe.exec(block))) {
    const inner = gm[1];
    const homeMatch = /home-team[^>]*>([^<]*)</.exec(inner);
    const awayMatch = /away-team[^>]*>([^<]*)</.exec(inner);
    const home = homeMatch ? homeMatch[1].trim() : "";
    const away = awayMatch ? awayMatch[1].trim() : "";
    const schedMatch = /game-schedule">([\s\S]*?)<\/span>/.exec(inner);
    const sched = schedMatch
      ? schedMatch[1].replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim()
      : "";
    const scoreMatch = /(\d{1,2})\s*[-–xX×]\s*(\d{1,2})/.exec(inner);
    games.push({
      home,
      away,
      sched,
      scoreHome: scoreMatch ? Number(scoreMatch[1]) : null,
      scoreAway: scoreMatch ? Number(scoreMatch[2]) : null
    });
  }
  return games;
}

export default async (req) => {
  const apiKey = Netlify.env.get("SCRAPERAPI_KEY") || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_scraperapi_key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const target = encodeURIComponent("https://resultados.fpf.pt/Competition/Details?competitionId=30179&seasonId=106");
  const scraperUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${target}&premium=true`;

  let html = null;
  for (let attempt = 0; attempt < 3 && !html; attempt++) {
    try {
      const r = await fetch(scraperUrl);
      if (r.ok) html = await r.text();
    } catch (e) {
      // retry
    }
    if (!html) await new Promise((res) => setTimeout(res, 2000));
  }
  if (!html) {
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }

  const block = extractSerieDBlock(html);
  if (!block) {
    return new Response(JSON.stringify({ error: "serie_d_not_found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const games = extractGames(block).filter(
    (g) => TEAM_NAME_MATCH.test(g.home) || TEAM_NAME_MATCH.test(g.away)
  );
  const withScores = games.filter((g) => g.scoreHome !== null && g.scoreAway !== null);

  const cfg = githubConfig();
  const existing = await getFile(cfg, "resultados.json");
  const current = (existing && existing.content && existing.content.resultados) || [];

  const next = current.slice();
  let added = 0;
  for (const g of withScores) {
    const isHome = TEAM_NAME_MATCH.test(g.home);
    const adversario = (isHome ? g.away : g.home).trim();
    const golosEstrela = isHome ? g.scoreHome : g.scoreAway;
    const golosAdversario = isHome ? g.scoreAway : g.scoreHome;
    const dedupKey = (adversario + "|" + g.sched).toLowerCase();
    const already = next.some(
      (r) => r.source === "fpf" && (r.adversario + "|" + r.data).toLowerCase() === dedupKey
    );
    if (already) continue;
    next.unshift({
      id: Math.random().toString(36).slice(2, 10),
      adversario,
      data: g.sched,
      local: isHome ? "casa" : "fora",
      golosEstrela,
      golosAdversario,
      source: "fpf"
    });
    added++;
  }

  if (added > 0) {
    await putFileWithRetry(cfg, "resultados.json", { resultados: next }, "Auto: novos resultados do campeonato oficial (FPF)");
  }

  return new Response(
    JSON.stringify({ ok: true, foundGames: games.length, withScores: withScores.length, added }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = { schedule: "0 9 * * 2" };
