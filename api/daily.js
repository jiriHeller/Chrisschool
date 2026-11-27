/* GET /api/daily – denní souhrn pro rodiče (spouští Vercel Cron, viz vercel.json; jen v režimu "daily"). */
"use strict";
const L = require("./_lib");
module.exports = L.handler(async (req, res) => {
  const cron = process.env.CRON_SECRET, auth = String((req.headers || {}).authorization || "");
  const isCron = cron ? auth === `Bearer ${cron}` : /vercel-cron/i.test(String((req.headers || {})["user-agent"] || ""));
  if (!isCron) L.requireKey(req);
  const s = await L.getSettings();
  const url = new URL(req.url, "http://x"), force = url.searchParams.get("force");
  if (s.notify.mode !== "daily" && !force) return L.send(res, 200, { ok: true, skipped: "mode" });
  const today = L.pragueDate();
  if (!force && (await L.redis("SET", L.K.daily(today), "1", "NX", "EX", 60 * 60 * 30)) !== "OK") return L.send(res, 200, { ok: true, skipped: "done" });
  const all = (await L.listResults(300)).filter((r) => L.pragueDate(r.finishedAt) === today);
  const n = all.length, sec = all.reduce((a, r) => a + r.durationSec, 0);
  const avg = n ? Math.round(all.reduce((a, r) => a + r.pct, 0) / n) : 0, miss = all.reduce((a, r) => a + r.mistakes.length, 0);
  const body = n ? `${n}× test · průměr ${avg} % · celkem ${L.fmtDur(sec)} · ${miss} chyb` : "Dnes žádný test.";
  const push = await L.pushAll({ title: `Dnešní souhrn – ${s.childName}`, body, url: "./", tag: "partak-daily-" + today });
  L.send(res, 200, { ok: true, count: n, push });
});
