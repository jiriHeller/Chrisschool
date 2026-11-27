/* GET /api/status – stav nastavení serveru (bez tajných údajů) + veřejný klíč pro notifikace.
 * S kódem rodiny navíc ověří, že kód sedí a databáze odpovídá. */
"use strict";
const L = require("./_lib");
module.exports = L.handler(async (req, res) => {
  const v = L.vapid(), out = {
    ok: true, kid: L.KID,
    key: !!process.env.PARTAK_KEY, db: !!L.redisCfg(), push: !!v,
    vapidPublicKey: v ? v.pub : null, auth: null, dbOk: null, subscribers: null,
  };
  const h = req.headers || {};
  if (h.authorization || h["x-partak-key"]) {
    try { L.requireKey(req); out.auth = true; } catch (e) { out.auth = false; }
    if (out.auth && out.db) {
      try { await L.redis("PING"); out.dbOk = true; out.subscribers = await L.redis("HLEN", L.K.subs); } catch (e) { out.dbOk = false; }
    }
  }
  L.send(res, 200, out);
});
