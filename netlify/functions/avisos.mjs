import { json, corsHeaders, githubConfig, getFile, putFileWithRetry, checkSyncKey, contentsUrl } from "./_lib.mjs";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const cfg = githubConfig();

  if (req.method === "GET") {
    const file = await getFile(cfg, "avisos.json");
    const avisos = (file && file.content && file.content.avisos) || [];
    return json({ avisos });
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
    const existing = await getFile(cfg, "avisos.json");
    const current = (existing && existing.content && existing.content.avisos) || [];

    let next;
    if (action === "add") {
      const id = uid();
      const aviso = {
        id,
        title: String(body.title || "").slice(0, 200),
        date: String(body.date || "").slice(0, 50),
        body: String(body.body || "").slice(0, 1000)
      };
      if (body.image) {
        const imgPath = `avisos-img/${id}.jpg`;
        const imgPayload = {
          message: "Adiciona imagem do aviso",
          content: body.image,
          branch: cfg.BRANCH
        };
        const imgResp = await fetch(contentsUrl(cfg, imgPath), {
          method: "PUT",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${cfg.TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(imgPayload)
        });
        if (imgResp.ok) {
          aviso.image = imgPath;
        }
      }
      next = [aviso, ...current];
    } else if (action === "delete") {
      next = current.filter((a) => a.id !== body.id);
    } else {
      return json({ error: "invalid_action" }, 400);
    }

    const r = await putFileWithRetry(cfg, "avisos.json", { avisos: next }, "Atualiza mural do clube");
    if (!r.ok) {
      const text = await r.text();
      return json({ error: "github_error", status: r.status, detail: text.slice(0, 200) }, 502);
    }
    return json({ ok: true, avisos: next });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/avisos" };
