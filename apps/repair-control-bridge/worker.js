export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ready" && request.method === "GET") {
      return Response.json({ ok: true, service: "chicagoshining-repair-control-bridge" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname !== "/control" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    const supplied = request.headers.get("Authorization") || "";
    const expected = env.CONTROL_SECRET ? `Bearer ${env.CONTROL_SECRET}` : "";
    if (!expected || supplied !== expected) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    try {
      const body = await request.text();
      const upstream = await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/admin/repair/control", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": "joseph.t.logan@gmail.com",
          "Origin": "https://studio.chicagoshining.com",
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body,
      }));
      const text = await upstream.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return Response.json({
        bridge_ok: true,
        upstream_status: upstream.status,
        upstream_json: json,
        upstream_text: json ? null : text.slice(0, 500),
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({
        bridge_ok: false,
        exception: error instanceof Error ? error.message : String(error),
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  },
};
