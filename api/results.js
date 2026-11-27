/* POST /api/results          – zapsat dokončený test (iPad, iPhone, hodinky); pošle rodiči notifikaci
 *      body = výsledek, nebo { results: [ … ] } (offline fronta)
 * GET  /api/results?limit=100 – seznam výsledků pro rodičovský přehled (nejnovější první) */
"use strict";
const L = require("./_lib");
const MAX_KEEP = 2000;
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  if (req.method === "GET") {
    const url = new URL(req.url, "http://x"), limit = Math.min(MAX_KEEP, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));
    return L.send(res, 200, { ok: true, results: await L.listResults(limit) });
  }
  if (req.method !== "POST") throw L.httpError(405, "Nepodporovaná metoda.");
  const b = await L.body(req), list = Array.isArray(b.results) ? b.results.slice(0, 50) : [b];
  const settings = await L.getSettings(), stored = [], dup = [];
  for (const raw of list) {
    let r; try { r = L.cleanResult(raw); } catch (e) { if (list.length === 1) throw e; continue; }
    const fresh = await L.redis("SET", L.K.seen(r.id), "1", "NX", "EX", 60 * 60 * 24 * 120);
    if (fresh !== "OK") { dup.push(r.id); continue; }
    await L.redis("LPUSH", L.K.results, JSON.stringify(r));
    stored.push(r);
  }
  if (stored.length) await L.redis("LTRIM", L.K.results, 0, MAX_KEEP - 1);
  // notifikace rodičům – jen pro čerstvé výsledky (starší než 12 h z offline fronty se jen uloží)
  const n = settings.notify || {}, pushed = [];
  for (const r of stored) {
    const recent = Date.now() - Date.parse(r.finishedAt) < 12 * 3600 * 1000;
    const want = n.mode === "each" || (n.mode === "below" && r.pct < (n.threshold ?? 70));
    if (recent && want && r.total > 0) pushed.push(await L.pushAll(L.resultNotification(r, settings.childName)));
  }
  return L.send(res, 200, { ok: true, stored: stored.map((r) => r.id), duplicates: dup, push: pushed });
});
