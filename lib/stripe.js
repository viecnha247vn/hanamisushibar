// Stripe utan npm-paket: REST-API via fetch (Node 20) + webhook-signatur med node:crypto.
// Repot har inga beroenden – det här håller det så. Allt som behövs för Q89 Pay (Checkout + Connect) finns här.
//
// Miljövariabler (Vercel):
//   STRIPE_SECRET_KEY        sk_live_… / sk_test_…  – PLATTFORMENS nyckel (Queenie89 AB), inte restaurangens
//   STRIPE_WEBHOOK_SECRET    whsec_…                – från endpointen /api/stripe/webhook
//   STRIPE_ACCOUNT           acct_…                 – Hanamis Express-konto (skapas i Stripe Dashboard → Connect)
//   STRIPE_FEE_PCT           4                      – Q89:s avgift i procent (standard 4)
//   STRIPE_FEE_FIXED         2                      – kr per order (standard 2)
//   STRIPE_TAX_RATE_12       txr_…                  – momssats 12 % "inkluderad i priset" (valfritt men rekommenderas)
import crypto from "node:crypto";

const API = "https://api.stripe.com/v1";
const VERSION = "2025-08-27.basil";

export function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ACCOUNT);
}

/** Stripe vill ha application/x-www-form-urlencoded med nästlade nycklar: a[b][0][c]=… */
export function encodeForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object" ? encodeForm(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x)));
    else if (typeof v === "object") encodeForm(v, key, out);
    else out.append(key, typeof v === "boolean" ? String(v) : String(v));
  }
  return out;
}

export async function stripe(method, path, params, { idempotencyKey, timeout = 20000 } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY saknas i miljövariablerna.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const headers = { Authorization: `Bearer ${key}`, "Stripe-Version": VERSION };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let url = API + path, body;
  if (method === "GET") { const q = encodeForm(params || {}).toString(); if (q) url += "?" + q; }
  else { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = encodeForm(params || {}).toString(); }
  let res, text;
  try {
    res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    text = await res.text();
  } catch (e) {
    throw new Error(`Stripe svarar inte (${method} ${path}): ${e.name === "AbortError" ? "timeout" : e.message}`);
  } finally { clearTimeout(timer); }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Stripe gav inget JSON (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) {
    const err = new Error(`Stripe ${res.status} ${data.error?.type || ""}: ${data.error?.message || text.slice(0, 200)}`);
    err.status = res.status; err.stripe = data.error; throw err;
  }
  return data;
}

/** Q89:s plattformsavgift i öre: round(total × pct) + fast, aldrig mer än totalen. */
export function applicationFeeOre(totalOre) {
  const pct = Number(process.env.STRIPE_FEE_PCT ?? 4), fixed = Math.round(Number(process.env.STRIPE_FEE_FIXED ?? 2) * 100);
  if (!(totalOre > 0)) return 0;
  return Math.min(totalOre, Math.round(totalOre * pct / 100) + fixed);
}

/**
 * Verifierar Stripe-Signature (schema v1) mot RÅ kroppen. Tolerans 5 min.
 * Returnerar händelsen (JSON) eller kastar.
 */
export function verifyWebhook(rawBody, signatureHeader, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET saknas.");
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map(kv => kv.split("=").map(s => s.trim())).filter(a => a.length === 2 && a[0]));
  const t = Number(parts.t);
  const sigs = String(signatureHeader || "").split(",").map(s => s.trim()).filter(s => s.startsWith("v1=")).map(s => s.slice(3));
  if (!t || !sigs.length) throw new Error("Ogiltig Stripe-Signature.");
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) throw new Error("Stripe-Signature för gammal.");
  const payload = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const ok = sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s, "hex"), Buffer.from(expected, "hex")));
  if (!ok) throw new Error("Stripe-Signature stämmer inte.");
  return JSON.parse(payload);
}

/** Hjälp för tester: skapa en giltig signatur. */
export function signWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}
