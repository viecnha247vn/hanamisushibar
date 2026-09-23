// Bygger dist/: renderar menyn till statisk HTML (bra för Google) och kopierar filer.
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import seedMenu from "../data/menu.seed.js";
import menuPatches from "../data/menu-andringar.js";
import settings from "../data/settings.js";
import { MIX } from "../lib/mix.js";
import { gas } from "../lib/gas.js";

// Först: nya menyändringar från koden förs in i arket (bara i produktion, varje ändring en gång).
if (process.env.GAS_URL && process.env.GAS_SECRET && (process.env.VERCEL_ENV === "production" || process.env.APPLY_MENU_PATCHES === "1")) {
  try {
    const r = await gas("applyMenuPatches", { patches: menuPatches }, { timeout: 60000 });
    console.log(r.applied && r.applied.length
      ? `Menyändringar i arket: ${r.applied.join(", ")}\n  ${(r.report || []).join("\n  ")}`
      : "Inga nya menyändringar för arket.");
  } catch (e) {
    console.warn("⚠️  Kunde inte föra över menyändringar till arket (är Apps Script uppdaterat?) – " + e.message);
  }
}

// Menyn hämtas från fliken "Meny" i Google Sheet. Reservmenyn används bara om arket inte går att nå.
let menu = seedMenu, source = "reservmeny (data/menu.seed.js)";
if (process.env.GAS_URL && process.env.GAS_SECRET) {
  try {
    const r = await gas("menu", {}, { timeout: 40000 });
    if (!Array.isArray(r.menu) || !r.menu.length) throw new Error("Tom meny från arket");
    menu = r.menu; source = "Google Sheet";
  } catch (e) {
    if (process.env.REQUIRE_SHEET_MENU === "1") throw e;
    console.warn("⚠️  Kunde inte hämta menyn från Google Sheet – använder reservmenyn.\n   " + e.message);
  }
} else {
  console.warn("ℹ️  GAS_URL/GAS_SECRET saknas – bygger med reservmenyn.");
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const kr = n => (n === 0 ? "ingår" : `${n} kr`);

// kontroll: unika id
const ids = menu.flatMap(c => c.items.map(i => i.id));
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) throw new Error("Dubbla id i menyn: " + dup.join(", "));

const plusIcon = `<svg aria-hidden="true"><use href="#i-plus"/></svg>`;
const two = n => String(n).padStart(2, "0");
const tag = id =>
  id === "lunch" ? `<span class="tag" data-for="lunch">Mån–fre ${settings.lunch.from}–${settings.lunch.to}</span>` :
  id === "happy" ? `<span class="tag" data-for="happy">${settings.happyHour.from}–${settings.happyHour.to} varje dag</span>` : "";

/* Kategoribilder i static/bilder/<id>-{s,m,l}.{webp,jpg}. Saknas bilden får kategorin ingen banderoll. */
/* Ånga över varma rätter. Per bild: [mitt i % från vänster, bredd %, varaktighet s, fördröjning s, start % från botten]
   Placera mitten över den varma maten i bilden. */
const STEAM = {
  varmt:     [[32, 20, 7.5, 0, 12], [46, 16, 9, 2.4, 14], [69, 22, 8.2, 4.2, 12]],
  burrito:   [[40, 16, 8, 0, 45], [54, 20, 9.5, 2.8, 50], [68, 15, 7.4, 5, 55], [47, 12, 10, 6.4, 40]],
  bento:     [[22, 18, 8.4, 0, 45], [36, 16, 9.6, 3, 50], [50, 18, 8, 5.2, 18], [29, 12, 10.5, 6.8, 40]],
  barn:      [[26, 16, 8.2, 0, 30], [44, 20, 9.4, 2.6, 18], [53, 14, 7.8, 5.4, 22], [34, 12, 10.2, 7, 26]],
  tillbehor: [[26, 18, 8.6, 0, 22], [42, 16, 9.8, 2.2, 30], [60, 18, 8, 4.6, 30], [75, 14, 10.4, 6.2, 34]]
};
const steam = id => STEAM[id] ? `
    <span class="steam" aria-hidden="true">${STEAM[id].map(([x, w, d, dl, b]) =>
      `<i style="--x:${x - w / 2}%;--w:${w}%;--d:${d}s;--dl:${dl}s;--b:${b}%"></i>`).join("")}</span>` : "";

const IMG_ALT = {
  sushi: "Sushi mix med lax, räka och maki", lyx: "Lyx maki med tobiko och guldflingor", deluxe: "Deluxe maki med pilgrimsmussla och körsbärsblom",
  maki: "Maki och uramaki på svart fat", sashimi: "Sashimi av tonfisk, lax och pilgrimsmussla", burrito: "Friterad sushi burrito, delad",
  bento: "Bento box med teriyaki, gyoza och nigiri", nigiri: "Nigiri i många sorter", lunch: "Nigiri, maki och uramaki på svart fat",
  bubble: "Classic, taro och matcha milk tea med tapioka, och skålar med popping boba i mango, jordgubb, blåbär och lychee", dryck: "Läsk och kolsyrat vatten i burk på en bänk under blommande körsbärsträd",
  happy: "Sushifat med nigiri, maki och uramaki på mörkt träbräde",
  tillbehor: "Förrätter: yakitori, vårrullar, gyoza, edamame och räkchips",
  barn: "Bento med kycklingspett, vårrullar, ris och maki",
  varmt: "Kycklingspett med ris, sallad och sesam", poke: "Poke bowl med lax, avokado, wakame och edamame"
};
const hasImg = id => existsSync(`static/bilder/${id}-l.webp`);
const banner = c => hasImg(c.id) ? `
  <figure class="cat-img">
    <picture>
      <source type="image/webp" srcset="/bilder/${c.id}-s.webp 480w, /bilder/${c.id}-m.webp 800w, /bilder/${c.id}-l.webp 1400w" sizes="(max-width:760px) 100vw, min(100vw - 48px, 1180px)">
      <img src="/bilder/${c.id}-m.jpg" srcset="/bilder/${c.id}-s.jpg 480w, /bilder/${c.id}-m.jpg 800w, /bilder/${c.id}-l.jpg 1400w" sizes="(max-width:760px) 100vw, min(100vw - 48px, 1180px)" width="1400" height="613" alt="${esc(IMG_ALT[c.id] || c.name)}" loading="lazy" decoding="async">
    </picture>${steam(c.id)}
  </figure>` : "";
const square = id => hasImg(id) ? `<picture class="dish-img"><source type="image/webp" srcset="/bilder/${id}-sq.webp"><img src="/bilder/${id}-sq.jpg" width="640" height="640" alt="" loading="lazy" decoding="async"></picture>` : "";

const chips = menu.map(c => `<a href="#cat-${c.id}" data-id="${c.id}">${esc(c.name)}</a>`).join("");
const menuHtml = menu.map((c, n) => `
<section class="cat${c.id === "happy" ? " hh" : ""}" id="cat-${c.id}" aria-labelledby="h-${c.id}">${c.id === "happy" ? `
  <svg class="branch hh-branch" viewBox="0 0 600 300" aria-hidden="true"><use href="#branch"/></svg>` : ""}
  <div class="cat-head"><span class="n" aria-hidden="true">${two(n + 1)}</span><h2 id="h-${c.id}"${c.id === "happy" ? ` class="hh-title" data-text="${esc(c.name)}"` : ""}>${esc(c.name)}</h2>${tag(c.id) || "<span></span>"}${c.note ? `<p>${esc(c.note).split(/(?:\r?\n){2,}/).map(p => `<span class="para">${p.replace(/\r?\n/g, "<br>")}</span>`).join("")}</p>` : ""}${c.id === "happy" ? `<p class="hh-state" data-hh role="status"></p>` : ""}</div>${banner(c)}
  <div class="items">
  ${c.items.map(i => `<div class="item" id="${i.id}">
    <span class="nm">${esc(i.name)}</span>
    ${i.desc ? `<span class="ds">${esc(i.desc)}</span>` : ""}${MIX.items[i.id] ? `
    <span class="mx">${MIX.items[i.id].choice ? `Välj ${MIX.items[i.id].choice.label.toLowerCase()}` : MIX.items[i.id].addon ? `Extra ${MIX.items[i.id].addon.label} +${MIX.items[i.id].addon.price} kr/st` : MIX.items[i.id].perPiece ? "Välj sort och antal" : MIX.items[i.id].drink ? "Välj popping boba" : MIX.items[i.id].freeChoice ? `Välj dina ${MIX.items[i.id].pick} bitar` : MIX.items[i.id].freeSwaps >= 99 ? "Byt nigiri fritt" : MIX.items[i.id].chooseMaki === false ? "Byt nigiri" : "Välj maki · byt nigiri"}</span>` : ""}
    <span class="pr">${kr(i.price)}</span>
    ${i.price > 0
      ? `<button class="add" type="button" data-add="${i.id}" data-cat="${c.id}" data-name="${esc(i.name)}" data-price="${i.price}" aria-label="Lägg till ${esc(i.name)}">${plusIcon}</button>`
      : `<span></span>`}
  </div>`).join("\n  ")}
  </div>
</section>`).join("");

// Utvalda kategorier på startsidan
const FEATURED = [
  ["lunch", "Sushi mix eller bowl, med dryck och misosoppa – vardagar 11–14."],
  ["happy", "Stora sushi mix till lägre pris, varje dag 16–17."],
  ["nigiri", "Handformade riskuddar – välj sort och antal själv."],
  ["sushi", "Kockens blandning – från 8 till 50 bitar."],
  ["maki", "Klassiska rullar – California, Philadelphia, Alaskan och egen hosomaki."],
  ["lyx", "Rullar med lax, avokado och såser, toppade i lyxklass."],
  ["deluxe", "Friterade och flamberade rullar med rostad lök och teriyaki."],
  ["sashimi", "Rena skivor av rå fisk, utan ris."],
  ["poke", "Sushiris, mango, edamame och sjögrässallad i skål."],
  ["varmt", "Gyoza, tempura, yakiniku och chicken katsu – varmt och mättande."],
  ["burrito", "Friterad sushi i burritoform, toppad med såser."],
  ["bento", "Varmt och kallt i samma låda – en hel måltid."],
  ["barn", "Mindre portioner för de yngsta – byt nigiri fritt."],
  ["tillbehor", "Karaage, vårrullar, edamame, såser och misosoppa."],
  ["dryck", "Läsk, vatten och juice i kylen."],
  ["bubble", "Classic, taro och matcha med tapioka och popping boba."]
];

// Snabblänkar till varje kategori i menyn (visas ovanför korten)
const quicklinks = menu.map(c => `<a href="/meny#cat-${c.id}">${esc(c.name.replace(/, friterad$/i, ""))}</a>`).join("");
const highlights = FEATURED.map(([id, text], n) => {
  const c = menu.find(x => x.id === id);
  if (!c) return "";
  const prices = c.items.map(i => i.price).filter(p => p > 0);
  return `      <a class="card dish${hasImg(c.id) ? " has-img" : ""}" href="/meny#cat-${c.id}">
        ${square(c.id)}
        <span class="n" aria-hidden="true">${two(n + 1)}</span>
        <h3>${esc(c.name.replace(/, friterad$/i, ""))}</h3>
        <p>${esc(text)}</p>
        <span class="ft"><span class="label">${c.items.length} rätter</span><b>från ${Math.min(...prices)} kr</b><svg aria-hidden="true"><use href="#i-arrow"/></svg></span>
      </a>`;
}).join("\n");

const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = two;
const [street, rest] = settings.address.split(", ");
const jsonld = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: settings.name,
  url: "https://hanamisushibar.se/",
  logo: "https://hanamisushibar.se/logo-512.png",
  image: "https://hanamisushibar.se/logo-512.png",
  telephone: "+46" + settings.phone.replace(/\D/g, "").slice(1),
  email: settings.email,
  servesCuisine: ["Japansk", "Sushi", "Poke"],
  priceRange: "$$",
  acceptsReservations: "True",
  address: { "@type": "PostalAddress", streetAddress: street, postalCode: rest.slice(0, 6), addressLocality: rest.slice(7), addressCountry: "SE" },
  openingHoursSpecification: Object.entries(settings.hours).filter(([, h]) => h).map(([d, h]) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: dayMap[d], opens: `${pad(h[0])}:00`, closes: `${pad(h[1])}:00`
  })),
  hasMenu: {
    "@type": "Menu",
    hasMenuSection: menu.map(c => ({
      "@type": "MenuSection", name: c.name,
      hasMenuItem: c.items.filter(i => i.price > 0).map(i => ({
        "@type": "MenuItem", name: i.name, ...(i.desc ? { description: i.desc } : {}),
        offers: { "@type": "Offer", price: String(i.price), priceCurrency: "SEK" }
      }))
    }))
  },
  sameAs: ["https://www.facebook.com/p/Hanami-sushi-bar-61557294257313/", `https://www.instagram.com/${settings.instagram}/`]
};

const clientSettings = {
  phone: settings.phone, email: settings.email, swish: settings.swish, name: settings.name, allergens: settings.allergens, hours: settings.hours, closedDates: settings.closedDates, lunch: settings.lunch, happyHour: settings.happyHour,
  pickupLeadMinutes: settings.pickupLeadMinutes, pickupDaysAhead: settings.pickupDaysAhead, bookingDaysAhead: settings.bookingDaysAhead,
  maxBookingGuests: settings.maxBookingGuests
};

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("static", "dist", { recursive: true });

// ---------- gemensamma delar ----------
const read = f => readFileSync(f, "utf8");
const postal = rest;                                   // "262 31 Ängelholm"
const city = rest.slice(7);
const tel = "+46" + settings.phone.replace(/\D/g, "").slice(1);
const mapq = encodeURIComponent(`${street}, ${postal}`);
const range = h => (h ? `${two(h[0])}.00–${two(h[1])}.00` : "Stängt");
const H = settings.hours;
const weekSame = [1, 2, 3, 4, 5].every(d => JSON.stringify(H[d]) === JSON.stringify(H[1]));
const hourRows = (weekSame ? [["wk", "Måndag–fredag", H[1]]] : [1, 2, 3, 4, 5].map(d => [String(d), ["", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag"][d], H[d]]))
  .concat([["6", "Lördag", H[6]], ["0", "Söndag", H[0]]]);
const lunchItems = (menu.find(c => c.id === "lunch")?.items || []).map(i => i.price).filter(Boolean);
const happyItems = (menu.find(c => c.id === "happy")?.items || []).map(i => i.price).filter(Boolean);
const vars = {
  STREET: street, STREET_UP: street.toUpperCase(), POSTAL: postal, CITY: city, CITY_UP: city.toUpperCase(),
  PHONE: settings.phone, TEL: tel, EMAIL: settings.email, MAPQ: mapq, YEAR: String(new Date().getFullYear()), MAXG: String(settings.maxBookingGuests),
  COUNT: String(ids.length),
  LUNCH_FROM: String(lunchItems.length ? Math.min(...lunchItems) : ""), LUNCH_TIME: `${two(settings.lunch.from)}–${two(settings.lunch.to)}`,
  HAPPY_FROM: String(happyItems.length ? Math.min(...happyItems) : ""), HAPPY_TIME: `${two(settings.happyHour.from)}–${two(settings.happyHour.to)}`,
  HOURS_ROWS: hourRows.map(([k, label, h]) => `<div data-day="${k}"><span>${label}</span><span class="num">${range(h)}</span></div>`).join(""),
  HOURS_LIST: hourRows.map(([, label, h]) => `<li>${label} · ${range(h)}</li>`).join("")
};
const fill = html => html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Jost:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&display=swap" rel="stylesheet">`;
const head = (path) => `<meta name="theme-color" content="#FCF9F8">
<meta name="color-scheme" content="light">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/logo-512.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="sv_SE">
<meta property="og:site_name" content="Hanami Sushi Bar">
<meta property="og:url" content="https://hanamisushibar.se${path}">
<meta property="og:image" content="https://hanamisushibar.se/logo-512.png">
${fonts}
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<style>${read("src/theme.css")}</style>`;

const common = read("src/common.js").replace("/*SETTINGS*/", JSON.stringify({ ...clientSettings, timezone: settings.timezone }));
function page(src, { path, headerExtra = "", current = "" }) {
  let html = read(src)
    .replace("<!--HEAD-->", head(path))
    .replace("<!--SPLASH-->", read("src/partials/splash.html"))
    .replace("<!--SYMBOLS-->", read("src/partials/symbols.html"))
    .replace("<!--HEADER-->", read("src/partials/header.html").replace("{{HDR_EXTRA}}", headerExtra).replace("{{CUR_MENY}}", current === "meny" ? 'aria-current="page"' : ""))
    .replace("<!--FOOTER-->", read("src/partials/footer.html"))
    .replace("<!--FAB-->", read("src/partials/fab.html"))
    .replace("<!--COMMON_JS-->", () => common)
    .replace("<!--MIX_JS-->", () => read("lib/mix.js").replace(/^export /gm, ""))
    .replace("<!--HIGHLIGHTS-->", () => highlights)
    .replace("<!--QUICKLINKS-->", () => quicklinks)
    .replace("<!--CHIPS-->", () => chips)
    .replace("<!--MENU-->", () => menuHtml);
  html = fill(html);
  const left = html.match(/\{\{[A-Z_]+\}\}|<!--[A-Z_]+-->/g);
  if (left) throw new Error(`${src}: ej ersatta platshållare ${[...new Set(left)].join(", ")}`);
  return html;
}

writeFileSync("dist/index.html", page("src/index.html", { path: "/" }));
writeFileSync("dist/meny.html", page("src/meny.html", {
  path: "/meny", current: "meny",
  headerExtra: `<button class="btn gold" type="button" data-cart aria-label="Öppna varukorg">Varukorg <span class="cartn" id="cartCount"></span></button>`
}));

const kok = read("src/kok.html").replace("/*SETTINGS*/", JSON.stringify({ tableCount: settings.tableCount, name: settings.name }));
writeFileSync("dist/kok.html", kok);

console.log(`Byggt från ${source}: ${menu.length} kategorier, ${ids.length} rätter → dist/ (index, meny, kok)`);
