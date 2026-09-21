/**
 * Menyn bor i fliken "Meny".
 *   Visas på webben = rätten finns på sidan (ändring kräver "Publicera webbplatsen")
 *   Slut idag       = kan inte beställas just nu, syns direkt på webben, nollställs varje natt
 */

const MENU_CACHE_KEY = 'menu_v1';

function readMenuRows_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(MENU_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const sh = sheet_(SHEET.MENU);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const c = colMap_(sh);
  // getValues (inte visad text): kryssrutor blir true/false oavsett språk på arket
  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const val = (r, name) => r[c[name] - 1];
  const str = x => String(x == null ? '' : x).trim();
  let cat = null;
  const out = data.map((r, i) => {
    if (str(val(r, 'Kategori-id'))) cat = { id: str(val(r, 'Kategori-id')), name: str(val(r, 'Kategori')), note: str(val(r, 'Kategoritext')) };
    if (!cat || !str(val(r, 'Id')) || !str(val(r, 'Namn'))) return null;
    return {
      categoryId: cat.id, category: cat.name, categoryNote: cat.note,
      id: str(val(r, 'Id')), name: str(val(r, 'Namn')),
      price: Number(String(val(r, 'Pris')).replace(/[^\d]/g, '')) || 0,
      desc: str(val(r, 'Beskrivning')),
      visible: val(r, 'Visas på webben') === true,
      soldOut: val(r, 'Slut idag') === true,
      _row: i + 2
    };
  }).filter(Boolean);
  cache.put(MENU_CACHE_KEY, JSON.stringify(out), 300);
  return out;
}

function clearMenuCache_() { CacheService.getScriptCache().remove(MENU_CACHE_KEY); }

function menuIndex_() {
  const idx = {};
  readMenuRows_().forEach(i => { idx[i.id] = i; });
  return idx;
}

/** Struktur som bygget på Vercel använder. */
function menuForWeb_() {
  const cats = [], byId = {};
  readMenuRows_().filter(i => i.visible).forEach(i => {
    if (!byId[i.categoryId]) {
      byId[i.categoryId] = { id: i.categoryId, name: i.category, items: [] };
      if (i.categoryNote) byId[i.categoryId].note = i.categoryNote;
      cats.push(byId[i.categoryId]);
    }
    const item = { id: i.id, name: i.name, price: i.price };
    if (i.desc) item.desc = i.desc;
    byId[i.categoryId].items.push(item);
  });
  return cats;
}

/**
 * Förberedelsetid i minuter: hur långt fram tidigaste hämtning ligger.
 * Köket ändrar den i köksvyn, t.ex. när det är fullt. 0 = webbplatsens standard.
 */
function lead_() {
  const v = Math.round(Number(prop_('PICKUP_LEAD', '0')));
  return v >= 5 && v <= 180 ? v : 0;
}

function setLead_(minutes) {
  const v = Math.round(Number(minutes));
  if (!(v >= 5 && v <= 180)) throw new ApiError(400, 'Förberedelsetiden måste vara mellan 5 och 180 minuter.');
  PropertiesService.getScriptProperties().setProperty('PICKUP_LEAD', String(v));
  log_('INFO', 'Förberedelsetid', v + ' min');
  return { leadMinutes: v };
}

/** Aktuella priser och slut-status – hämtas av webbsidan vid varje besök (cachas 60 s hos Vercel). */
function availability_() {
  const out = {};
  readMenuRows_().forEach(i => { out[i.id] = { price: i.price, available: i.visible && !i.soldOut }; });
  return out;
}

/** Klockslag "HH:MM" till minuter, och dagens datum/minut i restaurangens tidszon. */
function toMin_(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
function nowParts_() {
  const d = new Date();
  return { date: Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'),
           minutes: Number(Utilities.formatDate(d, APP.TZ, 'HH')) * 60 + Number(Utilities.formatDate(d, APP.TZ, 'mm')) };
}

function menuForKitchen_() {
  return readMenuRows_().filter(i => i.visible && i.price > 0)
    .map(i => ({ id: i.id, name: i.name, category: i.category, soldOut: i.soldOut }));
}

function setSoldOut_(id, soldOut) {
  const sh = sheet_(SHEET.MENU);
  const row = findRow_(sh, 'Id', id);
  if (!row) throw new ApiError(404, 'Rätten finns inte.');
  sh.getRange(row, colMap_(sh)['Slut idag']).setValue(soldOut);
  clearMenuCache_();
  return { id: id, soldOut: soldOut };
}

/** Tidsstyrd trigger 04:00: allt som var slut blir tillgängligt igen. */
function resetSoldOut() {
  const sh = sheet_(SHEET.MENU);
  const c = colMap_(sh)['Slut idag'];
  if (sh.getLastRow() > 1) sh.getRange(2, c, sh.getLastRow() - 1, 1).uncheck();
  clearMenuCache_();
}

/** Meny i arket: Hanami → Publicera webbplatsen */
/**
 * Menyändringar från koden (data/menu-andringar.js), så att arket inte behöver ändras för hand.
 * Körs automatiskt när webbplatsen byggs i produktion. Varje ändring har ett id och körs bara
 * en gång (listan sparas i MENU_PATCHES_DONE). Bara det som står i ändringen rörs – priser eller
 * texter som köket själv ändrat i arket lämnas i fred.
 *   set:   { "barn-1": { name, price, desc, visible } }
 *   add:   [{ after: "tillbehor-10", id, name, price, desc }]   ny rad direkt efter en befintlig
 *   hide:  ["bubble-4"]                                         bocka ur "Visas på webben"
 *   notes: { bubble: "Kategoritext" }
 */
function applyMenuPatches_(patches) {
  if (!Array.isArray(patches)) throw new ApiError(400, 'Menyändringar saknas.');
  const done = safeJson_(prop_('MENU_PATCHES_DONE', '[]')) || [];
  const pending = patches.filter(p => p && p.id && done.indexOf(String(p.id)) < 0);
  const report = [];
  if (!pending.length) return { applied: [], report: report };
  const sh = sheet_(SHEET.MENU), c = colMap_(sh);
  const put = (row, col, v) => { if (c[col]) sh.getRange(row, c[col]).setValue(v); };
  pending.forEach(p => {
    Object.keys(p.set || {}).forEach(id => {
      const row = findRow_(sh, 'Id', id), f = p.set[id] || {};
      if (!row) { report.push('Saknas: ' + id); return; }
      if (f.name != null) put(row, 'Namn', String(f.name));
      if (f.price != null) put(row, 'Pris', Number(f.price));
      if (f.desc != null) put(row, 'Beskrivning', String(f.desc));
      if (f.visible != null) put(row, 'Visas på webben', !!f.visible);
      report.push('Ändrad: ' + id);
    });
    (p.add || []).forEach(a => {
      if (findRow_(sh, 'Id', a.id)) { report.push('Finns redan: ' + a.id); return; }
      const after = findRow_(sh, 'Id', a.after);
      if (!after) { report.push('Hittar inte platsen efter ' + a.after + ' för ' + a.id); return; }
      sh.insertRowAfter(after);
      const row = after + 1, n = sh.getLastColumn(), from = sh.getRange(after, 1, 1, n), to = sh.getRange(row, 1, 1, n);
      from.copyTo(to, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);              // samma utseende och kryssrutor
      from.copyTo(to, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      ['Kategori-id', 'Kategori', 'Kategoritext'].forEach(k => put(row, k, ''));   // raden hör till samma kategori
      put(row, 'Id', String(a.id)); put(row, 'Namn', String(a.name || ''));
      put(row, 'Pris', Number(a.price) || 0); put(row, 'Beskrivning', String(a.desc || ''));
      put(row, 'Visas på webben', a.visible !== false); put(row, 'Slut idag', false);
      report.push('Ny: ' + a.id);
    });
    (p.hide || []).forEach(id => {
      const row = findRow_(sh, 'Id', id);
      if (row) { put(row, 'Visas på webben', false); report.push('Dold: ' + id); } else report.push('Saknas: ' + id);
    });
    Object.keys(p.notes || {}).forEach(cid => {
      const row = findRow_(sh, 'Kategori-id', cid);
      if (row) { put(row, 'Kategoritext', String(p.notes[cid])); report.push('Kategoritext: ' + cid); } else report.push('Saknas kategori: ' + cid);
    });
    done.push(String(p.id));
  });
  PropertiesService.getScriptProperties().setProperty('MENU_PATCHES_DONE', JSON.stringify(done.slice(-200)));
  clearMenuCache_();
  log_('INFO', 'Menyändringar', pending.map(p => p.id).join(', ') + ' – ' + report.join('; ').slice(0, 900));
  return { applied: pending.map(p => String(p.id)), report: report };
}

function publishSite() {
  const hook = prop_('VERCEL_DEPLOY_HOOK');
  if (!hook) { say_('VERCEL_DEPLOY_HOOK saknas i Skriptegenskaper.'); return; }
  const problems = validateMenu_();
  if (problems.length) { say_('Rätta menyn först:\n\n' + problems.slice(0, 15).join('\n')); return; }
  clearMenuCache_();
  const res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() < 300) {
    SpreadsheetApp.getActive().toast('Webbplatsen byggs om. Klart om ungefär en minut.', 'Hanami', 8);
    log_('INFO', 'Publicera', 'Deploy hook anropad');
  } else {
    say_('Kunde inte starta publicering (' + res.getResponseCode() + ').');
    log_('ERROR', 'Publicera', res.getContentText());
  }
}

function validateMenu_() {
  const seen = {}, errs = [];
  readMenuRows_().forEach(i => {
    if (seen[i.id]) errs.push('Rad ' + i._row + ': Id "' + i.id + '" finns redan (rad ' + seen[i.id] + ').');
    seen[i.id] = i._row;
    if (!/^[a-z0-9-]+$/.test(i.id)) errs.push('Rad ' + i._row + ': Id får bara innehålla a–z, 0–9 och bindestreck.');
    if (!/^[a-z0-9-]+$/.test(i.categoryId)) errs.push('Rad ' + i._row + ': Kategori-id ogiltigt.');
  });
  return errs;
}
