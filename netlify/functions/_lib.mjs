export const GAME_KEYS = ["sabado", "domingo"];

export function defaultGame() {
  return {
    local: "", adversario: "", data: "", horario: "", staff: "",
    players: [
      { id: "p1", name: "Felipe", call: true },
      { id: "p2", name: "Rafa", call: true },
      { id: "p3", name: "Manu", call: true },
      { id: "p4", name: "Lorenzo", call: true },
      { id: "p5", name: "Gustavo", call: true },
      { id: "p6", name: "Santiago A", call: true },
      { id: "p7", name: "Santiago", call: true },
      { id: "p8", name: "Tiago", call: true },
      { id: "p9", name: "Leo", call: true },
      { id: "p10", name: "Gabriel", call: true },
      { id: "p11", name: "João Vítor", call: true },
      { id: "p12", name: "André", call: true },
      { id: "p13", name: "Clarisse", call: true },
      { id: "p14", name: "Bernardo", call: true },
      { id: "p15", name: "Ferreira", call: true }
    ]
  };
}

export function defaultGamesFile() {
  const games = {};
  GAME_KEYS.forEach((k) => { games[k] = defaultGame(); });
  return { games };
}

export function normalizeGamesFile(obj) {
  const games = (obj && obj.games) || {};
  const out = {};
  GAME_KEYS.forEach((k) => { out[k] = games[k] || defaultGame(); });
  return { games: out };
}

export function gameKeyOrDefault(v) {
  return GAME_KEYS.indexOf(v) !== -1 ? v : "sabado";
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function githubConfig() {
  return {
    OWNER: Netlify.env.get("GITHUB_OWNER") || "",
    REPO: Netlify.env.get("GITHUB_REPO") || "",
    BRANCH: Netlify.env.get("GITHUB_BRANCH") || "main",
    TOKEN: Netlify.env.get("GITHUB_TOKEN") || ""
  };
}

export function contentsUrl(cfg, path) {
  return `https://api.github.com/repos/${cfg.OWNER}/${cfg.REPO}/contents/${path}`;
}

export async function getFile(cfg, path) {
  const url = contentsUrl(cfg, path) + `?ref=${cfg.BRANCH}`;
  const r = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${cfg.TOKEN}` }
  });
  if (!r.ok) return null;
  const data = await r.json();
  return { sha: data.sha, content: JSON.parse(base64ToUtf8(data.content)) };
}

export async function putFile(cfg, path, contentObj, sha, message) {
  const payload = {
    message,
    content: utf8ToBase64(JSON.stringify(contentObj, null, 2)),
    branch: cfg.BRANCH
  };
  if (sha) payload.sha = sha;
  return fetch(contentsUrl(cfg, path), {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function putFileWithRetry(cfg, path, contentObj, message) {
  let existing = await getFile(cfg, path);
  let sha = existing ? existing.sha : null;
  let r = await putFile(cfg, path, contentObj, sha, message);
  for (let attempt = 0; attempt < 4 && (r.status === 409 || r.status === 422); attempt++) {
    await new Promise((res) => setTimeout(res, 250 + attempt * 200));
    existing = await getFile(cfg, path);
    sha = existing ? existing.sha : null;
    r = await putFile(cfg, path, contentObj, sha, message);
  }
  return r;
}

export function checkSyncKey(provided) {
  const expected = Netlify.env.get("SYNC_KEY") || "";
  return !!expected && provided === expected;
}
