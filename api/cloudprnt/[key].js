// Star CloudPRNT – skrivaren anropar denna adress själv, ingen dator behövs i köket.
//   URL i skrivaren: https://hanamisushibar.se/api/cloudprnt/<CLOUDPRNT_KEY>
//
//   POST  skrivaren frågar "finns det något att skriva ut?"  → { jobReady, mediaTypes, jobToken }
//   GET   skrivaren hämtar jobbet (?type=&token=&mac=)        → kvittodata
//   DELETE skrivaren rapporterar resultat (?token=&code=OK)    → markerar "Utskriven"
//
// Protokoll: Star CloudPRNT HTTP (Star Micronics, "CloudPRNT Protocol Specification").
import crypto from "node:crypto";
import { gas } from "../../lib/gas.js";
import { wrap, send, HttpError } from "../../lib/util.js";
import { starMarkup, plainText } from "../../lib/receipt-star.js";

const MEDIA = { "text/vnd.star.markup": starMarkup, "text/plain": plainText };

function checkKey(req) {
  const given = String(req.query?.key || ""), real = String(process.env.CLOUDPRNT_KEY || "");
  if (!real) throw new HttpError(500, "CLOUDPRNT_KEY saknas i miljövariablerna.");
  const h = s => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(h(given), h(real))) throw new HttpError(404, "Not found");
  const allowed = (process.env.CLOUDPRNT_MAC || "").toLowerCase().replace(/[^0-9a-f,]/g, "");
  const mac = String(req.query?.mac || req.body?.printerMAC || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (allowed && mac && !allowed.split(",").includes(mac)) throw new HttpError(403, "Okänd skrivare");
}

export default wrap(async (req, res) => {
  checkKey(req);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "POST") {
    const st = req.body || {};
    if (st.printingInProgress) return send(res, 200, { jobReady: false });
    // Skrivarstatus "200 OK" = redo. Vid t.ex. papperslut lämnar vi jobbet i kön så det skrivs ut när felet är löst.
    if (st.statusCode && !/^2\d\d/.test(String(st.statusCode))) { console.warn("[cloudprnt] status", st.statusCode, st.status); return send(res, 200, { jobReady: false }); }
    const { jobs } = await gas("printQueue", {}, { timeout: 12000 });
    if (!jobs.length) return send(res, 200, { jobReady: false });
    return send(res, 200, { jobReady: true, mediaTypes: Object.keys(MEDIA), jobToken: jobs[0].no, deleteMethod: "DELETE" });
  }

  if (req.method === "GET") {
    const no = String(req.query.token || ""), type = String(req.query.type || "text/plain").split(";")[0].trim();
    if (!/^H\d+$/.test(no)) throw new HttpError(400, "Ogiltigt jobb.");
    const render = MEDIA[type] || plainText;
    const { job } = await gas("printJob", { no }, { timeout: 12000 });
    res.status(200).setHeader("Content-Type", `${MEDIA[type] ? type : "text/plain"}; charset=utf-8`);
    return res.end(render(job));
  }

  if (req.method === "DELETE") {
    const no = String(req.query.token || ""), code = String(req.query.code || "");
    if (/^H\d+$/.test(no)) {
      if (/^OK/i.test(code)) await gas("printDone", { no });
      else console.warn("[cloudprnt] utskrift misslyckades", no, code);   // lämnas i kön → försöker igen
    }
    return res.status(200).end();
  }
  throw new HttpError(405, "Method not allowed");
});
