/**
 * Städning – håller driftarket litet så att webben och köksvyn förblir snabba.
 * ---------------------------------------------------------------------------
 * Tre saker händer varje natt (se nightlyCleanup):
 *
 *   1. RADERAS HELT      avbokade beställningar och bokningar äldre än 7 dagar,
 *                        loggrader äldre än 14 dagar.
 *   2. FLYTTAS TILL ARKIV  beställningar och bokningar äldre än 40 dagar flyttas
 *                        till ETT SEPARAT kalkylark ("Hanami Sushi Bar – Arkiv")
 *                        och tas bort härifrån. Bokföringslagen kräver att
 *                        underlag sparas i sju år – inget raderas alltså.
 *   3. AVIDENTIFIERAS    i arkivet rensas namn, telefon, e-post och meddelanden
 *                        när raden är äldre än 90 dagar (GDPR). Belopp, rätter,
 *                        datum och ordertyp finns kvar – det är det bokföringen
 *                        behöver.
 *
 * Säkerhet: inget raderas förrän ARKIVERINGEN lyckats (flytta först, radera sen).
 * Städningen rör aldrig flikarna Meny eller inställningar. Allt körs under
 * LockService så att en beställning som kommer in samtidigt inte tappas bort.
 *
 * Skriptegenskaper:
 *   CLEANUP_ENABLED   "on" = städa på riktigt. Allt annat = provkör (räkna bara).
 *   ARCHIVE_ID        id för arkivarket. Skapas automatiskt första gången.
 *   CLEANUP_EMAIL     dit fel rapporteras (annars NOTIFY_EMAIL, annars ägaren).
 */

const CLEAN = {
  PURGE_CANCELLED_DAYS: 7,    // avbokat → raderas helt
  PURGE_LOG_DAYS: 14,         // loggrader → raderas helt
  ARCHIVE_AFTER_DAYS: 40,     // färdiga rader → flyttas till arkivet
  ANONYMISE_AFTER_DAYS: 90,   // i arkivet → personuppgifter rensas
  MAX_ROWS_PER_RUN: 2000,     // tak per natt; resten tas nästa natt
  TIME_BUDGET_MS: 4 * 60000,  // Apps Script tillåter 6 min – vi slutar i tid
  PERSONAL: ['Namn', 'Telefon', 'E-post', 'Kommentar', 'Meddelande']
};

const ARCHIVE_EXTRA = ['Arkiverad', 'Anonymiserad'];

/* ---------------- datum ---------------- */

function today_() { return now_('yyyy-MM-dd'); }

/** Datumsträng N dagar bakåt. Jämförs som text – ISO-datum sorteras rätt ändå. */
function daysAgo_(n) {
  return Utilities.formatDate(new Date(Date.now() - n * 864e5), APP.TZ, 'yyyy-MM-dd');
}

/** Radens datum = det senaste av "Mottagen" och ev. "Hämtas datum"/"Datum".
 *  Så att en bokning långt fram i tiden aldrig städas bort i förtid. */
function rowDate_(get) {
  const dates = ['Mottagen', 'Hämtas datum', 'Datum']
    .map(k => String(get(k) || '').slice(0, 10))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.length ? dates.sort().pop() : '';
}

/* ---------------- arkivarket ---------------- */

/** Öppnar arkivarket, skapar det första gången. Ett eget kalkylark – inte en flik här. */
function archiveSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ARCHIVE_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e) { log_('WARN', 'Städning', 'Arkivarket (' + id + ') gick inte att öppna – skapar nytt.'); }
  }
  // Medvetet utan DriveApp: då skulle skriptet behöva behörighet till HELA Drive
  // för en ren bekvämlighet. Filen hamnar i ägarens "Min enhet" och kan flyttas
  // dit man vill för hand – id:t följer med filen.
  const ss = SpreadsheetApp.create(APP.NAME + ' – Arkiv');
  ss.setSpreadsheetTimeZone(APP.TZ);
  props.setProperty('ARCHIVE_ID', ss.getId());
  log_('INFO', 'Städning', 'Arkivark skapat: ' + ss.getUrl());
  return ss;
}

/** Flik i arkivet med samma rubriker som driftarket plus två spårningskolumner. */
function archiveSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  const want = headers.concat(ARCHIVE_EXTRA);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.getRange(1, 1, 1, want.length).setFontWeight('bold').setBackground('#161B26').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, want.length).setNumberFormat('@');  // allt som text – inget tolkas om
  }
  ['Blad1', 'Sheet1', 'Trang tính1'].forEach(n => {
    const junk = ss.getSheetByName(n);
    if (junk && junk.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(junk);
  });
  return sh;
}

/* ---------------- radoperationer ---------------- */

/** Raderar rader i fallande ordning och slår ihop intilliggande rader till ett anrop. */
function deleteRowsBatch_(sh, rowNumbers) {
  const rows = rowNumbers.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < rows.length) {
    const end = rows[i];
    let start = end;
    while (i + 1 < rows.length && rows[i + 1] === start - 1) { i++; start = rows[i]; }
    sh.deleteRows(start, end - start + 1);
    i++;
  }
}

/** Läser hela fliken en gång: { head, rows: [[...]], get(i, kolumn) }. */
function readAll_(sh) {
  const last = sh.getLastRow(), width = sh.getLastColumn();
  if (last < 2 || width < 1) return { head: [], rows: [], idx: {} };
  const values = sh.getRange(1, 1, last, width).getDisplayValues();
  const head = values[0];
  const idx = {}; head.forEach((h, i) => { idx[h] = i; });
  return { head: head, rows: values.slice(1), idx: idx };
}

/* ---------------- 1. radera helt ---------------- */

function purgeSheet_(sh, matches, dry) {
  const data = readAll_(sh);
  if (!data.rows.length) return { found: 0, done: 0 };
  const hit = [];
  data.rows.forEach((r, i) => {
    const get = k => (data.idx[k] === undefined ? '' : r[data.idx[k]]);
    if (matches(get)) hit.push(i + 2);                      // +2: rubrikrad och 1-baserat
  });
  const take = hit.slice(0, CLEAN.MAX_ROWS_PER_RUN);
  if (!dry && take.length) deleteRowsBatch_(sh, take);
  return { found: hit.length, done: dry ? 0 : take.length };
}

/* ---------------- 2. flytta till arkivet ---------------- */

/** Flyttar rader till arkivfliken och raderar dem här – i den ordningen. */
function archiveSheetRows_(mainSh, archSh, headers, matches, dry) {
  const data = readAll_(mainSh);
  if (!data.rows.length) return { found: 0, done: 0 };

  const hit = [];
  data.rows.forEach((r, i) => {
    const get = k => (data.idx[k] === undefined ? '' : r[data.idx[k]]);
    if (matches(get)) hit.push({ row: i + 2, values: r });
  });
  if (!hit.length) return { found: 0, done: 0 };
  const take = hit.slice(0, CLEAN.MAX_ROWS_PER_RUN);
  if (dry) return { found: hit.length, done: 0 };

  // Bygg raderna efter arkivets rubriker – kolumnordningen får aldrig antas vara lika.
  const archHead = archSh.getRange(1, 1, 1, archSh.getLastColumn()).getDisplayValues()[0];
  const stamp = now_();
  const out = take.map(h => archHead.map(col => {
    if (col === 'Arkiverad') return stamp;
    if (col === 'Anonymiserad') return '';
    const i = data.idx[col];
    return i === undefined ? '' : h.values[i];
  }));

  // Skriv först, radera sedan. Kraschar skrivningen ligger raden kvar i driftarket.
  archSh.getRange(archSh.getLastRow() + 1, 1, out.length, archHead.length).setValues(out);
  SpreadsheetApp.flush();
  deleteRowsBatch_(mainSh, take.map(h => h.row));
  return { found: hit.length, done: take.length };
}

/* ---------------- 3. avidentifiera i arkivet ---------------- */

/** Tar bort "↳ önskemål"-raderna ur beställningstexten (kan innehålla allergier). */
function stripNotes_(text) {
  return String(text || '').split('\n').filter(l => l.indexOf('↳') < 0).join('\n');
}

function stripJsonNotes_(json) {
  const items = safeJson_(json);
  if (!Array.isArray(items)) return '';
  return JSON.stringify(items.map(i => {
    const o = {};
    Object.keys(i).forEach(k => { if (k !== 'note') o[k] = i[k]; });
    return o;
  }));
}

function anonymiseSheet_(sh, dry) {
  const data = readAll_(sh);
  if (!data.rows.length) return { found: 0, done: 0 };
  const limit = daysAgo_(CLEAN.ANONYMISE_AFTER_DAYS);
  const iAnon = data.idx['Anonymiserad'];
  if (iAnon === undefined) return { found: 0, done: 0 };

  const hit = [];
  data.rows.forEach((r, i) => {
    const get = k => (data.idx[k] === undefined ? '' : r[data.idx[k]]);
    if (r[iAnon]) return;                                   // redan gjord
    const d = rowDate_(get);
    if (d && d < limit) hit.push(i);
  });
  if (dry || !hit.length) return { found: hit.length, done: 0 };

  const stamp = today_();
  const take = hit.slice(0, CLEAN.MAX_ROWS_PER_RUN);
  take.forEach(i => {
    const r = data.rows[i];
    CLEAN.PERSONAL.forEach(col => { if (data.idx[col] !== undefined) r[data.idx[col]] = '–'; });
    if (data.idx['Beställning'] !== undefined) r[data.idx['Beställning']] = stripNotes_(r[data.idx['Beställning']]);
    if (data.idx['Rader (data)'] !== undefined) r[data.idx['Rader (data)']] = stripJsonNotes_(r[data.idx['Rader (data)']]);
    r[iAnon] = stamp;
  });

  // Skriv tillbaka i ett svep (raderna ligger överst, så blocket är sammanhängande).
  const first = Math.min.apply(null, take), last = Math.max.apply(null, take);
  sh.getRange(first + 2, 1, last - first + 1, data.head.length)
    .setValues(data.rows.slice(first, last + 1).map(r => data.head.map((_, j) => (r[j] === undefined ? '' : r[j]))));
  return { found: hit.length, done: take.length };
}

/* ---------------- hela körningen ---------------- */

/** @param {boolean} dry true = räkna bara, rör ingenting.
 *  Varje siffra finns i två former: hur många rader som HITTADES (found) och hur
 *  många som faktiskt HANNS MED (done) innan taket eller tidsbudgeten tog slut. */
function runCleanup_(dry) {
  const t0 = Date.now();
  const cancelLimit = daysAgo_(CLEAN.PURGE_CANCELLED_DAYS);
  const logLimit = daysAgo_(CLEAN.PURGE_LOG_DAYS);
  const archLimit = daysAgo_(CLEAN.ARCHIVE_AFTER_DAYS);

  const keys = ['purgedOrders', 'purgedBookings', 'purgedLog',
                'archivedOrders', 'archivedBookings', 'anonymisedOrders', 'anonymisedBookings'];
  const r = { dry: !!dry, found: {}, ms: 0 };
  keys.forEach(k => { r[k] = 0; r.found[k] = 0; });
  const put = (key, res) => { r[key] = res.done; r.found[key] = res.found; };
  const timeLeft = () => Date.now() - t0 < CLEAN.TIME_BUDGET_MS;

  const orders = sheet_(SHEET.ORDERS), bookings = sheet_(SHEET.BOOKINGS), logg = sheet_(SHEET.LOG);

  const isOldCancelledOrder = get => {
    const d = rowDate_(get);
    return get('Status') === 'Avbokad' && d && d < cancelLimit;
  };
  const isOldCancelledBooking = get => {
    const d = rowDate_(get);
    return ['Avbokad', 'Avböjd'].indexOf(get('Status')) >= 0 && d && d < cancelLimit;
  };
  const isArchivableOrder = get => {
    const d = rowDate_(get);
    return get('Status') !== 'Avbokad' && d && d < archLimit;
  };
  const isArchivableBooking = get => {
    const d = rowDate_(get);
    return ['Avbokad', 'Avböjd'].indexOf(get('Status')) < 0 && d && d < archLimit;
  };

  // 1. radera helt
  put('purgedOrders', purgeSheet_(orders, isOldCancelledOrder, dry));
  put('purgedBookings', purgeSheet_(bookings, isOldCancelledBooking, dry));
  put('purgedLog', purgeSheet_(logg, get => {
    const d = String(get('Tid') || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < logLimit;
  }, dry));

  // 2. flytta till arkivet   3. avidentifiera där
  // Provkörning innan arkivet finns skapar inget arkiv – den räknar bara.
  const ss = (dry && !prop_('ARCHIVE_ID')) ? null : archiveSS_();
  if (!ss) {
    put('archivedOrders', purgeSheet_(orders, isArchivableOrder, true));
    put('archivedBookings', purgeSheet_(bookings, isArchivableBooking, true));
  } else {
    const aOrders = archiveSheet_(ss, SHEET.ORDERS, HEADERS.ORDERS);
    const aBookings = archiveSheet_(ss, SHEET.BOOKINGS, HEADERS.BOOKINGS);
    put('archivedOrders', archiveSheetRows_(orders, aOrders, HEADERS.ORDERS, isArchivableOrder, dry));
    if (timeLeft()) put('archivedBookings', archiveSheetRows_(bookings, aBookings, HEADERS.BOOKINGS, isArchivableBooking, dry));
    if (timeLeft()) put('anonymisedOrders', anonymiseSheet_(aOrders, dry));
    if (timeLeft()) put('anonymisedBookings', anonymiseSheet_(aBookings, dry));
  }

  r.ms = Date.now() - t0;
  r.more = keys.some(k => r.found[k] > r[k] && !dry);
  return r;
}

function cleanupHasMore_(r) { return !!r.more; }

/** "2000 av 8009" när taket slagit i, annars bara siffran. */
function cleanupSummary_(r) {
  const n = k => (r.dry ? r.found[k] : (r.found[k] > r[k] ? r[k] + ' av ' + r.found[k] : r[k]));
  return [
    'raderade: ' + n('purgedOrders') + ' beställningar, ' + n('purgedBookings') + ' bokningar, ' + n('purgedLog') + ' loggrader',
    'arkiverade: ' + n('archivedOrders') + ' beställningar, ' + n('archivedBookings') + ' bokningar',
    'avidentifierade: ' + n('anonymisedOrders') + ' beställningar, ' + n('anonymisedBookings') + ' bokningar',
    r.ms + ' ms'
  ].join(' · ') + (r.more ? ' · taket på ' + CLEAN.MAX_ROWS_PER_RUN + ' rader per körning nåddes, resten tas nästa natt' : '');
}

/* ---------------- nattlig körning ---------------- */

function nightlyCleanup() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { log_('WARN', 'Städning', 'Kunde inte ta låset – hoppar över i natt.'); return; }
  try {
    const dry = prop_('CLEANUP_ENABLED') !== 'on';
    const r = runCleanup_(dry);
    log_('INFO', dry ? 'Städning (provkörning)' : 'Städning', cleanupSummary_(r));
  } catch (err) {
    log_('ERROR', 'Städning', err.stack || err.message);
    mailCleanupError_(err);
  } finally {
    lock.releaseLock();
  }
}

function cleanupEmail_() {
  const to = prop_('CLEANUP_EMAIL') || prop_('NOTIFY_EMAIL');
  if (to) return to.split(',')[0].trim();
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}

function mailCleanupError_(err) {
  const to = cleanupEmail_();
  if (!to) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: '⚠️ ' + APP.NAME + ': den nattliga städningen misslyckades',
      name: APP.NAME,
      body: ['Städningen av driftarket gick inte igenom i natt.', '',
        String(err && (err.stack || err.message) || err), '',
        'Inget har raderats. Arket fungerar som vanligt – städningen försöker igen nästa natt.',
        SpreadsheetApp.getActive().getUrl()].join('\n')
    });
  } catch (e) { console.error(e); }
}

/* ---------------- menyval i kalkylarket ---------------- */

/** Installerar BARA den nattliga städningen. Tar ett par sekunder, till skillnad från
 *  setup() som går igenom all formatering. Använd den här när allt annat redan står rätt. */
function installCleanup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'nightlyCleanup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nightlyCleanup').timeBased().atHour(4).nearMinute(30).everyDays(1).inTimezone(APP.TZ).create();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLEANUP_ENABLED')) props.setProperty('CLEANUP_ENABLED', 'off');
  log_('INFO', 'Städning', 'Trigger installerad – står i provkörningsläge');
  say_('Städningen är installerad ✅\n\n' +
    'Den körs varje natt kl 04:30 men ÄNDRAR INGENTING än – den räknar bara och skriver i fliken Logg.\n\n' +
    'Nästa steg:\n' +
    '1. Ladda om kalkylarket så att menyn Hanami → Städning dyker upp\n' +
    '2. Städning → Provkör, och titta på siffrorna\n' +
    '3. Städning → Slå på nattlig städning när de ser rätt ut');
  return true;
}

/** Räknar vad som skulle städas, utan att röra någonting. */
function cleanupDryRun() {
  const r = runCleanup_(true);
  log_('INFO', 'Städning (provkörning)', cleanupSummary_(r));
  say_('Provkörning – ingenting har ändrats\n\n' +
    'Skulle raderas helt:\n' +
    '  • ' + r.found.purgedOrders + ' avbokade beställningar (äldre än ' + CLEAN.PURGE_CANCELLED_DAYS + ' dagar)\n' +
    '  • ' + r.found.purgedBookings + ' avbokade bokningar\n' +
    '  • ' + r.found.purgedLog + ' loggrader (äldre än ' + CLEAN.PURGE_LOG_DAYS + ' dagar)\n\n' +
    'Skulle flyttas till arkivarket (inget raderas):\n' +
    '  • ' + r.found.archivedOrders + ' beställningar (äldre än ' + CLEAN.ARCHIVE_AFTER_DAYS + ' dagar)\n' +
    '  • ' + r.found.archivedBookings + ' bokningar\n\n' +
    'Skulle avidentifieras i arkivet (äldre än ' + CLEAN.ANONYMISE_AFTER_DAYS + ' dagar):\n' +
    '  • ' + r.found.anonymisedOrders + ' beställningar\n' +
    '  • ' + r.found.anonymisedBookings + ' bokningar\n\n' +
    'Status: städningen är ' + (prop_('CLEANUP_ENABLED') === 'on' ? 'PÅ' : 'AV (provkörningsläge)') + '.\n' +
    'Slå på den med Hanami → Städning → Slå på.');
  return r;
}

/** Kör städningen direkt. Används för att beta av gammalt i stället för att vänta
 *  på nätterna – varje körning tar upp till CLEAN.MAX_ROWS_PER_RUN rader. */
function cleanupNow() {
  const ui = ui_();
  if (ui) {
    const svar = ui.alert('Städa nu?',
      'Rader äldre än ' + CLEAN.ARCHIVE_AFTER_DAYS + ' dagar flyttas till arkivarket och tas bort här. ' +
      'Avbokat äldre än ' + CLEAN.PURGE_CANCELLED_DAYS + ' dagar raderas helt.\n\n' +
      'Vill du fortsätta?', ui.ButtonSet.YES_NO);
    if (svar !== ui.Button.YES) return null;
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { say_('Arket är upptaget just nu. Försök igen om en stund.'); return null; }
  try {
    const r = runCleanup_(false);
    log_('INFO', 'Städning (manuell)', cleanupSummary_(r));
    say_('Klart ✅\n\n' + cleanupSummary_(r).split(' · ').join('\n') +
      (r.more ? '\n\nKör gärna en gång till för att beta av resten.' : ''));
    return r;
  } finally { lock.releaseLock(); }
}

function cleanupEnable() {
  PropertiesService.getScriptProperties().setProperty('CLEANUP_ENABLED', 'on');
  log_('INFO', 'Städning', 'Påslagen');
  say_('Städningen är påslagen ✅\n\nDen körs varje natt kl 04 och rapporterar i fliken Logg.\n' +
    'Första natten flyttas allt som redan är äldre än ' + CLEAN.ARCHIVE_AFTER_DAYS + ' dagar till arkivarket.');
}

function cleanupDisable() {
  PropertiesService.getScriptProperties().setProperty('CLEANUP_ENABLED', 'off');
  log_('INFO', 'Städning', 'Avstängd');
  say_('Städningen är avstängd. Den nattliga körningen räknar bara och ändrar ingenting.');
}

function openArchive() {
  const id = prop_('ARCHIVE_ID');
  if (!id) { say_('Arkivarket skapas automatiskt första gången städningen körs på riktigt.'); return; }
  say_('Arkivark (ligger i ägarens "Min enhet"):\n\nhttps://docs.google.com/spreadsheets/d/' + id + '/edit');
}

/* ---------------- läsa ur arkivet ---------------- */

/** Samma form som listOrders_ så att köksvyn kan rita arkiverade rader med samma kod. */
function archiveRowToOrder_(r) {
  return {
    no: r['Ordernr'], kind: r['Typ'] === 'Bord' ? 'table' : 'pickup', table: r['Bord'],
    pickupDate: r['Hämtas datum'], pickupTime: r['Hämtas tid'],
    received: r['Mottagen'], receivedTime: String(r['Mottagen'] || '').slice(11, 16),
    name: r['Namn'], phone: pretty_(r['Telefon']), payment: r['Betalning'],
    items: safeJson_(r['Rader (data)']) || String(r['Beställning'] || '').split('\n').map(t => ({ name: t, qty: '' })),
    total: Number(String(r['Summa']).replace(/\D/g, '')) || 0,
    message: r['Kommentar'], status: r['Status'], smsReady: r['Sms klar'], printed: r['Utskriven'],
    archived: true, anonymised: !!r['Anonymiserad']
  };
}

/** Rader ur en arkivflik som objekt. Returnerar [] om arkivet inte finns än. */
function archiveRows_(sheetName) {
  const id = prop_('ARCHIVE_ID');
  if (!id) return [];
  let sh;
  try { sh = SpreadsheetApp.openById(id).getSheetByName(sheetName); }
  catch (e) { log_('WARN', 'Arkiv', 'Kunde inte öppna arkivet: ' + e.message); return []; }
  if (!sh) return [];
  const data = readAll_(sh);
  return data.rows.map(r => {
    const o = {};
    data.head.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

/** Beställningar ur arkivet för ett datum. */
function listArchivedOrders_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new ApiError(400, 'Ogiltigt datum.');
  return archiveRows_(SHEET.ORDERS)
    .filter(r => r['Hämtas datum'] === date || String(r['Mottagen'] || '').indexOf(date) === 0)
    .map(archiveRowToOrder_)
    .reverse();
}

/* ---------------- månadsrapport ---------------- */

/** Räknar ihop en månad ur BÅDE driftarket och arkivet, så att siffrorna aldrig saknar rader. */
function monthReport_(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) month = now_('yyyy-MM');
  const cacheKey = 'report-' + month;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) { const o = safeJson_(hit); if (o) return o; }

  const byDay = {};
  const total = { orders: 0, revenue: 0, pickup: 0, table: 0, cancelled: 0, items: 0 };
  const source = { live: 0, archive: 0 };

  const add = (r, where) => {
    const day = (String(r['Hämtas datum'] || '').slice(0, 10) || String(r['Mottagen'] || '').slice(0, 10));
    if (day.indexOf(month) !== 0) return;
    source[where]++;
    const cancelled = r['Status'] === 'Avbokad';
    const sum = cancelled ? 0 : (Number(String(r['Summa']).replace(/\D/g, '')) || 0);
    const items = safeJson_(r['Rader (data)']);
    const d = byDay[day] || (byDay[day] = { date: day, orders: 0, revenue: 0 });
    if (cancelled) { total.cancelled++; return; }
    d.orders++; d.revenue += sum;
    total.orders++; total.revenue += sum;
    total[r['Typ'] === 'Bord' ? 'table' : 'pickup']++;
    if (Array.isArray(items)) total.items += items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  };

  rows_(sheet_(SHEET.ORDERS)).forEach(r => add(r, 'live'));
  archiveRows_(SHEET.ORDERS).forEach(r => add(r, 'archive'));

  const out = {
    month: month,
    days: Object.keys(byDay).sort().map(k => byDay[k]),
    total: total,
    source: source,
    average: total.orders ? Math.round(total.revenue / total.orders) : 0
  };
  // Historiska månader ändras inte – men cacha kort så att innevarande månad hålls färsk.
  cache.put(cacheKey, JSON.stringify(out), month < now_('yyyy-MM') ? 21600 : 300);
  return out;
}
