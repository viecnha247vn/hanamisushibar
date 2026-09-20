/**
 * Byten i sushimixar.
 * Används på servern (lib/routes/submit.js räknar tillägg och skriver köksraden)
 * och byggs in i menysidan av scripts/build.mjs (samma regler i webbläsaren).
 *
 * - Maki: varje "5 maki (kockens val)" kan bytas mot 5 bitar av en klassisk rulle – utan kostnad.
 *   De stora mixarna (20, 30, 40, 50) har chooseMaki: false – där är makin alltid kockens val.
 *   Vegan mix har en egen lista (choices) med bara vegetariska bitar.
 *   Nigirimixarna har freeChoice: true – gästen väljer alla bitar, alltid utan tillägg.
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
    "sushi-9": { nigiri: { "jätteräka": 2, avokado: 2, krabbstick: 1 }, maki: 5 },                             // Mamma mix
    // De stora mixarna: nigiri kan bytas, makin är alltid kockens val
    "sushi-5": { nigiri: { lax: 3, "jätteräka": 2, tonfisk: 1, avokado: 2, krabbstick: 2 }, maki: 10, chooseMaki: false },  // Sushi mix 20
    "sushi-6": { nigiri: { lax: 3, "jätteräka": 2, krabbstick: 2, avokado: 2, tonfisk: 1 }, maki: 20, chooseMaki: false },  // Sushi mix 30
    "sushi-7": { nigiri: { lax: 6, "jätteräka": 3, krabbstick: 2, avokado: 2, tonfisk: 2 }, maki: 25, chooseMaki: false },  // Sushi mix 40
    "sushi-8": { nigiri: { lax: 9, "jätteräka": 4, krabbstick: 2, avokado: 3, tonfisk: 2 }, maki: 30, chooseMaki: false },  // Sushi mix 50
    "sushi-10": { nigiri: { avokado: 3, tofu: 3 }, maki: 4, chooseMaki: false, choices: ["avokado", "tofu", "wakame", "gurka"] },  // Vegan mix
    // Nigirimixar: gästen väljer alla bitar själv, inget tillägg
    "nigiri-3": { nigiri: {}, pick: 10, maki: 0, chooseMaki: false, freeChoice: true },                         // Nigiri mix 10
    "nigiri-4": { nigiri: {}, pick: 12, maki: 0, chooseMaki: false, freeChoice: true }                          // Nigiri mix 12
  }
};

const sumOf = o => Object.values(o).reduce((a, b) => a + b, 0);

/** Antal nigiri som ska väljas i en mix. */
export const mixNeed = id => MIX.items[id].pick != null ? MIX.items[id].pick : sumOf(MIX.items[id].nigiri);

/** Bitar som får väljas i en viss mix (Vegan mix har en egen lista). */
export const mixChoices = id => (MIX.items[id] && MIX.items[id].choices) || MIX.nigiri;

/** Kontrollerar valen och räknar tillägg. Kastar Error med text till gästen vid ogiltigt val. */
export function mixPrice(id, opts) {
  const cfg = MIX.items[id];
  if (!opts) return { extra: 0, swaps: 0, detail: "" };
  if (!cfg || typeof opts !== "object") throw new Error("Den här rätten kan inte ändras.");
  const rolls = cfg.chooseMaki === false ? 0 : cfg.maki / MIX.makiPerRoll;
  const maki = Array.isArray(opts.maki) ? opts.maki.map(m => String(m || "")) : Array(rolls).fill("");
  if (maki.length !== rolls || maki.some(m => m && !MIX.maki.includes(m)))
    throw new Error(rolls ? "Ogiltigt val av maki." : "Makin i den här mixen är kockens val.");

  const choices = mixChoices(id);
  const want = opts.nigiri && typeof opts.nigiri === "object" ? opts.nigiri : cfg.nigiri;
  const counts = {};
  for (const [k, v] of Object.entries(want)) {
    const n = Number(v);
    if (!choices.includes(k) || !Number.isInteger(n) || n < 0 || n > 25) throw new Error("Ogiltigt val av nigiri.");
    if (n) counts[k] = n;
  }
  const need = mixNeed(id);
  if (sumOf(counts) !== need) throw new Error(`Välj exakt ${need} nigiri.`);

  let swaps = 0;
  if (!cfg.freeChoice) for (const k of choices) swaps += Math.max(0, (counts[k] || 0) - (cfg.nigiri[k] || 0));
  const extra = Math.max(0, swaps - MIX.freeSwaps) * MIX.extraPerSwap;

  const parts = [];
  if (maki.some(Boolean)) parts.push("Maki: " + maki.map(m => `${MIX.makiPerRoll} ${m || "kockens val"}`).join(" + "));
  if (swaps || cfg.freeChoice) parts.push("Nigiri: " + choices.filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] > 1 && MIX.plural[k] || k}`).join(", "));
  return { extra, swaps, detail: parts.join(" · ") };
}
