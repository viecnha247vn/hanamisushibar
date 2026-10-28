// GET /api/board – kundskärmen (TV i butiken, /skarm): bara ordernummer och status för dagens beställningar.
// Ingen inloggning: inga namn, telefonnummer eller belopp lämnar servern. Cachas några sekunder i Vercels CDN
// så att flera skärmar inte belastar Apps Script.
import { gas } from "../gas.js";
import { wrap, send } from "../util.js";
import { openNow } from "../hours.js";

const COOKING = ["Ny", "Tillagas"];

export default wrap(async (req, res) => {
  const withTables = req.query?.bord === "1";
  // Stängt (från 2 h före öppning till 1 h efter stängning): svara direkt utan Apps Script; skärmen frågar då bara var 5:e minut (ägaren 2026-10-28).
  if (!openNow()) {
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    return send(res, 200, { ok: true, closed: true, cooking: [], ready: [] });
  }
  const r = await gas("adminOrders", { date: "" }, { timeout: 12000 });
  const orders = (r.orders || []).filter(o => withTables || o.kind !== "table");
  const pick = o => ({ no: o.no, time: o.kind === "table" ? "" : o.pickupTime || "", table: o.kind === "table" ? o.table || "" : "" });
  res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
  send(res, 200, {
    ok: true,
    cooking: orders.filter(o => COOKING.includes(o.status)).map(pick).reverse(),   // äldst först (kön)
    ready: orders.filter(o => o.status === "Klar").map(pick)                       // nyast först
  });
});
