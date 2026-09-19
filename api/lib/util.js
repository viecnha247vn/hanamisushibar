import crypto from "node:crypto";
import settings from "../data/settings.js";

export const ORDER_STATUS = ["Ny", "Tillagas", "Klar", "Hämtad", "Serverad", "Avbokad"];
export const BOOKING_STATUS = ["Väntar", "Bekräftad", "Avböjd", "Avbokad"];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function send(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

/** Kör en handler och gör om fel till JSON-svar. */
export function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[hanami]", req.method, req.url, err);
      send(res, status, { ok: false, error: status >= 500 ? "Tekniskt fel. Ring oss på " + settings.phone + "." : err.message });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { throw new HttpError(400, "Ogiltig data."); }
}

export function requireAdmin(req) {
  const given = String(req.headers["x-admin-key"] || "");
  const real = String(process.env.ADMIN_KEY || "");
  if (!real) throw new HttpError(500, "ADMIN_KEY saknas i miljövariablerna.");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Fel lösenord.");
}

export const clean = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
export const cleanMultiline = (v, max = 500) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

/** Svenskt mobilnummer -> +46... , annars kastar fel */
export function phoneE164(p, { required = true } = {}) {
  let s = String(p || "").replace(/[^\d+]/g, "");
  if (!s) { if (required) throw new HttpError(400, "Ange ett mobilnummer."); return ""; }
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0")) s = "+46" + s.slice(1);
  else if (!s.startsWith("+")) s = "+" + s;
  if (!/^\+\d{8,15}$/.test(s)) throw new HttpError(400, "Mobilnumret ser inte rätt ut.");
  return s;
}

/** Enkel e-postkontroll. Tom sträng tillåts (fältet är frivilligt). */
export function email(v) {
  const s = clean(v, 120).toLowerCase();
  if (!s) return "";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)) throw new HttpError(400, "E-postadressen ser inte rätt ut.");
  return s;
}

export const phonePretty = p => (p || "").replace(/^\+46/, "0");

/* ---------- tid i Stockholm ---------- */
const fmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
export function nowLocal() {
  const [date, time] = fmt.format(new Date()).split(" ");
  const [h, m] = time.split(":").map(Number);
  return { date, minutes: h * 60 + m };
}
export const weekday = date => new Date(date + "T12:00:00Z").getUTCDay();
export function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const toMinutes = t => { const m = /^(\d{2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : NaN; };
export function hoursFor(date) {
  if (settings.closedDates.includes(date)) return null;
  return settings.hours[weekday(date)] || null;
}
export const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(new Date(d + "T12:00:00Z"));
