// GET /api/availability – aktuella priser, "slut idag", köksvyns förberedelsetid och om Swish Handel är på. Cachas 60 s i Vercels CDN.
import { gas } from "../gas.js";
import { wrap, send } from "../util.js";
import settings from "../../data/settings.js";
import { swishConfigured } from "../swish.js";

export default wrap(async (req, res) => {
  const r = await gas("availability", {}, { timeout: 12000 });
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  send(res, 200, { ok: true, items: r.items, leadMinutes: r.leadMinutes || 0, ordering: r.ordering || { open: true },
    swishApi: !!settings.swishApi && swishConfigured() });
});
