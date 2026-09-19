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

/** Aktuella priser och slut-status – hämtas av webbsidan vid varje besök (cachas 60 s hos Vercel). */
function availability_() {
  const out = {};
  readMenuRows_().forEach(i => { out[i.id] = { price: i.price, available: i.visible && !i.soldOut }; });
  return out;
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
function publishSite() {
  const ui = SpreadsheetApp.getUi();
  const hook = prop_('VERCEL_DEPLOY_HOOK');
  if (!hook) { ui.alert('VERCEL_DEPLOY_HOOK saknas i Skriptegenskaper.'); return; }
  const problems = validateMenu_();
  if (problems.length) { ui.alert('Rätta menyn först:\n\n' + problems.slice(0, 15).join('\n')); return; }
  clearMenuCache_();
  const res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() < 300) {
    SpreadsheetApp.getActive().toast('Webbplatsen byggs om. Klart om ungefär en minut.', 'Hanami', 8);
    log_('INFO', 'Publicera', 'Deploy hook anropad');
  } else {
    ui.alert('Kunde inte starta publicering (' + res.getResponseCode() + ').');
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
