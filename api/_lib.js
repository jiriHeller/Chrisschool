/* Školní parťák – společné funkce serveru (Vercel Functions).
 * Data: Upstash Redis přes REST (Vercel → Storage → Upstash for Redis).
 * Tajné hodnoty jsou jen v proměnných prostředí na Vercelu, nikdy v repozitáři (repo je veřejné).
 *   PARTAK_KEY        – kód rodiny; posílají ho všechna zařízení (iPad, iPhone, hodinky, rodičovský panel)
 *   KV_REST_API_URL / KV_REST_API_TOKEN  (nebo UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT – webové notifikace pro rodiče
 */
"use strict";

const KID = (process.env.PARTAK_KID || "chris").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "chris";
const K = {
  settings: `p:${KID}:settings`,
  results: `p:${KID}:results`,
  subs: `p:${KID}:subs`,
  seen: (id) => `p:${KID}:rid:${id}`,
  daily: (d) => `p:${KID}:daily:${d}`,
};

/* ---------- Redis (REST, bez knihoven) ---------- */
function redisCfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
async function redis(...cmd) {
  if (globalThis.__PARTAK_REDIS_MOCK) return globalThis.__PARTAK_REDIS_MOCK(cmd);
  const c = redisCfg();
  if (!c) throw httpError(503, "Databáze není připojená (chybí Upstash Redis ve Vercelu).");
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw httpError(502, "Chyba databáze: " + (j.error || r.status));
  return j.result;
}

/* ---------- HTTP pomocníci ---------- */
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Partak-Key");
  res.setHeader("Cache-Control", "no-store");
}
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch (e) { throw httpError(400, "Neplatný JSON."); } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString("utf8") || "{}"); } catch (e) { throw httpError(400, "Neplatný JSON."); } }
    return req.body;
  }
  const chunks = []; let size = 0;
  for await (const ch of req) { size += ch.length; if (size > 256 * 1024) throw httpError(413, "Příliš velká data."); chunks.push(ch); }
  const s = Buffer.concat(chunks).toString("utf8");
  try { return s ? JSON.parse(s) : {}; } catch (e) { throw httpError(400, "Neplatný JSON."); }
}
function keyOf(req) {
  const h = req.headers || {};
  const a = String(h.authorization || "");
  if (/^bearer\s+/i.test(a)) return a.replace(/^bearer\s+/i, "").trim();
  return String(h["x-partak-key"] || "").trim();
}
function safeEq(a, b) {
  a = String(a); b = String(b); if (!a || !b || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0;
}
function requireKey(req) {
  const key = process.env.PARTAK_KEY;
  if (!key) throw httpError(503, "Na Vercelu chybí proměnná PARTAK_KEY (kód rodiny).");
  if (!safeEq(keyOf(req), key)) throw httpError(401, "Špatný kód rodiny.");
}
/* obal handleru: CORS, OPTIONS, chyby */
function handler(fn) {
  return async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    try { await fn(req, res); }
    catch (e) { send(res, e.status || 500, { ok: false, error: e.status ? e.message : "Chyba serveru." }); if (!e.status) console.error(e); }
  };
}

/* ---------- nastavení (sdílené pro iPad, iPhone a hodinky) ---------- */
const SUBJECTS = [
  { id: "ma", name: "Matematika" },
  { id: "cj", name: "Čeština" },
  { id: "aj", name: "Angličtina" },
  { id: "pu", name: "Prvouka" },
  { id: "zp", name: "Zeměpis a přírodopis" },
];
function defaultSettings() {
  return {
    rev: 0,
    updatedAt: null,
    updatedBy: null,
    childName: "Chris",
    subjects: { ma: true, cj: true, aj: true, pu: true, zp: true },
    difficulty: "normal",              // easy | normal | hard
    dailyGoal: { quizzes: 2, minutes: 15 },
    phone: { testLength: 10, allowFreePlay: true },
    watch: {
      quizLength: 5,
      reminders: [{ time: "16:30", days: [1, 2, 3, 4, 5] }],
      quietFrom: "20:00", quietTo: "07:00",
      haptics: true,
    },
    rewards: { pointsPerCorrect: 1, streakBonus: 5, perfectBonus: 10 },
    notify: { mode: "each", threshold: 70, dailyAt: "19:00" }, // each | below | daily | off
  };
}
const clampInt = (v, lo, hi, d) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const isTime = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function cleanSettings(inp, prev) {
  const d = defaultSettings(), p = Object.assign(d, prev || {}), s = inp || {};
  const out = JSON.parse(JSON.stringify(p));
  if (typeof s.childName === "string") out.childName = s.childName.trim().slice(0, 40) || out.childName;
  if (s.subjects && typeof s.subjects === "object") SUBJECTS.forEach(({ id }) => { if (id in s.subjects) out.subjects[id] = !!s.subjects[id]; });
  if (["easy", "normal", "hard"].includes(s.difficulty)) out.difficulty = s.difficulty;
  if (s.dailyGoal) {
    out.dailyGoal.quizzes = clampInt(s.dailyGoal.quizzes, 0, 20, out.dailyGoal.quizzes);
    out.dailyGoal.minutes = clampInt(s.dailyGoal.minutes, 0, 120, out.dailyGoal.minutes);
  }
  if (s.phone) {
    out.phone.testLength = clampInt(s.phone.testLength, 5, 30, out.phone.testLength);
    if ("allowFreePlay" in s.phone) out.phone.allowFreePlay = !!s.phone.allowFreePlay;
  }
  if (s.watch) {
    const w = s.watch;
    out.watch.quizLength = clampInt(w.quizLength, 3, 10, out.watch.quizLength);
    if (Array.isArray(w.reminders)) out.watch.reminders = w.reminders.filter((r) => r && isTime(r.time)).slice(0, 6).map((r) => ({
      time: r.time,
      days: Array.isArray(r.days) ? [...new Set(r.days.map((x) => clampInt(x, 0, 6, -1)).filter((x) => x >= 0))].sort() : [1, 2, 3, 4, 5],
    }));
    if (isTime(w.quietFrom)) out.watch.quietFrom = w.quietFrom;
    if (isTime(w.quietTo)) out.watch.quietTo = w.quietTo;
    if ("haptics" in w) out.watch.haptics = !!w.haptics;
  }
  if (s.rewards) {
    out.rewards.pointsPerCorrect = clampInt(s.rewards.pointsPerCorrect, 0, 10, out.rewards.pointsPerCorrect);
    out.rewards.streakBonus = clampInt(s.rewards.streakBonus, 0, 50, out.rewards.streakBonus);
    out.rewards.perfectBonus = clampInt(s.rewards.perfectBonus, 0, 50, out.rewards.perfectBonus);
  }
  if (s.notify) {
    if (["each", "below", "daily", "off"].includes(s.notify.mode)) out.notify.mode = s.notify.mode;
    out.notify.threshold = clampInt(s.notify.threshold, 0, 100, out.notify.threshold);
    if (isTime(s.notify.dailyAt)) out.notify.dailyAt = s.notify.dailyAt;
  }
  return out;
}
async function getSettings() {
  const raw = await redis("GET", K.settings);
  let s = null; try { s = raw ? JSON.parse(raw) : null; } catch (e) {}
  return cleanSettings({}, s);
}

/* ---------- výsledky testů ---------- */
const SOURCES = ["ipad", "iphone", "watch", "web"];
const str = (v, n) => (v == null ? "" : String(v)).slice(0, n);
function cleanResult(r) {
  if (!r || typeof r !== "object") throw httpError(400, "Chybí výsledek.");
  const total = clampInt(r.total, 0, 500, 0), correct = clampInt(r.correct, 0, total, 0);
  const t1 = Date.parse(r.finishedAt) || Date.now();
  let t0 = Date.parse(r.startedAt) || 0;
  let dur = clampInt(r.durationSec, 0, 6 * 3600, 0);
  if (!dur && t0 && t1 > t0) dur = Math.round((t1 - t0) / 1000);
  if (!t0) t0 = t1 - dur * 1000;
  const id = str(r.id, 64).replace(/[^a-zA-Z0-9_-]/g, "");
  if (id.length < 8) throw httpError(400, "Výsledek nemá platné id.");
  const mistakes = (Array.isArray(r.mistakes) ? r.mistakes : []).slice(0, 60).map((m) => ({
    q: str(m && m.q, 300), given: str(m && m.given, 200), correct: str(m && m.correct, 200),
    e: str(m && m.e, 300), sec: m && m.sec != null ? clampInt(m.sec, 0, 3600, 0) : undefined,
  }));
  return {
    id,
    source: SOURCES.includes(r.source) ? r.source : "web",
    kind: str(r.kind, 20) || "quiz",
    lessonId: str(r.lessonId, 80) || null,
    subject: str(r.subject, 10) || null,
    title: str(r.title, 120) || "Test",
    startedAt: new Date(t0).toISOString(),
    finishedAt: new Date(t1).toISOString(),
    durationSec: dur,
    total, correct,
    pct: total ? Math.round((correct / total) * 100) : 0,
    points: r.points != null ? clampInt(r.points, 0, 10000, 0) : undefined,
    mistakes,
    receivedAt: new Date().toISOString(),
  };
}
async function listResults(limit) {
  const arr = (await redis("LRANGE", K.results, 0, Math.max(0, (limit || 100) - 1))) || [];
  return arr.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
}

/* ---------- formát pro lidi ---------- */
const SOURCE_LABEL = { ipad: "📱 iPad", iphone: "📱 iPhone", watch: "⌚ hodinky", web: "💻 web" };
function fmtDur(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} min ${s} s` : `${s} s`; }
function pragueDate(iso) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(iso || Date.now())); }
function pragueHM(iso) { return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(new Date(iso || Date.now())); }

/* ---------- webové notifikace ---------- */
function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  return pub && priv ? { pub, priv, subject: process.env.VAPID_SUBJECT || "mailto:jirka.heller@gmail.com" } : null;
}
async function pushAll(payload) {
  const v = vapid(); if (!v) return { sent: 0, failed: 0, reason: "no-vapid" };
  let webpush; try { webpush = require("web-push"); } catch (e) { return { sent: 0, failed: 0, reason: "no-lib" }; }
  webpush.setVapidDetails(v.subject, v.pub, v.priv);
  const subs = (await redis("HGETALL", K.subs)) || [];
  const pairs = []; for (let i = 0; i < subs.length; i += 2) pairs.push([subs[i], subs[i + 1]]);
  let sent = 0, failed = 0;
  await Promise.all(pairs.map(async ([field, raw]) => {
    try {
      const s = JSON.parse(raw);
      await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      failed++;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await redis("HDEL", K.subs, field).catch(() => {});
    }
  }));
  return { sent, failed };
}
function resultNotification(r, childName) {
  const who = childName || "Dítě";
  const miss = r.mistakes.slice(0, 3).map((m) => m.q.replace(/\s+/g, " ").slice(0, 40)).filter(Boolean);
  return {
    title: `${who} dokončil test – ${r.title}`.slice(0, 90),
    body: `${r.correct}/${r.total} správně (${r.pct} %) · ${fmtDur(r.durationSec)} · ${SOURCE_LABEL[r.source] || ""}` +
      (miss.length ? `\nChyby: ${miss.join(", ")}${r.mistakes.length > 3 ? " …" : ""}` : r.total ? "\nBez chyby! 🎉" : ""),
    url: `./?r=${encodeURIComponent(r.id)}`,
    tag: "partak-" + r.id,
  };
}

module.exports = {
  KID, K, redis, redisCfg, httpError, send, body, handler, requireKey,
  SUBJECTS, defaultSettings, cleanSettings, getSettings,
  cleanResult, listResults, SOURCE_LABEL, fmtDur, pragueDate, pragueHM,
  vapid, pushAll, resultNotification,
};
