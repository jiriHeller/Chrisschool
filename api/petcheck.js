/* POST /api/petcheck – zkontroluje, jestli morče nepotřebuje péči, a případně pošle rodičům notifikaci.
 * Spouští GitHub Actions každých 30 minut (.github/workflows/morce.yml) a také každé odeslání stavu z iPadu.
 * Stav morčete se dopočítá stejně jako v Parťákovi (jídlo −4, voda −5, radost −3 za hodinu, v noci poloviční). */
"use strict";
const L = require("./_lib");
const R = { food: 4, water: 5, joy: 3 };
function pragueMin(ts) { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts));
  const g = (t) => +p.find((x) => x.type === t).value; return (g("hour") % 24) * 60 + g("minute"); }
const calm = (ts) => { const t = pragueMin(ts); return t >= 21 * 60 || t < 6 * 60 + 30; };
function petNow(state, now) {
  const p = state && state.pet; if (!p || !p.stats) return null;
  const s = { ...p.stats }; let t = Date.parse(state.at) || now; const step = 15 * 60 * 1000;
  while (t < now) { const dt = Math.min(step, now - t), f = (calm(t) ? 0.5 : 1) * dt / 3600000; for (const k in R) s[k] = Math.max(0, s[k] - R[k] * f); t += dt; }
  for (const k in s) s[k] = Math.round(s[k]);
  return { name: p.name, s, needs: s.food < 30 || s.water < 30 || s.joy < 25 };
}
async function check(opts) {
  const now = Date.now(), settings = await L.getSettings();
  if (settings.notify.pet === false || settings.notify.mode === "off") return { skipped: "off" };
  const m = pragueMin(now); if (m < 7 * 60 || m > 20 * 60 + 30) return { skipped: "night" };
  const raw = await L.redis("GET", `p:${L.KID}:state`); let state = null; try { state = raw ? JSON.parse(raw) : null; } catch (e) {}
  const pet = petNow(state, now); if (!pet) return { skipped: "nopet" };
  if (!pet.needs) { await L.redis("DEL", `p:${L.KID}:petnotif`); return { ok: true, needs: false, stats: pet.s }; }
  if (!opts.force && (await L.redis("SET", `p:${L.KID}:petnotif`, String(now), "NX", "EX", 3 * 3600)) !== "OK") return { ok: true, needs: true, throttled: true, stats: pet.s };
  const c = settings.childName || "Dítě", n = pet.name, w = [];
  if (pet.s.water < 30) w.push(`má žízeň 💧 (voda ${pet.s.water} %)`);
  if (pet.s.food < 30) w.push(`má hlad 🌾 (jídlo ${pet.s.food} %)`);
  if (pet.s.joy < 25) w.push(`se nudí 💜 (radost ${pet.s.joy} %)`);
  const push = await L.pushAll({ title: `🐹 ${n} potřebuje péči`, body: `${n} ${w.join(" a ")}. ${c} by se o něj měl postarat v Parťákovi.`, url: "./?tab=pet", tag: "partak-pet" });
  return { ok: true, needs: true, notified: true, stats: pet.s, push };
}
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  const url = new URL(req.url, "http://x");
  L.send(res, 200, Object.assign({ ok: true }, await check({ force: !!url.searchParams.get("force") })));
});
module.exports.check = check;
