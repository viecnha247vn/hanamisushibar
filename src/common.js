/* ==========================================================================
   Gemensamt för alla sidor: hjälpfunktioner, öppettider, sidhuvud,
   animationer, Boka & Beställ-dialogen och sändning till servern.
   ========================================================================== */
const SETTINGS = /*SETTINGS*/;
const ENDPOINT = location.protocol === "file:" ? "" : "/api/submit";   // tom = demoläge
const TABLE = new URLSearchParams(location.search).get("bord");

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const kr = n => (n === 0 ? "ingår" : `${n} kr`);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dayNames = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

/* All tid räknas i Stockholm, oavsett var besökaren är */
const nowSE = () => new Date(new Date().toLocaleString("en-US", { timeZone: SETTINGS.timezone || "Europe/Stockholm" }));
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoursOn = d => (SETTINGS.closedDates.includes(isoDate(d)) ? null : SETTINGS.hours[d.getDay()]);

function nowInfo() {
  const d = nowSE(), h = d.getHours() + d.getMinutes() / 60, hrs = hoursOn(d);
  return { d, day: d.getDay(), h, hrs, open: !!hrs && h >= hrs[0] && h < hrs[1] };
}
function nextOpening(from) {
  for (let i = 1; i <= 14; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    const hrs = hoursOn(d); if (hrs) return { d, hrs, i };
  }
}

function renderStatus() {
  const { d, h, hrs, open } = nowInfo();
  let text;
  if (open) text = `Öppet nu · till ${pad(hrs[1])}.00`;
  else if (hrs && h < hrs[0]) text = `Stängt · öppnar ${pad(hrs[0])}.00`;
  else { const n = nextOpening(d); text = `Stängt · öppnar ${n.i === 1 ? "imorgon" : dayNames[n.d.getDay()]} ${pad(n.hrs[0])}.00`; }
  $$("[data-status]").forEach(el => { el.textContent = text; el.classList.toggle("closed", !open); });
  // dagens rad i öppettiderna
  const key = d.getDay() >= 1 && d.getDay() <= 5 ? "wk" : String(d.getDay());
  $$("[data-day]").forEach(r => r.classList.toggle("today", r.dataset.day === key));
  // erbjudanden som gäller nu
  const lunch = SETTINGS.lunch.days.includes(d.getDay()) && h >= SETTINGS.lunch.from && h < SETTINGS.lunch.to;
  const happy = open && h >= SETTINGS.happyHour.from && h < SETTINGS.happyHour.to;
  $$("[data-now]").forEach(el => { el.hidden = !({ lunch, happy })[el.dataset.now]; });
}

function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1800);
}

async function send(payload) {
  if (!ENDPOINT) { await new Promise(r => setTimeout(r, 500)); return { ok: true, demo: true, no: "DEMO" }; }
  let res;
  try { res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
  catch { throw new Error("Ingen anslutning. Kontrollera internet och försök igen."); }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `Något gick fel (${res.status}).`);
  return data;
}

/* ---------- sidhuvud blir fast vid scroll ---------- */
function initHeader() {
  const h = $("#hdr"); if (!h) return;
  const set = () => h.classList.toggle("solid", scrollY > 24 || document.body.dataset.solid === "1");
  set(); addEventListener("scroll", set, { passive: true });
}

/* ---------- mjuk inglidning ---------- */
function initReveal() {
  const els = $$(".reveal, .card");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach(e => io.observe(e));
}

/* ---------- rubrik som skjuts in bokstav för bokstav ---------- */
function initShoot() {
  $$(".shoot").forEach(h => {
    const text = h.dataset.text || h.textContent;
    h.setAttribute("aria-label", text);
    h.innerHTML = "";
    let i = 0;
    for (const word of text.split(/(\s+)/)) {
      const w = document.createElement("span");
      w.setAttribute("aria-hidden", "true");
      w.style.whiteSpace = "nowrap";
      for (const ch of word) {
        const el = document.createElement("i");
        el.textContent = ch;
        el.style.setProperty("--i", text.length - 1 - i++);    // sista bokstaven först = från höger
        w.appendChild(el);
      }
      h.appendChild(w);
    }
    const go = () => requestAnimationFrame(() => h.classList.add("go"));
    if (document.documentElement.classList.contains("splashing")) document.addEventListener("splash:done", go, { once: true });
    else go();
  });
}

/* ---------- fallande kronblad (få, långsamma) ---------- */
function initPetals(host, n = 7) {
  if (!host || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let k = 0; k < n; k++) {
    const p = document.createElement("span");
    p.className = "petal";
    p.style.left = `${8 + Math.random() * 88}%`;
    p.style.setProperty("--t", `${13 + Math.random() * 10}s`);
    p.style.setProperty("--d", `${-Math.random() * 20}s`);
    p.style.setProperty("--x", `${-40 - Math.random() * 120}px`);
    p.style.transform = `scale(${0.6 + Math.random() * 0.7})`;
    host.appendChild(p);
  }
}

/* ---------- Boka & Beställ ---------- */
function initPick({ onOrder, onBook } = {}) {
  const dlg = $("#pick"); if (!dlg) return;
  document.addEventListener("click", e => {
    if (e.target.closest("[data-pick-open]")) { dlg.showModal(); return; }
    if (e.target.closest("[data-pick-close]")) { dlg.close(); return; }
    const opt = e.target.closest("[data-pick]");
    if (opt) {
      const handler = opt.dataset.pick === "order" ? onOrder : onBook;
      if (handler) { e.preventDefault(); dlg.close(); handler(); }
    }
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // klick utanför
}

function initCommon() {
  initHeader(); initReveal(); initShoot(); renderStatus();
  setInterval(renderStatus, 60000);
}
