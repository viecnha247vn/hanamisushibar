// /api/print – används av skrivarbryggan (print-bridge/). Header x-print-key = PRINT_KEY.
//   GET               kö med beställningar som ska skrivas ut
//   POST { no }       markera som utskriven
import crypto from "node:crypto";
import { gas } from "../lib/gas.js";
import { wrap, send, body, HttpError } from "../lib/util.js";

function requirePrintKey(req) {
  const given = String(req.headers["x-print-key"] || ""), real = String(process.env.PRINT_KEY || "");
  if (!real) throw new HttpError(500, "PRINT_KEY saknas i miljövariablerna.");
  const h = s => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(h(given), h(real))) throw new HttpError(401, "Fel nyckel.");
}

export default wrap(async (req, res) => {
  requirePrintKey(req);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return send(res, 200, await gas("printQueue", {}, { timeout: 12000 }));
  if (req.method === "POST") {
    const { no } = body(req);
    if (!/^H\d+$/.test(String(no || ""))) throw new HttpError(400, "Ogiltigt ordernummer.");
    return send(res, 200, await gas("printDone", { no }));
  }
  throw new HttpError(405, "Endast GET/POST.");
});
