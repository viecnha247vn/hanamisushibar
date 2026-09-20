// En enda serverlös funktion som skickar vidare till rätt hanterare i lib/routes/.
// Vercels Hobby-plan tillåter högst 12 funktioner per distribution – med en router spelar
// antalet slutpunkter ingen roll, och kallstarterna blir färre eftersom allt delar samma instans.
//
//   /api/submit                  beställning och bordsbokning
//   /api/admin                   köksvyn (kräver x-admin-key)
//   /api/availability            priser och "slut idag", cachas 60 s
//   /api/health                  kontrollerar kopplingen till Google Sheet
//   /api/print                   skrivarbryggan (Raspberry Pi, reserv)
//   /api/sdp/<SDP_KEY>           Epson Server Direct Print
//   /api/cloudprnt/<KEY>         Star CloudPRNT (reserv)

import submit from "../lib/routes/submit.js";
import admin from "../lib/routes/admin.js";
import availability from "../lib/routes/availability.js";
import health from "../lib/routes/health.js";
import print from "../lib/routes/print.js";
import sdp from "../lib/routes/sdp.js";
import cloudprnt from "../lib/routes/cloudprnt.js";

const ROUTES = { submit, admin, availability, health, print };
const KEYED = { sdp, cloudprnt };                 // slutpunkter där nyckeln ligger i adressen

/** Vägen kommer normalt i req.query.route. Saknas den läser vi den ur adressen i stället. */
function pathSegments(req) {
  const q = [].concat(req.query?.route || []).filter(Boolean);
  if (q.length) return q;
  try {
    return new URL(req.url, "http://x").pathname.replace(/^\/+api\/?/, "").split("/").filter(Boolean);
  } catch { return []; }
}

export default async function handler(req, res) {
  const segments = pathSegments(req);
  const [first, second] = segments;

  if (KEYED[first]) {
    req.query = { ...req.query, key: second || "" };
    return KEYED[first](req, res);
  }

  const route = ROUTES[first];
  if (!route || segments.length > 1) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).end(JSON.stringify({ ok: false, error: `Okänd adress: /${segments.join("/")}` }));
  }
  return route(req, res);
}
