/* GET  /api/settings  – nastavení hry pro telefon a hodinky
 * PUT  /api/settings  – uložit (posílá iPad / rodičovský panel); body = celé nebo částečné nastavení */
"use strict";
const L = require("./_lib");
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  if (req.method === "GET") return L.send(res, 200, { ok: true, settings: await L.getSettings(), subjects: L.SUBJECTS });
  if (req.method === "PUT" || req.method === "POST") {
    const b = await L.body(req), prev = await L.getSettings();
    const next = L.cleanSettings(b.settings || b, prev);
    next.rev = (prev.rev || 0) + 1;
    next.updatedAt = new Date().toISOString();
    next.updatedBy = ["ipad", "iphone", "watch", "web", "rodic"].includes(b.by) ? b.by : "web";
    await L.redis("SET", L.K.settings, JSON.stringify(next));
    return L.send(res, 200, { ok: true, settings: next });
  }
  throw L.httpError(405, "Nepodporovaná metoda.");
});
