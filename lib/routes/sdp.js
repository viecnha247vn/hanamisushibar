// Epson Server Direct Print – skrivaren (TM-T88VII m.fl.) hämtar själv beställningar från webbplatsen.
//   URL i skrivaren: https://hanamisushibar.se/api/sdp/<SDP_KEY>
//
//   POST ConnectionType=GetRequest&ID=…&Name=…        → ePOS-Print XML med nästa jobb, eller tomt svar
//   POST ConnectionType=SetResponse&ResponseFile=<xml> → skrivaren rapporterar resultat; vid success markeras "Utskriven"
//
// Protokoll: Epson "Server Direct Print User's Manual", Version 3.00.
import crypto from "node:crypto";
import { gas } from "../gas.js";
import { wrap, HttpError } from "../util.js";
import { sdpDocument } from "../receipt-epos.js";

function form(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return Object.fromEntries(new URLSearchParams(String(req.body || "")));
}

function checkKey(req, f) {
  const given = String(req.query?.key || ""), real = String(process.env.SDP_KEY || "");
  if (!real) throw new HttpError(500, "SDP_KEY saknas i miljövariablerna.");
  const h = s => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(h(given), h(real))) throw new HttpError(404, "Not found");
  const id = process.env.SDP_ID;                    // valfritt: skrivarens ID måste stämma
  if (id && String(f.ID || "") !== id) throw new HttpError(403, "Okänd skrivare");
}

export default wrap(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const f = form(req);
  checkKey(req, f);
  res.setHeader("Cache-Control", "no-store");

  if (f.ConnectionType === "GetRequest") {
    const { jobs } = await gas("printQueue", {}, { timeout: 12000 });
    if (!jobs.length) return res.status(200).end();              // tomt svar = inget att skriva ut
    res.status(200).setHeader("Content-Type", "text/xml; charset=utf-8");
    return res.end(sdpDocument(jobs.slice(0, 3)));              // max tre jobb per hämtning
  }

  if (f.ConnectionType === "SetResponse") {
    const xml = String(f.ResponseFile || "");
    // Ett <ePOSPrint> per jobb: <printjobid>H1023</printjobid> … <response success="true" …/>
    for (const block of xml.split("<ePOSPrint>").slice(1)) {
      const no = (block.match(/<printjobid>\s*(H\d+)\s*<\/printjobid>/) || [])[1];
      const ok = /<response[^>]*\bsuccess="true"/.test(block);
      if (!no) continue;
      if (ok) await gas("printDone", { no });
      else console.warn("[sdp] utskrift misslyckades", no, (block.match(/code="([^"]*)"/) || [])[1], (block.match(/status="([^"]*)"/) || [])[1]);
    }
    return res.status(200).end();
  }
  return res.status(200).end();
});
