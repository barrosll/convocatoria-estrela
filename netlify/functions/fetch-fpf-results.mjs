import { githubConfig, getFile, putFileWithRetry, contentsUrl } from "./_lib.mjs";

const TEAM_NAME_MATCH = /afonsoeirense/i;
const COMPETITION_URL = "https://resultados.fpf.pt/Competition/Details?competitionId=30179&seasonId=106";

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
  const homeMatches = [...block.matchAll(/home-team[^>]*>([^<]*)</g)];
  const awayMatches = [...block.matchAll(/away-team[^>]*>([^<]*)</g)];
  const schedMatches = [...block.matchAll(/game-schedule">([\s\S]*?)<\/span>/g)];
  const stadiumMatches = [...block.matchAll(/game-list-stadium"[^>]*>\s*<small[^>]*>([^<]*)</g)];

  const games = [];
  const count = Math.min(homeMatches.length, awayMatches.length);
  for (let i = 0; i < count; i++) {
    const home = (homeMatches[i][1] || "").trim();
    const away = (awayMatches[i][1] || "").trim();
    const schedRaw = schedMatches[i] ? schedMatches[i][1] : "";
    const sched = schedRaw.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
    const stadium = stadiumMatches[i] ? stadiumMatches[i][1].trim() : "";
    const scoreMatch = /(\d{1,2})\s*[-–xX×]\s*(\d{1,2})/.exec(sched) || null;
    games.push({
      home,
      away,
      sched,
      stadium,
      scoreHome: scoreMatch ? Number(scoreMatch[1]) : null,
      scoreAway: scoreMatch ? Number(scoreMatch[2]) : null
    });
  }
  return games;
}

function extractFixtureIds(block) {
  const ids = [...new Set([...block.matchAll(/fixtureId=(\d+)/g)].map((m) => m[1]))];
  return ids;
}

async function fetchViaScraper(apiKey, targetUrl) {
  const target = encodeURIComponent(targetUrl);
  const scraperUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${target}&premium=true`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(scraperUrl);
      if (r.ok) return await r.text();
    } catch (e) {
      // retry
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

export default async (req) => {
  const apiKey = Netlify.env.get("SCRAPERAPI_KEY") || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_scraperapi_key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const html = await fetchViaScraper(apiKey, COMPETITION_URL);
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

  // --- Part 1: Estrela's own results -> resultados.json (unchanged behaviour) ---
  const jornada1Games = extractGames(block);
  const estrelaGames = jornada1Games.filter(
    (g) => TEAM_NAME_MATCH.test(g.home) || TEAM_NAME_MATCH.test(g.away)
  );
  const withScores = estrelaGames.filter((g) => g.scoreHome !== null && g.scoreAway !== null);

  const cfg = githubConfig();
  const existingResultados = await getFile(cfg, "resultados.json");
  const currentResultados = (existingResultados && existingResultados.content && existingResultados.content.resultados) || [];

  const nextResultados = currentResultados.slice();
  let added = 0;
  for (const g of withScores) {
    const isHome = TEAM_NAME_MATCH.test(g.home);
    const adversario = (isHome ? g.away : g.home).trim();
    const golosEstrela = isHome ? g.scoreHome : g.scoreAway;
    const golosAdversario = isHome ? g.scoreAway : g.scoreHome;
    const dedupKey = (adversario + "|" + g.sched).toLowerCase();
    const already = nextResultados.some(
      (r) => r.source === "fpf" && (r.adversario + "|" + r.data).toLowerCase() === dedupKey
    );
    if (already) continue;
    nextResultados.unshift({
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
    await putFileWithRetry(cfg, "resultados.json", { resultados: nextResultados }, "Auto: novos resultados do campeonato oficial (FPF)");
  }

  // --- Part 2: full Serie D schedule (all jornadas) -> torneio.json ---
  const fixtureIds = extractFixtureIds(block);
  const jornadas = [];
  jornadas.push({ numero: 1, jogos: jornada1Games });

  for (let i = 0; i < fixtureIds.length; i++) {
    const jornadaNum = i + 2; // fixtureIds list excludes jornada 1's own link typically appears too; guard below
    if (jornadaNum > fixtureIds.length + 1) break;
    const fixHtml = await fetchViaScraper(
      apiKey,
      `https://resultados.fpf.pt/Competition/GetClassificationAndMatchesByFixture?fixtureId=${fixtureIds[i]}`
    );
    if (!fixHtml) continue;
    const games = extractGames(fixHtml);
    if (games.length) jornadas.push({ numero: jornadaNum, jogos: games });
  }

  jornadas.sort((a, b) => a.numero - b.numero);
  const uniqueJornadas = [];
  const seenNum = new Set();
  for (const j of jornadas) {
    if (seenNum.has(j.numero)) continue;
    seenNum.add(j.numero);
    uniqueJornadas.push(j);
  }

  await putFileWithRetry(
    cfg,
    "torneio.json",
    { updatedAt: new Date().toISOString(), jornadas: uniqueJornadas },
    "Auto: atualiza calendario Serie D"
  );

  return new Response(
    JSON.stringify({ ok: true, foundGames: estrelaGames.length, withScores: withScores.length, added, jornadas: uniqueJornadas.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = { schedule: "0 9 * * 2" };
