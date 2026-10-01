// Epson Server Direct Print – kvittoskrivaren i köket (Epson TM-m30III, fungerar även med
// TM-T88VII/VI, TM-m30II m.fl.) hämtar själv beställningar från webbplatsen. Ingen dator behövs.
//
//   URL i skrivaren (TM-i Settings → Server Direct Print → Server1):
//       https://hanamisushibar.se/api/sdp/<SDP_KEY>        ID = SDP_ID (hanami-kok), Interval = 5 s
//
//   POST ConnectionType=GetRequest&ID=…&Name=…         → ePOS-Print XML med nästa jobb, eller tomt svar (200)
//   POST ConnectionType=SetResponse&ResponseFile=<xml>  → skrivaren rapporterar resultat; vid success markeras "Utskriven"
//   GET  (med rätt nyckel)                              → diagnos i JSON: nyckel ok, antal jobb i kö. För felsökning i webbläsare.
//
//   Fel nyckel → 404 {"ok":false,"error":"Not found"} (så att adressen inte går att gissa fram)
//   Fel ID     → 403
//
// Protokoll: Epson "Server Direct Print User's Manual", Version 3.00.
import crypto from "node:crypto";
import { gas } from "../gas.js";
import { wrap, send, HttpError } from "../util.js";
import { sdpDocument } from "../receipt-epos.js";

const MAX_JOBS_PER_POLL = 3;   // skrivaren hämtar var 5:e sekund – fler än så behövs inte per varv

/** Skrivaren skickar application/x-www-form-urlencoded. Vercel tolkar det oftast åt oss, men inte alltid. */
function form(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  const raw = Buffer.isBuffer(b) ? b.toString("utf8") : String(b ?? "");
  if (!raw) return {};
  if (raw.trimStart().startsWith("{")) { try { return JSON.parse(raw); } catch { /* fortsätt som formulär */ } }
  return Object.fromEntries(new URLSearchParams(raw));
}

function checkKey(req) {
  const given = String(req.query?.key || ""), real = String(process.env.SDP_KEY || "").trim();
  if (!real) throw new HttpError(500, "SDP_KEY saknas i miljövariablerna.");
  const h = s => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(h(given), h(real))) throw new HttpError(404, "Not found");
}

function checkPrinterId(f) {
  const want = String(process.env.SDP_ID || "").trim();          // valfritt: skrivarens ID måste stämma
  if (want && String(f.ID || "").trim() !== want) {
    console.warn("[sdp] fel ID från skrivaren:", JSON.stringify(f.ID), "förväntat", want);
    throw new HttpError(403, "Okänd skrivare");
  }
}

export default wrap(async (req, res) => {
  checkKey(req);
  res.setHeader("Cache-Control", "no-store");

  // Diagnos i webbläsaren: https://…/api/sdp/<SDP_KEY>
  if (req.method === "GET") {
    const { jobs } = await gas("printQueue", {}, { timeout: 12000 });
    return send(res, 200, {
      ok: true,
      service: "Epson Server Direct Print",
      printerIdRequired: process.env.SDP_ID || null,
      jobsWaiting: jobs.length,
      jobs: jobs.map(j => ({ no: j.no, kind: j.kind, table: j.table || null, received: j.received })),
      hint: "Skrivaren ska POST:a ConnectionType=GetRequest hit var 5:e sekund."
    });
  }
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

  const f = form(req);
  checkPrinterId(f);

  if (f.ConnectionType === "GetRequest") {
    const { jobs } = await gas("printQueue", {}, { timeout: 12000 });
    if (!jobs.length) return res.status(200).end();              // tomt svar = inget att skriva ut
    const batch = jobs.slice(0, MAX_JOBS_PER_POLL);
    console.log("[sdp] skickar", batch.map(j => j.no).join(", "), "till", f.Name || f.ID || "skrivaren");
    res.status(200).setHeader("Content-Type", "text/xml; charset=utf-8");
    return res.end(sdpDocument(batch));
  }

  if (f.ConnectionType === "SetResponse") {
    const xml = String(f.ResponseFile || "");
    // Ett <ePOSPrint> per jobb: <printjobid>H1023</printjobid> … <response success="true" code="" status="…"/>
    for (const block of xml.split("<ePOSPrint>").slice(1)) {
      const no = (block.match(/<printjobid>\s*(H\d+)\s*<\/printjobid>/) || [])[1];
      if (!no) continue;
      const ok = /<response[^>]*\bsuccess="true"/.test(block);
      if (ok) { await gas("printDone", { no }); console.log("[sdp] utskriven", no); }
      else console.warn("[sdp] utskrift misslyckades", no, "code=" + ((block.match(/code="([^"]*)"/) || [])[1] || "?"),
                        "status=" + ((block.match(/status="([^"]*)"/) || [])[1] || "?"), "– jobbet ligger kvar i kön");
    }
    return res.status(200).end();
  }

  console.warn("[sdp] okänd ConnectionType:", JSON.stringify(f.ConnectionType));
  return res.status(200).end();
});
