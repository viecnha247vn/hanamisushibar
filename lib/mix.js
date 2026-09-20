/**
 * Byten i sushimixar.
 * Används på servern (lib/routes/submit.js räknar tillägg och skriver köksraden)
 * och byggs in i menysidan av scripts/build.mjs (samma regler i webbläsaren).
 *
 * - Maki: varje "5 maki (kockens val)" kan bytas mot 5 bitar av en klassisk rulle – utan kostnad.
 * - Nigiri: bitarna kan bytas fritt. De 4 första bytena ingår, därefter +10 kr per bytt bit.
 * Om beskrivningen av en mix ändras i Google Sheet ska innehållet ändras här också.
 */
export const MIX = {
  freeSwaps: 4,
  extraPerSwap: 10,
  makiPerRoll: 5,
  nigiri: ["lax", "tonfisk", "avokado", "jätteräka", "krabbstick", "tofu", "flamberad lax", "flamberad räka", "wakame", "krabbröra"],
  plural: { "jätteräka": "jätteräkor", "flamberad räka": "flamberade räkor" },
  maki: ["California", "Chili maki", "Philadelphia maki", "Alaskan maki", "Green maki", "Vegan maki"],
  items: {
    "sushi-1": { nigiri: { lax: 1, "jätteräka": 1, avokado: 1 }, maki: 5 },                                    // Sushi mix 8
    "sushi-2": { nigiri: { lax: 2, "jätteräka": 1, avokado: 1, krabbstick: 1 }, maki: 5 },                     // Sushi mix 10
    "sushi-3": { nigiri: { lax: 3, "jätteräka": 2, avokado: 2 }, maki: 5 },                                    // Sushi mix 12
    "sushi-4": { nigiri: { lax: 3, "jätteräka": 2, tonfisk: 1, avokado: 2, krabbstick: 2 }, maki: 5 },         // Sushi mix 15
    "sushi-5": { nigiri: { lax: 3, "jätteräka": 2, tonfisk: 1, avokado: 2, krabbstick: 2 }, maki: 10 },        // Sushi mix 20
    "sushi-9": { nigiri: { "jätteräka": 2, avokado: 2, krabbstick: 1 }, maki: 5 }                              // Mamma mix
  }
};

const sumOf = o => Object.values(o).reduce((a, b) => a + b, 0);

/** Kontrollerar valen och räknar tillägg. Kastar Error med text till gästen vid ogiltigt val. */
export function mixPrice(id, opts) {
  const cfg = MIX.items[id];
  if (!opts) return { extra: 0, swaps: 0, detail: "" };
  if (!cfg || typeof opts !== "object") throw new Error("Den här rätten kan inte ändras.");
  const rolls = cfg.maki / MIX.makiPerRoll;
  const maki = Array.isArray(opts.maki) ? opts.maki.map(m => String(m || "")) : Array(rolls).fill("");
  if (maki.length !== rolls || maki.some(m => m && !MIX.maki.includes(m))) throw new Error("Ogiltigt val av maki.");

  const want = opts.nigiri && typeof opts.nigiri === "object" ? opts.nigiri : cfg.nigiri;
  const counts = {};
  for (const [k, v] of Object.entries(want)) {
    const n = Number(v);
    if (!MIX.nigiri.includes(k) || !Number.isInteger(n) || n < 0 || n > 20) throw new Error("Ogiltigt val av nigiri.");
    if (n) counts[k] = n;
  }
  const need = sumOf(cfg.nigiri);
  if (sumOf(counts) !== need) throw new Error(`Välj exakt ${need} nigiri.`);

  let swaps = 0;
  for (const k of MIX.nigiri) swaps += Math.max(0, (counts[k] || 0) - (cfg.nigiri[k] || 0));
  const extra = Math.max(0, swaps - MIX.freeSwaps) * MIX.extraPerSwap;

  const parts = [];
  if (maki.some(Boolean)) parts.push("Maki: " + maki.map(m => `${MIX.makiPerRoll} ${m || "kockens val"}`).join(" + "));
  if (swaps) parts.push("Nigiri: " + MIX.nigiri.filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] > 1 && MIX.plural[k] || k}`).join(", "));
  return { extra, swaps, detail: parts.join(" · ") };
}
