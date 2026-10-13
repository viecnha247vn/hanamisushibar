// GET /api/platform?date=YYYY-MM-DD – plattformsrapport för Queenie89 AB (lib/platform.js).
// Bara för Apps Script (PlatformReport.js): header x-report-key = GAS_SECRET. Köksvyns lösenord räcker INTE –
// restaurangen ska inte se plattformens intäkter.
import crypto from "node:crypto";
import { wrap, send, HttpError, isDate } from "../util.js";
import { stripeConfigured } from "../stripe.js";
import { platformDay } from "../platform.js";

export default wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const want = process.env.GAS_SECRET || "", got = String(req.headers?.["x-report-key"] || "");
  if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(401, "Fel nyckel.");
  if (req.method !== "GET") throw new HttpError(405, "Endast GET.");
  if (!stripeConfigured()) throw new HttpError(503, "Stripe är inte konfigurerat.");
  const date = String(req.query?.date || "");
  if (!isDate(date)) throw new HttpError(400, "Ange date=ÅÅÅÅ-MM-DD.");
  return send(res, 200, { ok: true, ...(await platformDay(date)) });
});
