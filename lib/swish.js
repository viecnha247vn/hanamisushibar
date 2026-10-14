// Swish Handel (Swish Commerce API) utan npm-paket: TLS med klientcertifikat via node:https.
// Pengarna går direkt till restaurangens Swish-nummer (ingen plattformsavgift). Allt certifikatarbete görs en gång
// i portal.swish.nu (se HUONG-DAN.md).
//
// Miljövariabler (Vercel, Sensitive):
//   SWISH_CERT     certifikatet från portal.swish.nu (.pem), base64 eller rå PEM
//   SWISH_KEY      privata nyckeln (hanami-swish.key), base64 eller rå PEM
//   SWISH_PAYEE    Swish Handel-numret, t.ex. 1237066756
//   SWISH_CA       (valfritt) rotcertifikat för Swish-servern, om Node inte litar på den
//   SWISH_HOST     (valfritt) standard cpc.getswish.net – mss.cpc.getswish.net för Swish testmiljö (MSS)
import https from "node:https";
import crypto from "node:crypto";

export function swishConfigured() {
  return !!(process.env.SWISH_CERT && process.env.SWISH_KEY && process.env.SWISH_PAYEE);
}

/** "LS0tLS1CRUdJTi…" (base64) eller "-----BEGIN …" → PEM-text */
export function pem(v) {
  const s = String(v || "").trim();
  if (!s) return undefined;
  if (s.includes("-----BEGIN")) return s.replace(/\\n/g, "\n");
  return Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8");
}

let agent;
function tlsAgent() {
  if (!agent) agent = new https.Agent({ cert: pem(process.env.SWISH_CERT), key: pem(process.env.SWISH_KEY),
    ca: process.env.SWISH_CA ? pem(process.env.SWISH_CA) : undefined, keepAlive: true });
  return agent;
}

/** Svar: { status, headers, data } – kastar bara vid nätverksfel. Testerna byter transport med setSwishTransport. */
let transport = httpsTransport;
export const swishHttp = (...a) => transport(...a);
export function setSwishTransport(fn) { transport = fn || httpsTransport; }

function httpsTransport(method, path, body, { timeout = 15000 } = {}) {
  const host = process.env.SWISH_HOST || "cpc.getswish.net";
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port: 443, method, path: "/swish-cpcapi" + path, agent: tlsAgent(), timeout,
      headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", e => reject(new Error(`Swish svarar inte (${method} ${path}): ${e.message}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

function swishError(r, what) {
  const list = Array.isArray(r.data) ? r.data : [];
  const msg = list.map(e => [e.errorCode, e.errorMessage].filter(Boolean).join(": ")).join("; ") || (typeof r.data === "string" ? r.data.slice(0, 200) : "");
  const err = new Error(`Swish ${what} ${r.status}${msg ? " – " + msg : ""}`);
  err.status = r.status; err.codes = list.map(e => e.errorCode); return err;
}

/** 32 tecken hex, versaler (Swish instructionUUID) */
export const instructionId = () => crypto.randomUUID().replace(/-/g, "").toUpperCase();

/** Swish tillåter bara vissa tecken i meddelandet (max 50). */
export function swishMessage(s) {
  return String(s || "").replace(/[^0-9A-Za-zåäöÅÄÖ :;.,?!()\-"']/g, "").slice(0, 50);
}

export const amountText = ore => (Math.round(ore) / 100).toFixed(2);

/**
 * Betalningsförfrågan för m-handel (ingen payerAlias): gästen öppnar Swish-appen med token, eller skannar QR på datorn.
 * → { id, token }
 */
export async function createPayment({ ref, amountOre, message, callbackUrl }) {
  const id = instructionId();
  const r = await swishHttp("PUT", `/api/v2/paymentrequests/${id}`, {
    payeePaymentReference: ref, callbackUrl, payeeAlias: process.env.SWISH_PAYEE,
    amount: amountText(amountOre), currency: "SEK", message: swishMessage(message)
  });
  if (r.status !== 201) throw swishError(r, "betalning");
  return { id, token: r.headers["paymentrequesttoken"] || "" };
}

/** → { id, status: CREATED|PAID|DECLINED|ERROR|CANCELLED, amount (kr), paymentReference, payeePaymentReference, … } */
export async function getPayment(id) {
  const r = await swishHttp("GET", `/api/v1/paymentrequests/${encodeURIComponent(id)}`);
  if (r.status !== 200) throw swishError(r, "status");
  return r.data;
}

/** Återbetalning. payerPaymentReference bär ordernr + totalt återbetalt (öre) så att callbacken kan anteckna rätt. */
export async function createRefund({ originalPaymentReference, amountOre, ref, message, callbackUrl }) {
  const id = instructionId();
  const r = await swishHttp("PUT", `/api/v2/refunds/${id}`, {
    originalPaymentReference, callbackUrl, payerAlias: process.env.SWISH_PAYEE, payerPaymentReference: ref,
    amount: amountText(amountOre), currency: "SEK", message: swishMessage(message)
  });
  if (r.status !== 201) throw swishError(r, "återbetalning");
  return { id };
}

export async function getRefund(id) {
  const r = await swishHttp("GET", `/api/v1/refunds/${encodeURIComponent(id)}`);
  if (r.status !== 200) throw swishError(r, "återbetalningsstatus");
  return r.data;
}

/** QR-kod (SVG) för en betalningsförfrågan – Swish egen tjänst, kräver inget certifikat. */
export async function qrSvg(token) {
  const res = await fetch("https://mpc.getswish.net/qrg-swish/api/v1/commerce", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, format: "svg", size: 300, border: 0, transparent: true })
  });
  if (!res.ok) throw new Error(`Swish QR ${res.status}`);
  return res.text();
}

/** Referensen som sparas i kolumnen Stripe för Swish-ordrar (skiljer dem från pi_… och gör återbetalning möjlig). */
export const SWISH_PREFIX = "swish:";
