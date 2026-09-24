import { DEFAULT_STATE, json, corsHeaders, githubConfig, getFile } from "./_lib.mjs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const cfg = githubConfig();
  const file = await getFile(cfg, "state.json");
  return json(file ? file.content : DEFAULT_STATE);
};

export const config = { path: "/api/state" };
