/**
 * Byten i sushimixar.
 * Används på servern (lib/routes/submit.js räknar tillägg och skriver köksraden)
 * och byggs in i menysidan av scripts/build.mjs (samma regler i webbläsaren).
 *
 * - Maki: varje "5 maki (kockens val)" kan bytas mot 5 bitar av en klassisk rulle – utan kostnad.
 *   De stora mixarna (20, 30, 40, 50) har chooseMaki: false – där är makin alltid kockens val.
 *   Vegan mix har en egen lista (choices) med bara vegetariska bitar.
 *   Nigirimixarna har freeChoice: true – gästen väljer alla bitar, alltid utan tillägg.
 * - Nigiri och Special nigiri (perPiece): gästen väljer sort och antal, pris per bit enligt arket.
 *   Radens antal = antal bitar, och valen måste gå jämnt ut med antalet.
 * - Doraemon sushi (barnmenyn): nigirin byts fritt utan kostnad (freeSwaps: 99), makin är 4 små gurkmaki.
 * - Varmrätter (addon): valfritt antal extra, t.ex. extra gyoza 15 kr/st.
 * - Bubble tea (drink: true): tapioka och en popping boba ingår. Extra boba och extra tapioka +10 kr styck.
 * - Nigiri: bitarna kan bytas fritt. De 4 första bytena ingår, därefter +10 kr per bytt bit.
 * Om beskrivningen av en mix ändras i Google Sheet ska innehållet ändras här också.
 */
export const MIX = {
  freeSwaps: 4,
  extraPerSwap: 10,
  makiPerRoll: 5,
  nigiri: ["lax", "tonfisk", "avokado", "jätteräka", "krabbstick", "tofu", "flamberad lax", "flamberad jätteräka", "wakame", "krabbröra"],
  plural: { "jätteräka": "jätteräkor", "flamberad jätteräka": "flamberade jätteräkor" },
  drink: { boba: ["mango", "jordgubb", "blåbär", "lychee"], extra: 10 },
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
    // Lunch: byt nigiri (4 ingår, därefter +10 kr), makin är kockens val.
    // Innehållet antas vara detsamma som Sushi mix 10 och 12 – kontrollera med köket.
    "lunch-1": { nigiri: { lax: 2, "jätteräka": 1, avokado: 1, krabbstick: 1 }, maki: 5, chooseMaki: false },   // 10 bitar sushi mix
    "lunch-2": { nigiri: { lax: 3, "jätteräka": 2, avokado: 2 }, maki: 5, chooseMaki: false },                 // 12 bitar sushi mix
    // Barnmeny: Doraemon sushi – byt nigiri fritt, gratis
    "barn-1": { nigiri: { lax: 1, "jätteräka": 1, avokado: 1 }, maki: 4, chooseMaki: false, freeSwaps: 99, makiText: "4 små gurkmaki" },
    // Nigirimixar: gästen väljer alla bitar själv, inget tillägg
    "nigiri-3": { nigiri: {}, pick: 10, maki: 0, chooseMaki: false, freeChoice: true },                         // Nigiri mix 10
    "nigiri-4": { nigiri: {}, pick: 12, maki: 0, chooseMaki: false, freeChoice: true },                         // Nigiri mix 12
    // Nigiri styckvis: sort och antal väljs i dialogen, priset per bit står i arket
    "nigiri-1": { perPiece: ["lax", "tonfisk", "avokado", "krabbstick", "jätteräka", "tofu", "wakame", "krabbröra"] },
    "nigiri-2": { perPiece: ["flamberad lax", "flamberad jätteräka"] },
    // Varmrätter: extra tillbehör per styck (0 = rätten som den är)
    "varmt-1": { addon: { label: "gyoza", price: 15 } },
    "varmt-2": { addon: { label: "tempuraräka", price: 17 } },
    "varmt-3": { addon: { label: "yakiniku", price: 50 } },
    "varmt-5": { addon: { label: "chicken katsu", price: 50 } },
    "varmt-6": { addon: { label: "kycklingspett", price: 40 } },
    // Bubble tea: välj te i menyn, popping boba i dialogen
    "bubble-1": { drink: true }, "bubble-2": { drink: true }, "bubble-3": { drink: true }
  }
};

const sumOf = o => Object.values(o).reduce((a, b) => a + b, 0);

/** Nigiri styckvis: antal per sort. Tillägg 0 – priset är arkets styckpris × antal bitar (radens antal). */
function piecePrice(list, opts) {
  const want = opts && typeof opts.pieces === "object" && opts.pieces ? opts.pieces : null;
  if (!want) throw new Error("Välj sort och antal nigiri.");
  const counts = {};
  for (const [k, v] of Object.entries(want)) {
    const n = Number(v);
    if (!list.includes(k) || !Number.isInteger(n) || n < 0 || n > 50) throw new Error("Ogiltigt val av nigiri.");
    if (n) counts[k] = n;
  }
  const pieces = sumOf(counts);
  if (pieces < 1) throw new Error("Välj minst en nigiri.");
  const detail = list.filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] > 1 && MIX.plural[k] || k}`).join(", ");
  return { extra: 0, swaps: 0, pieces, detail };
}

/** Bubble tea: en popping boba ingår (måste väljas), extra boba och extra tapioka kostar till. */
function drinkPrice(opts) {
  const D = MIX.drink, o = opts && typeof opts === "object" ? opts : {};
  const boba = String(o.boba || "");
  if (!D.boba.includes(boba)) throw new Error("Välj en popping boba.");
  const extra = Array.isArray(o.extra) ? [...new Set(o.extra.map(String))] : [];
  if (extra.some(e => !D.boba.includes(e))) throw new Error("Ogiltigt val av boba.");
  const tapioca = !!o.tapioca, n = extra.length + (tapioca ? 1 : 0);
  const parts = [`Boba: ${boba}`];
  if (extra.length) parts.push(`extra boba: ${extra.join(", ")}`);
  if (tapioca) parts.push("extra tapioka");
  return { extra: n * D.extra, swaps: 0, detail: parts.join(" · ") };
}

/** Antal nigiri som ska väljas i en mix. */
export const mixNeed = id => MIX.items[id].pick != null ? MIX.items[id].pick : sumOf(MIX.items[id].nigiri);

/** Bitar som får väljas i en viss mix (Vegan mix har en egen lista). */
export const mixChoices = id => (MIX.items[id] && MIX.items[id].choices) || MIX.nigiri;

/** Kontrollerar valen och räknar tillägg. Kastar Error med text till gästen vid ogiltigt val. */
export function mixPrice(id, opts) {
  const cfg = MIX.items[id];
  if (cfg && cfg.drink) return drinkPrice(opts);
  if (cfg && cfg.perPiece) return piecePrice(cfg.perPiece, opts);
  if (cfg && cfg.addon) {
    const n = opts == null ? 0 : Number(opts.extra);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error("Ogiltigt antal extra.");
    return { extra: n * cfg.addon.price, swaps: 0, detail: n ? `Extra ${cfg.addon.label} × ${n}` : "" };
  }
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
  const extra = Math.max(0, swaps - (cfg.freeSwaps != null ? cfg.freeSwaps : MIX.freeSwaps)) * MIX.extraPerSwap;

  const parts = [];
  if (maki.some(Boolean)) parts.push("Maki: " + maki.map(m => `${MIX.makiPerRoll} ${m || "kockens val"}`).join(" + "));
  if (swaps || cfg.freeChoice) parts.push("Nigiri: " + choices.filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] > 1 && MIX.plural[k] || k}`).join(", "));
  return { extra, swaps, detail: parts.join(" · ") };
}
