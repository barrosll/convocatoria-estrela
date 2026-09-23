import { getStore } from "@netlify/blobs";

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
  "Access-Control-Allow-Headers": "Content-Type, x-sync-key"
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const store = getStore("convocatoria");

  if (req.method === "GET") {
    const data = await store.get("state", { type: "json" });
    return Response.json(data || DEFAULT_STATE, { headers: corsHeaders });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const syncKey = (body && body.syncKey) || "";
    const expected = Netlify.env.get("SYNC_KEY") || "";
    if (!expected || syncKey !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    await store.setJSON("state", body.state);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
};

export const config = { path: "/api/state" };
