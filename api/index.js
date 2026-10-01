// EN enda serverlös funktion för hela API:et. Alla adresser under /api/ skrivs om hit
// av "rewrites" i vercel.json, och den här filen skickar vidare till rätt hanterare i lib/routes/.
//
// Varför inte api/[...route].js? Vercels catch-all fångade bara adresser med ETT led
// (/api/submit) men inte två (/api/sdp/<nyckel>) – skrivaren fick Vercels egen 404-sida.
// En vanlig fil + en uttrycklig rewrite är entydig och fungerar lika i alla miljöer.
// (Vercels Hobby-plan tillåter högst 12 funktioner – med en router spelar antalet inte någon roll.)
//
//   /api/submit                  beställning och bordsbokning
//   /api/admin                   köksvyn (kräver x-admin-key)
//   /api/availability            priser och "slut idag", cachas 60 s
//   /api/health                  kontrollerar kopplingen till Google Sheet
//   /api/print                   skrivarbryggan (Raspberry Pi, reserv)
//   /api/sdp/<SDP_KEY>           Epson Server Direct Print (TM-m30III i köket)
//   /api/cloudprnt/<KEY>         Star CloudPRNT (reserv)

import submit from "../lib/routes/submit.js";
import admin from "../lib/routes/admin.js";
import availability from "../lib/routes/availability.js";
import health from "../lib/routes/health.js";
import print from "../lib/routes/print.js";
import sdp from "../lib/routes/sdp.js";
import cloudprnt from "../lib/routes/cloudprnt.js";

const ROUTES = { submit, admin, availability, health, print };
const KEYED = { sdp, cloudprnt };                 // slutpunkter där nyckeln är andra ledet i adressen

/**
 * Tar fram ledet/leden efter /api/ oavsett hur Vercel levererar dem:
 *   1. ?route=sdp/abc  (från rewrite-regeln i vercel.json)
 *   2. x-vercel-original-pathname / x-invoke-path (ursprunglig sökväg vid rewrite)
 *   3. själva req.url  (vercel dev, eller om adressen inte skrevs om)
 */
export function pathSegments(req) {
  const split = s => decodeURIComponentSafe(String(s || "")).split("/").filter(Boolean);
  const fromQuery = [].concat(req.query?.route || []).flatMap(split);
  if (fromQuery.length) return fromQuery;
  for (const h of ["x-vercel-original-pathname", "x-invoke-path"]) {
    const v = req.headers?.[h];
    if (v && /^\/api\//.test(v)) return split(v.replace(/^\/api\/?/, ""));
  }
  try {
    const p = new URL(req.url || "/", "http://x").pathname;
    const segs = split(p.replace(/^\/+api\/?/, ""));
    return segs[0] === "index" ? segs.slice(1) : segs;
  } catch { return []; }
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export default async function handler(req, res) {
  const segments = pathSegments(req);
  const [first, second] = segments;

  if (KEYED[first] && segments.length === 2) {
    const { route: _ignored, ...rest } = req.query || {};
    req.query = { ...rest, key: second };
    return KEYED[first](req, res);
  }

  const route = ROUTES[first];
  if (!route || segments.length !== 1) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).end(JSON.stringify({ ok: false, error: `Okänd adress: /api/${segments.join("/")}` }));
  }
  return route(req, res);
}
