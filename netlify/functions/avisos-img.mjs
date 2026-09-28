import { githubConfig, contentsUrl } from "./_lib.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  if (!path || !path.startsWith("avisos-img/")) {
    return new Response("Not found", { status: 404 });
  }

  const cfg = githubConfig();
  const apiUrl = contentsUrl(cfg, path) + `?ref=${cfg.BRANCH}`;
  const r = await fetch(apiUrl, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${cfg.TOKEN}` }
  });
  if (!r.ok) {
    return new Response("Not found", { status: 404 });
  }
  const data = await r.json();
  const binStr = atob(data.content.replace(/\n/g, ""));
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    }
  });
};

export const config = { path: "/api/avisos-img" };
