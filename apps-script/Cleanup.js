/**
 * Städning – håller driftarket litet så att webben, köksvyn och skrivaren förblir snabba.
 * ------------------------------------------------------------------------------------
 * Körs varje natt (nightlyCleanup, trigger 04:30) och gör tre saker, i den här ordningen:
 *
 *   1. ARKIVERAR   Beställningar och bokningar vars dag är äldre än ARCHIVE_AFTER_DAYS flyttas
 *                  till ett SEPARAT kalkylark ("<arkets namn> – Arkiv") och tas bort här.
 *                  Bokföringslagen kräver att underlag sparas i sju år – därför raderas inget,
 *                  det flyttas. Flytten sker FÖRE raderingen; misslyckas flytten rörs inget.
 *   2. RADERAR     Avbokade beställningar/bokningar äldre än PURGE_CANCELLED_DAYS (ingen
 *                  intäkt, inget att bokföra) och loggrader äldre än PURGE_LOG_DAYS.
 *   3. AVIDENTIFIERAR  I arkivet rensas namn, telefon, e-post och fritext när raden är äldre än
 *                  ANONYMISE_AFTER_DAYS (GDPR). Belopp, rätter, datum och typ finns kvar.
 *
 * En bokning långt fram i tiden städas aldrig: radens "dag" är det senaste av Mottagen och
 * Hämtas datum/Datum. Flikarna Meny och inställningar rörs aldrig. Allt körs under LockService
 * så att en beställning som kommer in samtidigt inte tappas bort.
 *
 * Städningen startar i PROVKÖRNINGSLÄGE (räknar bara). Slå på den medvetet:
 *   Hanami → Städning → Provkör …  → siffrorna ser rimliga ut → Slå på nattlig städning.
 *
 * Skriptegenskaper:
 *   CLEANUP_ENABLED  "on" = städa på riktigt, allt annat = provkör
 *   ARCHIVE_ID       arkivarkets id – skapas automatiskt första gången
 *   CLEANUP_EMAIL    dit fel rapporteras (annars NOTIFY_EMAIL, annars arkets ägare)
 */

const CLEAN = {
  ARCHIVE_AFTER_DAYS: 30,      // färdiga rader → flyttas till arkivet (köksvyn visar ändå bara dagens/kommande)
  PURGE_CANCELLED_DAYS: 7,     // avbokat → raderas helt
  PURGE_LOG_DAYS: 14,          // loggrader → raderas helt
  ANONYMISE_AFTER_DAYS: 365,   // i arkivet: personuppgifter rensas (överenskommet med restaurangen: 12 månader)
  MAX_ROWS_PER_RUN: 1500,      // tak per natt – resten tas nästa natt
  TIME_BUDGET_MS: 4 * 60000,   // Apps Script tillåter 6 min; vi slutar i god tid
  PERSONAL: ['Namn', 'Telefon', 'E-post', 'Kommentar', 'Meddelande'],
  ARCHIVE_EXTRA: ['Arkiverad', 'Anonymiserad']
};

/* ---------------- datum ---------------- */

function daysAgo_(n) {
  return Utilities.formatDate(new Date(Date.now() - n * 864e5), APP.TZ, 'yyyy-MM-dd');
}

/** Radens dag = det senaste av Mottagen och Hämtas datum/Datum (ISO-text jämförs som text). */
function rowDay_(row) {
  const ds = ['Mottagen', 'Hämtas datum', 'Datum'].map(k => String(row[k] || '').slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return ds.length ? ds.sort().pop() : '';
}

/* ---------------- arkivarket ---------------- */

function archiveSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ARCHIVE_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (e) { log_('WARN', 'Städning', 'Arkivarket ' + id + ' gick inte att öppna – skapar ett nytt. ' + e.message); }
  }
  const ss = SpreadsheetApp.create(SpreadsheetApp.getActive().getName() + ' – Arkiv');
  ss.setSpreadsheetTimeZone(APP.TZ);
  props.setProperty('ARCHIVE_ID', ss.getId());
  log_('INFO', 'Städning', 'Arkivark skapat: ' + ss.getUrl());
  return ss;
}

/** Arkivflik med driftarkets rubriker + spårningskolumner. Nya rubriker läggs till vid behov. */
function archiveSheet_(ss, name, headers) {
  const want = headers.concat(CLEAN.ARCHIVE_EXTRA);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.getRange(1, 1, 1, want.length).setFontWeight('bold').setBackground('#161B26').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    const first = ss.getSheets()[0];
    if (first.getName() !== name && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  } else {
    const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0];
    want.filter(h => have.indexOf(h) < 0).forEach(h => sh.getRange(1, sh.getLastColumn() + 1).setValue(h));
  }
  return sh;
}

/* ---------------- radoperationer ---------------- */

/** Raderar radnummer nedifrån och upp, intilliggande rader i ett anrop. */
function deleteRows_(sh, rowNumbers) {
  const rows = rowNumbers.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] - 1) j++;
    sh.deleteRows(rows[j], j - i + 1);
    i = j + 1;
  }
  return rows.length;
}

/** Flyttar rader till arkivet (först) och raderar dem här (sen). dry = räkna bara. */
function archiveRows_(sh, archSh, headers, rows, dry) {
  if (!rows.length) return 0;
  if (!dry) {
    const stamp = now_();
    const ah = archSh.getRange(1, 1, 1, archSh.getLastColumn()).getDisplayValues()[0];
    const values = rows.map(r => ah.map(h => h === 'Arkiverad' ? stamp : h === 'Anonymiserad' ? '' : (r[h] === undefined ? '' : r[h])));
    archSh.getRange(archSh.getLastRow() + 1, 1, values.length, ah.length).setValues(values);
    deleteRows_(sh, rows.map(r => r._row));
  }
  return rows.length;
}

/** Tar bort radens önskemål ur beställningstexten ("↳ …" kan innehålla allergier). */
function stripNotes_(text) {
  return String(text || '').split('\n').filter(l => !/^\s*↳/.test(l)).join('\n');
}
function stripJsonNotes_(json) {
  try { const a = JSON.parse(json); return JSON.stringify(a.map(l => Object.assign({}, l, { note: '' }))); }
  catch (e) { return json; }
}

function anonymiseSheet_(sh, dry) {
  if (sh.getLastRow() < 2) return 0;
  const cutoff = daysAgo_(CLEAN.ANONYMISE_AFTER_DAYS);
  const map = colMap_(sh), rows = rows_(sh);
  const todo = rows.filter(r => !r['Anonymiserad'] && rowDay_(r) && rowDay_(r) < cutoff);
  if (dry || !todo.length) return todo.length;
  const stamp = now_('yyyy-MM-dd');
  todo.forEach(r => {
    CLEAN.PERSONAL.forEach(k => { if (map[k]) sh.getRange(r._row, map[k]).setValue(k === 'Namn' ? 'Gäst' : ''); });
    if (map['Beställning']) sh.getRange(r._row, map['Beställning']).setValue(stripNotes_(r['Beställning']));
    if (map['Rader (data)']) sh.getRange(r._row, map['Rader (data)']).setValue(stripJsonNotes_(r['Rader (data)']));
    sh.getRange(r._row, map['Anonymiserad']).setValue(stamp);
  });
  return todo.length;
}

/* ---------------- själva städningen ---------------- */

/**
 * @param {boolean} dry  true = räkna bara, ändra ingenting
 * @returns {{dry, archivedOrders, archivedBookings, purgedCancelled, purgedLog, anonymised, more, ms}}
 */
function runCleanup_(dry) {
  const t0 = Date.now(), budget = () => Date.now() - t0 < CLEAN.TIME_BUDGET_MS;
  const r = { dry: !!dry, archivedOrders: 0, archivedBookings: 0, purgedCancelled: 0, purgedLog: 0, anonymised: 0, more: false, ms: 0 };
  const archiveBefore = daysAgo_(CLEAN.ARCHIVE_AFTER_DAYS), cancelBefore = daysAgo_(CLEAN.PURGE_CANCELLED_DAYS);
  let left = CLEAN.MAX_ROWS_PER_RUN;
  const take = list => { const out = list.slice(0, Math.max(0, left)); if (list.length > out.length) r.more = true; left -= out.length; return out; };
  const ss = dry ? null : archiveSS_();

  [[SHEET.ORDERS, HEADERS.ORDERS, 'archivedOrders'], [SHEET.BOOKINGS, HEADERS.BOOKINGS, 'archivedBookings']].forEach(([name, headers, key]) => {
    if (!budget()) { r.more = true; return; }
    const sh = sheet_(name);
    if (sh.getLastRow() < 2) return;
    const rows = rows_(sh);
    // 1. avbokat & gammalt → raderas helt
    const cancelled = take(rows.filter(x => x['Status'] === 'Avbokad' && rowDay_(x) && rowDay_(x) < cancelBefore));
    if (!dry) deleteRows_(sh, cancelled.map(x => x._row));
    r.purgedCancelled += cancelled.length;
    // 2. färdigt & gammalt → arkivet (läs om efter raderingen så radnumren stämmer)
    const fresh = dry ? rows : (cancelled.length ? rows_(sh) : rows);
    const old = take(fresh.filter(x => x['Status'] !== 'Avbokad' && rowDay_(x) && rowDay_(x) < archiveBefore));
    r[key] += archiveRows_(sh, dry ? null : archiveSheet_(ss, name, headers), headers, old, dry);
  });

  // 3. loggen
  if (budget()) {
    const sh = sheet_(SHEET.LOG), logBefore = daysAgo_(CLEAN.PURGE_LOG_DAYS);
    const rows = rows_(sh).filter(x => String(x['Tid'] || '').slice(0, 10) < logBefore);
    if (!dry) deleteRows_(sh, rows.map(x => x._row));
    r.purgedLog = rows.length;
  } else r.more = true;

  // 4. avidentifiera i arkivet
  if (budget()) {
    const ass = dry ? (PropertiesService.getScriptProperties().getProperty('ARCHIVE_ID') ? archiveSS_() : null) : ss;
    if (ass) [SHEET.ORDERS, SHEET.BOOKINGS].forEach(name => { const a = ass.getSheetByName(name); if (a) r.anonymised += anonymiseSheet_(a, dry); });
  } else r.more = true;

  r.ms = Date.now() - t0;
  return r;
}

function cleanupSummary_(r) {
  return (r.dry ? 'PROVKÖRNING – inget ändrat. ' : '') +
    'Arkiverat: ' + r.archivedOrders + ' beställningar, ' + r.archivedBookings + ' bokningar · ' +
    'Raderat: ' + r.purgedCancelled + ' avbokade, ' + r.purgedLog + ' loggrader · ' +
    'Avidentifierat i arkivet: ' + r.anonymised + (r.more ? ' · fler väntar till nästa natt' : '') + ' · ' + Math.round(r.ms / 1000) + ' s';
}

function cleanupEnabled_() { return prop_('CLEANUP_ENABLED') === 'on'; }

/** Nattlig trigger. Provkör tills CLEANUP_ENABLED = on. Fel mejlas, men stoppar aldrig något annat. */
function nightlyCleanup() {
  const dry = !cleanupEnabled_();
  try {
    const r = withLock_(() => runCleanup_(dry));
    log_('INFO', 'Städning', cleanupSummary_(r));
  } catch (err) {
    log_('ERROR', 'Städning', err.stack || err.message);
    mailCleanupError_(err);
  }
}

function mailCleanupError_(err) {
  try {
    const to = prop_('CLEANUP_EMAIL') || prop_('NOTIFY_EMAIL') || SpreadsheetApp.getActive().getOwner().getEmail();
    MailApp.sendEmail({ to: to, subject: APP.NAME + ' – städningen av arket misslyckades', name: APP.NAME + ' webb',
      body: 'Den nattliga städningen stannade med ett fel. Inga beställningar har tagits bort utan att först arkiveras.\n\n' +
            (err.stack || err.message) + '\n\nArket: ' + SpreadsheetApp.getActive().getUrl() });
  } catch (e) { /* utan e-post nöjer vi oss med loggen */ }
}

/* ---------------- menyval i arket ---------------- */

function cleanupDryRun() {
  const r = withLock_(() => runCleanup_(true));
  say_('Provkörning av städningen\n\n' + cleanupSummary_(r) +
    '\n\nRegler: arkivera efter ' + CLEAN.ARCHIVE_AFTER_DAYS + ' dagar, radera avbokat efter ' + CLEAN.PURGE_CANCELLED_DAYS +
    ' dagar och loggrader efter ' + CLEAN.PURGE_LOG_DAYS + ' dagar, avidentifiera arkivet efter ' + CLEAN.ANONYMISE_AFTER_DAYS + ' dagar.' +
    '\n\nNattlig städning är just nu ' + (cleanupEnabled_() ? 'PÅ' : 'AV (provkör bara)') + '.');
}

/** Städar direkt, på riktigt – för att beta av gammalt i stället för att vänta till natten. */
function cleanupNow() {
  const ui = ui_();
  if (ui) {
    const a = ui.alert('Städa nu?', 'Gamla beställningar flyttas till arkivarket och avbokade/loggrader raderas enligt reglerna. Fortsätt?', ui.ButtonSet.OK_CANCEL);
    if (a !== ui.Button.OK) return;
  }
  const r = withLock_(() => runCleanup_(false));
  log_('INFO', 'Städning (manuell)', cleanupSummary_(r));
  say_('Klart.\n\n' + cleanupSummary_(r));
}

function cleanupEnable() {
  PropertiesService.getScriptProperties().setProperty('CLEANUP_ENABLED', 'on');
  log_('INFO', 'Städning', 'Nattlig städning PÅ');
  say_('Nattlig städning är PÅ. Den körs 04:30 varje natt. Resultatet syns i fliken Logg.');
}
function cleanupDisable() {
  PropertiesService.getScriptProperties().setProperty('CLEANUP_ENABLED', 'off');
  log_('INFO', 'Städning', 'Nattlig städning AV');
  say_('Nattlig städning är AV. Den provkör bara (räknar) tills du slår på den igen.');
}
function openArchive() {
  const id = prop_('ARCHIVE_ID');
  say_(id ? 'Arkivarket: https://docs.google.com/spreadsheets/d/' + id : 'Inget arkiv ännu – det skapas första gången städningen körs på riktigt.');
}
