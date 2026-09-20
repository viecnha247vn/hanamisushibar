// GET /api/health – visar om kopplingen till Google Sheet fungerar (inga hemligheter visas)
import { gas } from "../gas.js";

export default async function handler(req, res) {
  const out = { ok: true, vercel: { gasUrl: !!process.env.GAS_URL, gasSecret: !!process.env.GAS_SECRET, adminKey: !!process.env.ADMIN_KEY } };
  const t = Date.now();
  try {
    const r = await gas("health", {}, { timeout: 15000 });
    out.appsScript = { ok: true, sheet: r.sheet, email: r.email, sms: r.sms, ms: Date.now() - t };
  } catch (e) {
    out.ok = false;
    out.appsScript = { ok: false, error: e.message };
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(out.ok ? 200 : 500).end(JSON.stringify(out, null, 2));
}
