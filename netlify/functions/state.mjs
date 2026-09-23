const DEFAULT_STATE = {
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const OWNER = Netlify.env.get("GITHUB_OWNER") || "";
  const REPO = Netlify.env.get("GITHUB_REPO") || "";
  const BRANCH = Netlify.env.get("GITHUB_BRANCH") || "main";
  const TOKEN = Netlify.env.get("GITHUB_TOKEN") || "";
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/state.json`;

  if (req.method === "GET") {
    try {
      const r = await fetch(`${apiUrl}?ref=${BRANCH}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${TOKEN}` }
      });
      if (!r.ok) throw new Error("not_found");
      const data = await r.json();
      const content = JSON.parse(base64ToUtf8(data.content));
      return json(content);
    } catch (e) {
      return json(DEFAULT_STATE);
    }
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "invalid_json" }, 400);
    }
    const syncKey = (body && body.syncKey) || "";
    const expected = Netlify.env.get("SYNC_KEY") || "";
    if (!expected || syncKey !== expected) {
      return json({ error: "unauthorized" }, 401);
    }

    async function getSha() {
      const r = await fetch(`${apiUrl}?ref=${BRANCH}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${TOKEN}` }
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.sha;
    }

    async function put(sha) {
      const payload = {
        message: "Atualiza convocatória",
        content: utf8ToBase64(JSON.stringify(body.state, null, 2)),
        branch: BRANCH
      };
      if (sha) payload.sha = sha;
      return fetch(apiUrl, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }

    let sha = await getSha();
    let r = await put(sha);
    for (let attempt = 0; attempt < 4 && (r.status === 409 || r.status === 422); attempt++) {
      await new Promise((res) => setTimeout(res, 250 + attempt * 200));
      sha = await getSha();
      r = await put(sha);
    }

    if (!r.ok) {
      const text = await r.text();
      return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
    }

    return json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/state" };
