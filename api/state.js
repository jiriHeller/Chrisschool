/* POST /api/state – iPad posílá aktuální stav (morče, série, dnešní úkoly, týden, čas v aplikaci)
 * GET  /api/state – rodičovský panel si ho přečte */
"use strict";
const L = require("./_lib");
const KEY = `p:${L.KID}:state`;
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  if (req.method === "GET") {
    const raw = await L.redis("GET", KEY); let state = null; try { state = raw ? JSON.parse(raw) : null; } catch (e) {}
    return L.send(res, 200, { ok: true, state });
  }
  if (req.method !== "POST") throw L.httpError(405, "Nepodporovaná metoda.");
  const b = await L.body(req);
  if (!b || typeof b !== "object" || !b.at) throw L.httpError(400, "Chybí stav.");
  const s = JSON.stringify(b); if (s.length > 64 * 1024) throw L.httpError(413, "Stav je příliš velký.");
  b.receivedAt = new Date().toISOString();
  await L.redis("SET", KEY, JSON.stringify(b));
  L.send(res, 200, { ok: true });
});
