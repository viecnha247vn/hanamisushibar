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

/* ---------- koi som simmar i takt med att sidan rullar ----------
   Fyra koi i olika teckningar (Kohaku, Sanke, Showa, Yamabuki Ogon). Kroppen är samma kontur som i
   logotypen; teckningen ligger som fläckar i kroppens koordinatsystem och böjs av samma våg, så
   färgen följer fisken när den simmar. Farten styrs av rullningen, med tröghet och mjuka vändningar. */
(function () {
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) {}
  if (!document.querySelector(".hero")) return;

  var PTS = [[[505.0,650.4],[471.3,632.1],[430.9,616.3],[370.6,601.9],[364.3,602.5],[356.5,600.6],[317.2,601.6],[284.8,608.2],[257.5,619.2],[235.8,632.5],[209.9,655.2],[194.8,671.1],[174.2,697.0],[173.5,699.9],[171.1,701.4],[170.4,704.3],[168.0,705.8],[167.3,708.7],[164.9,710.2],[160.9,718.5],[155.1,725.4],[120.2,790.0],[99.1,835.4],[93.2,851.5],[86.1,864.2],[84.5,871.0],[77.4,883.7],[76.0,889.5],[73.3,892.0],[64.8,910.5],[52.4,928.1],[38.0,945.2],[18.3,963.2],[-7.9,978.5],[-39.3,989.5],[-18.4,992.4],[-14.1,991.4],[-8.3,992.8],[8.2,992.6],[11.6,991.4],[15.5,992.3],[66.3,981.8],[93.6,970.8],[108.1,961.9],[124.9,947.4],[135.7,940.7],[143.5,938.5],[154.4,940.0],[167.6,949.4],[180.4,968.9],[200.1,990.0],[234.6,1017.7],[265.4,1039.5],[285.0,1056.5],[296.3,1069.4],[301.5,1077.9],[304.8,1089.9],[306.9,1089.4],[309.6,1065.4],[305.2,1040.7],[282.4,998.3],[253.7,950.3],[242.2,920.9],[237.1,899.1],[234.3,863.5],[236.6,828.0],[239.6,815.4],[239.7,806.2],[249.2,766.3],[252.8,759.9],[254.6,752.2],[269.1,725.8],[288.0,702.5],[311.3,682.4],[331.8,669.8],[349.2,661.6],[376.0,652.6],[393.4,648.5],[426.4,644.0],[472.5,644.7]],[[940.0,723.1],[944.4,704.6],[943.6,699.3],[945.2,692.5],[944.5,669.7],[940.1,645.0],[931.1,618.2],[922.9,600.8],[898.2,562.0],[868.2,528.2],[825.3,492.3],[766.2,455.6],[761.4,454.4],[751.6,448.0],[718.2,432.8],[737.1,452.8],[766.1,490.5],[785.4,521.8],[808.5,571.5],[827.4,591.5],[868.6,630.0],[889.0,652.4],[912.6,682.7],[927.4,706.8],[932.7,723.4],[935.0,727.0]],[[873.0,1082.4],[881.8,1071.1],[899.0,1042.3],[922.9,989.4],[925.6,977.7],[930.1,967.5],[940.6,923.7],[945.0,883.6],[942.3,882.0],[934.8,883.3],[930.9,882.3],[904.7,888.4],[861.7,918.3],[848.6,921.3],[838.4,921.0],[827.7,918.4],[819.4,914.4],[794.1,908.4],[786.9,908.7],[774.8,912.0],[769.9,910.8],[766.9,906.0],[770.9,889.5],[775.4,883.3],[781.4,879.6],[808.1,879.8],[827.5,876.2],[843.2,870.7],[863.2,860.0],[883.9,842.3],[913.5,808.3],[936.6,789.1],[937.3,786.2],[930.7,762.0],[922.0,738.3],[910.3,714.0],[884.6,675.0],[868.7,655.8],[844.6,631.5],[800.8,595.4],[778.8,579.9],[775.9,579.2],[774.4,576.8],[751.9,563.2],[748.0,562.3],[745.6,559.6],[726.1,550.9],[722.6,548.0],[716.8,546.6],[701.2,538.8],[693.4,536.9],[688.0,533.6],[667.1,526.6],[627.2,517.1],[616.4,527.9],[596.2,561.1],[581.8,578.2],[572.0,585.1],[559.4,590.3],[548.7,591.9],[536.1,588.9],[535.1,584.6],[569.5,539.3],[577.3,523.7],[578.9,508.6],[563.1,505.9],[538.8,504.2],[534.4,505.2],[528.6,503.9],[504.8,504.4],[501.5,505.6],[497.6,504.7],[463.7,509.0],[441.9,514.0],[420.6,521.3],[395.3,532.8],[361.6,553.5],[332.9,574.5],[352.6,574.0],[386.6,578.0],[428.4,587.9],[436.7,592.0],[448.4,594.7],[481.0,608.7],[502.0,619.9],[526.2,634.9],[549.7,652.8],[552.6,653.5],[558.4,650.7],[569.0,649.2],[607.4,652.1],[647.3,644.2],[673.5,646.3],[684.8,651.0],[702.4,663.4],[727.7,677.7],[755.0,688.3],[755.3,691.5],[738.4,701.8],[725.6,703.9],[706.9,700.5],[695.9,694.8],[681.3,691.3],[664.4,693.5],[651.6,699.7],[639.7,702.0],[605.7,693.9],[593.5,693.0],[622.1,728.6],[643.6,763.5],[656.7,790.3],[676.0,847.3],[686.7,893.1],[693.5,933.7],[701.1,962.3],[710.8,986.2],[724.2,1007.9],[741.9,1028.5],[764.7,1049.4],[786.7,1064.9],[828.2,1089.2],[844.5,1094.1],[855.9,1093.7],[867.7,1087.3]]], X0 = -42, X1 = 948, LEN = X1 - X0, FCX = 589, FCY = 763;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var TAU = Math.PI * 2;

  /* vågen: samma matematik för kropp och fläckar */
  function warp(x, y, phase, gain) {
    var u = clamp((x - X0) / LEN, 0, 1), amp = 78 * Math.pow(u, 1.85) * gain, a = phase - u * 4.1;
    return [x - amp * .1 * Math.cos(a), y + amp * Math.sin(a)];
  }
  function pathOf(subs, phase, gain) {
    var d = "", i, j, sub, q;
    for (i = 0; i < subs.length; i++) {
      sub = subs[i]; d += "M";
      for (j = 0; j < sub.length; j++) {
        q = warp(sub[j][0], sub[j][1], phase, gain);
        d += q[0].toFixed(1) + " " + q[1].toFixed(1) + (j < sub.length - 1 ? " " : "Z");
      }
    }
    return d;
  }
  /* en fläck = mjuk oval längs ryggen (u = läge nos→stjärt, v = tvärs, i andel av kroppens höjd) */
  function blob(u, v, ru, rv, wob) {
    var cx = X0 + u * LEN, cy = FCY + v * 300, pts = [], k;
    for (k = 0; k < 18; k++) {
      var t = k / 18 * TAU, r = 1 + Math.sin(t * 3 + wob) * .16 + Math.cos(t * 2 - wob) * .1;
      pts.push([cx + Math.cos(t) * ru * r, cy + Math.sin(t) * rv * r]);
    }
    return [pts];
  }

  /* teckningar – färger från riktiga koi */
  var PATTERNS = {
    kohaku:  { base: "#F7F4EE", marks: [["#E24B2E", blob(.20,-.15,150,160,.6)], ["#E24B2E", blob(.52, .05,190,150,2.1)], ["#D8412A", blob(.83,-.05,130,140,3.4)]] },
    sanke:   { base: "#F7F4EE", marks: [["#E7532F", blob(.30,-.10,200,160,1.2)], ["#EA5A33", blob(.74, .08,170,140,2.8)], ["#20242A", blob(.45,-.32,70,55,0)], ["#20242A", blob(.62,.28,60,50,1)], ["#20242A", blob(.16,.22,50,45,2)]] },
    showa:   { base: "#23272D", marks: [["#F3F0E9", blob(.28, .05,180,170,.4)], ["#D9402A", blob(.55,-.12,190,150,1.6)], ["#F3F0E9", blob(.86, .05,120,130,2.9)], ["#D9402A", blob(.12,.18,90,90,3.3)]] },
    ogon:    { base: "#F2B237", marks: [["#D98F24", blob(.50,-.30,520,150,.9)], ["#FBD679", blob(.45, .30,440,120,2.2)]] }
  };

  var NS = "http://www.w3.org/2000/svg";
  var layer = document.createElement("div"); layer.className = "koi-swim"; layer.setAttribute("aria-hidden", "true");
  var svg = document.createElementNS(NS, "svg"); layer.appendChild(svg);
  var defs = document.createElementNS(NS, "defs"); svg.appendChild(defs);

  /* fyra fiskar på olika djup: nära = större, snabbare, tydligare */
  var fish = [
    { id: "k1", pat: "kohaku", side: -1, depth: 1.00, speed: 1.00, sway: 22, offset: 0,    cls: "fish" },
    { id: "k2", pat: "showa",  side:  1, depth: 0.78, speed: 0.82, sway: 18, offset: 560,  cls: "fish second" },
    { id: "k3", pat: "ogon",   side: -1, depth: 0.58, speed: 0.66, sway: 14, offset: 1180, cls: "fish far" },
    { id: "k4", pat: "sanke",  side:  1, depth: 0.50, speed: 0.58, sway: 12, offset: 1700, cls: "fish far second" }
  ];
  fish.forEach(function (f) {
    var P = PATTERNS[f.pat];
    f.clip = document.createElementNS(NS, "clipPath"); f.clip.id = "koiclip-" + f.id;
    f.clipPath = document.createElementNS(NS, "path"); f.clip.appendChild(f.clipPath); defs.appendChild(f.clip);
    f.g = document.createElementNS(NS, "g"); f.g.setAttribute("class", f.cls);
    f.body = document.createElementNS(NS, "path"); f.body.setAttribute("fill", P.base); f.body.setAttribute("fill-rule", "evenodd"); f.g.appendChild(f.body);
    f.marksG = document.createElementNS(NS, "g"); f.marksG.setAttribute("clip-path", "url(#koiclip-" + f.id + ")"); f.g.appendChild(f.marksG);
    f.marks = P.marks.map(function (m) {
      var el = document.createElementNS(NS, "path"); el.setAttribute("fill", m[0]); f.marksG.appendChild(el); return { el: el, pts: m[1] };
    });
    /* ljusare buk + mörkare rygg: ger volym utan att kosta något */
    f.belly = document.createElementNS(NS, "path"); f.belly.setAttribute("fill", "#fff"); f.belly.setAttribute("opacity", ".22"); f.marksG.appendChild(f.belly);
    f.bellyPts = blob(.5, .42, 520, 90, 1.7);
    f.back = document.createElementNS(NS, "path"); f.back.setAttribute("fill", "#0B1520"); f.back.setAttribute("opacity", ".10"); f.marksG.appendChild(f.back);
    f.backPts = blob(.48, -.40, 560, 80, .3);
    f.heading = -90; f.turnGain = 0;
    svg.appendChild(f.g);
  });
  document.body.appendChild(layer);

  var W = 0, H = 0, edge = 90;
  function resize() {
    W = innerWidth; H = innerHeight;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var wrap = document.querySelector(".wrap");
    var content = wrap ? wrap.getBoundingClientRect().width : Math.min(W, 1180);
    edge = Math.max(84, (W - content) / 2 + 52);
    layer.style.setProperty("--edge", edge + "px");
  }
  resize(); addEventListener("resize", resize);

  var lastY = scrollY, raw = 0, vel = 0, beat = 0, swum = 0, prev = 0;
  addEventListener("scroll", function () { raw += scrollY - lastY; lastY = scrollY; }, { passive: true });

  function frame(now) {
    var dt = prev ? Math.min(now - prev, 50) / 1000 : 0.016; prev = now;

    vel += (raw - vel) * Math.min(1, dt * 6);          /* tröghet in i rörelsen */
    raw *= Math.pow(0.02, dt);                          /* mjuk utglidning */
    var pace = clamp(Math.abs(vel) / 22, 0, 1.7);
    var dirSign = vel >= 0 ? 1 : -1;
    beat += dt * (1.9 + pace * 6.5);
    swum += dt * (24 + pace * 165) * dirSign;

    var span = H + 640;
    fish.forEach(function (f) {
      /* vändning: fisken svänger runt i stället för att kastas om */
      var target = dirSign > 0 ? -90 : 90;
      var diff = ((target - f.heading + 540) % 360) - 180;
      var turn = clamp(diff, -1, 1) * Math.min(Math.abs(diff), 260 * dt * f.speed);
      f.heading += turn;
      f.turnGain += (Math.min(1, Math.abs(diff) / 40) - f.turnGain) * Math.min(1, dt * 5);

      var gain = (0.38 + 0.62 * clamp(pace, 0, 1)) * (1 + f.turnGain * .8);
      var phase = beat * f.speed + f.offset * 0.004;
      var d = pathOf(PTS, phase, gain);
      f.body.setAttribute("d", d); f.clipPath.setAttribute("d", d);
      f.marks.forEach(function (m) { m.el.setAttribute("d", pathOf(m.pts, phase, gain)); });
      f.belly.setAttribute("d", pathOf(f.bellyPts, phase, gain));
      f.back.setAttribute("d", pathOf(f.backPts, phase, gain));

      var pos = ((swum * f.speed * f.depth + f.offset) % span + span) % span;
      var y = H + 320 - pos;
      var x = (f.side < 0 ? edge * .42 : W - edge * .42) + Math.sin(beat * .32 * f.speed + f.offset) * f.sway;
      var lean = clamp(vel * .3, -12, 12) * (dirSign > 0 ? 1 : -1);
      var k = clamp(edge * 1.25, 86, 165) / 1100 * (0.55 + 0.45 * f.depth);
      f.g.setAttribute("transform",
        "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + (f.heading + lean).toFixed(1) + ") " +
        "scale(" + k.toFixed(4) + ") translate(" + (-FCX) + " " + (-FCY) + ")");
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
