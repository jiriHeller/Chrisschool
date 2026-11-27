/* GET /api/content – vše, co potřebuje aplikace v iPhonu a hodinkách v jednom volání:
 * lekce a testy z Parťáka (blok LESSONS v index.html = to, co se zadává na iPadu), nastavení, předměty. */
"use strict";
const L = require("./_lib");
let cache = { at: 0, etag: "", lessons: null };
async function loadLessons(req) {
  if (cache.lessons && Date.now() - cache.at < 60 * 1000) return cache;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = (req.headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https")).split(",")[0];
  const base = `${proto}://${host}`;
  let lessons = null;
  try {
    const html = await (await fetch(base + "/index.html", { cache: "no-store" })).text();
    const m = /\/\*@LESSONS\*\/(\[[\s\S]*?\])\/\*@END\*\//.exec(html);
    if (m) lessons = JSON.parse(m[1].replace(/<\\\//g, "</"));
  } catch (e) {}
  if (!lessons) {
    try { const j = await (await fetch(base + "/lessons.json", { cache: "no-store" })).json(); lessons = Array.isArray(j) ? j : j.lessons; } catch (e) {}
  }
  if (!lessons) throw L.httpError(502, "Nepodařilo se načíst lekce.");
  const etag = require("crypto").createHash("sha1").update(JSON.stringify(lessons)).digest("hex").slice(0, 16);
  cache = { at: Date.now(), etag, lessons };
  return cache;
}
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
module.exports = L.handler(async (req, res) => {
  L.requireKey(req);
  const [c, settings] = await Promise.all([loadLessons(req), L.getSettings()]);
  const lessons = c.lessons.map((l) => ({
    id: l.id, subject: l.subject, title: l.title, added: l.added || null, intro: strip(l.intro),
    // generované lekce (počítání, hodiny, peníze…) si aplikace vytváří sama podle typu
    gen: l.gen ? { kind: String(l.gen), weights: l.genw || { add: 3, sub: 3, mul: 4, div: 3, miss: 2, cmp: 1, word: 2 }, n: l.n || 20 } : null,
    watch: (l.watch || []).map(strip),
    quiz: (l.quiz || []).filter((q) => q && Array.isArray(q.a) && q.a.length >= 2 && !q.pic && !q.w)
      .map((q) => ({ q: strip(q.q), a: q.a.map(strip), c: q.c || 0, e: strip(q.e), say: q.say || undefined, sayLang: q.sayLang || undefined })),
  }));
  L.send(res, 200, { ok: true, version: c.etag, generatedAt: new Date().toISOString(), subjects: L.SUBJECTS, settings, lessons });
});
