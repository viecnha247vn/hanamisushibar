// POST /api/swish – Swish callback (betalning eller återbetalning klar/misslyckad).
// Kroppen är inte signerad, så den används bara som väckarklocka: vi läser alltid det riktiga resultatet hos Swish
// (med vårt certifikat) innan något skrivs i arket. Svarar 200 så att Swish inte försöker igen i onödan;
// tacksidans statusfråga (GET /api/pay) fångar en betalning även om callbacken skulle missas.
import { gas } from "../gas.js";
import { send } from "../util.js";
import { swishConfigured, getRefund } from "../swish.js";
import { swishSync } from "./pay.js";

export default async function swishCallback(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return send(res, 405, { ok: false });
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const id = String(b.id || "");
  if (!/^[0-9A-F]{32}$/.test(id) || !swishConfigured()) return send(res, 200, { ok: true, ignored: true });
  try {
    if (b.originalPaymentReference) return send(res, 200, { ok: true, ...(await refundCallback(id)) });
    const ref = String(b.payeePaymentReference || "");
    if (!/^P[A-Z0-9]{12}$/.test(ref)) return send(res, 200, { ok: true, ignored: "ref" });
    return send(res, 200, { ok: true, changed: await swishSync(ref, id) });
  } catch (e) {
    console.error("[swish-callback]", id, e.message);
    return send(res, 500, { ok: false });
  }
}

/** payerPaymentReference = "<ordernr>T<totalt återbetalt i öre>" (sätts av köksvyns återbetalning) */
export async function refundCallback(id) {
  const r = await getRefund(id);
  if (r.status !== "PAID") return { refund: r.status };
  const m = String(r.payerPaymentReference || "").match(/^([A-Z0-9]+)T(\d+)$/);
  if (!m) return { ignored: "refund ref" };
  const info = await gas("refundInfo", { no: m[1] });
  await gas("refunded", { no: m[1], refundedOre: Number(m[2]), capturedOre: Math.round(info.total * 100), source: "Swish" }, { timeout: 15000 });
  return { refunded: m[1] };
}
