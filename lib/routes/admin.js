// /api/admin – köksvyn. Header x-admin-key = ADMIN_KEY.
//   GET  ?view=orders&date=YYYY-MM-DD
//   GET  ?view=bookings&from=YYYY-MM-DD
//   GET  ?view=menu
//   POST { kind: "order"|"booking", no, status }
//   POST { kind: "soldout", id, soldOut }
//   POST { kind: "reprint", no }        skriv ut kvittot igen
//   GET  ?view=settings                 förberedelsetid
//   POST { kind: "lead", minutes }      ändrar förberedelsetiden
//   POST { kind: "paid", no, paid }     markerar en beställning som betald
import { gas } from "../gas.js";
import { wrap, send, body, HttpError, requireAdmin, isDate } from "../util.js";

export default wrap(async (req, res) => {
  requireAdmin(req);
  const q = req.query || {};
  if (req.method === "GET") {
    if (q.view === "orders") return send(res, 200, await gas("adminOrders", { date: isDate(q.date) ? q.date : "" }));
    if (q.view === "bookings") return send(res, 200, await gas("adminBookings", { from: isDate(q.from) ? q.from : "" }));
    if (q.view === "menu") return send(res, 200, await gas("adminMenu"));
    if (q.view === "settings") return send(res, 200, await gas("adminSettings"));
  }
  if (req.method === "POST") {
    const p = body(req);
    if (p.kind === "order" || p.kind === "booking")
      return send(res, 200, await gas("adminStatus", { kind: p.kind, no: String(p.no || ""), status: String(p.status || "") }));
    if (p.kind === "reprint")
      return send(res, 200, await gas("printAgain", { no: String(p.no || "") }));
    if (p.kind === "soldout")
      return send(res, 200, await gas("adminSoldOut", { id: String(p.id || ""), soldOut: !!p.soldOut }));
    if (p.kind === "lead")
      return send(res, 200, await gas("adminLead", { minutes: Number(p.minutes) }));
    if (p.kind === "paid")
      return send(res, 200, await gas("adminPaid", { no: String(p.no || ""), paid: !!p.paid }));
  }
  throw new HttpError(400, "Okänd förfrågan.");
});
