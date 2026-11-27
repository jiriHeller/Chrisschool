/* POST   /api/push          – uložit odběr notifikací tohoto zařízení  body={ sub, name }
 * DELETE /api/push          – zrušit odběr                             body={ endpoint }
 * POST   /api/push?test=1   – poslat zkušební notifikaci */
"use strict";
const crypto = require("crypto");
const L = require("./_lib");
const field = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  const url = new URL(req.url, "http://x"), b = await L.body(req);
  if (req.method === "POST" && url.searchParams.get("test")) {
    const s = await L.getSettings();
    const r = await L.pushAll({ title: "Školní parťák", body: `Notifikace fungují. Po každém testu ti sem přijde výsledek (${s.childName}).`, url: "./", tag: "partak-test" });
    return L.send(res, 200, { ok: true, push: r });
  }
  if (req.method === "POST") {
    const sub = b.sub;
    if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys) throw L.httpError(400, "Neplatný odběr.");
    await L.redis("HSET", L.K.subs, field(sub.endpoint), JSON.stringify({ sub, name: String(b.name || "").slice(0, 60), at: new Date().toISOString() }));
    return L.send(res, 200, { ok: true });
  }
  if (req.method === "DELETE") {
    if (b.endpoint) await L.redis("HDEL", L.K.subs, field(b.endpoint));
    return L.send(res, 200, { ok: true });
  }
  throw L.httpError(405, "Nepodporovaná metoda.");
});
