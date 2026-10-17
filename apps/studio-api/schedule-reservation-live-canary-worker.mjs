import { runLiveScheduleReservationCanary } from "./schedule-reservation-live-canary.mjs";
export default {
  async fetch(request, env) {
    // Temporary worker, no public routes. Authenticate even if workers.dev is accidentally enabled.
    if (request.method !== "POST" || new URL(request.url).pathname !== "/run") return new Response("Not found", {status:404});
    const supplied = request.headers.get("authorization") || "";
    if (!env.CANARY_TOKEN || supplied !== "Bearer " + env.CANARY_TOKEN) return new Response("Unauthorized", {status:401});
    try {
      const body = await request.json();
      const result = await runLiveScheduleReservationCanary(env, {nonce:body.nonce});
      return Response.json({ok:true,...result});
    } catch (error) {
      return Response.json({ok:false, error_code:"canary_failed", message:String(error?.message||error).slice(0,200)}, {status:500});
    }
  }
};
