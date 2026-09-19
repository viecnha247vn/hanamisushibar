/** Installation och meny i kalkylarket. */

/** Dialogrutor fungerar bara när skriptet körs från kalkylarket. Körs det från editorn loggar vi i stället. */
function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
function say_(message) {
  const ui = ui_();
  if (ui) ui.alert(message); else console.log(message);
}

function onOpen() {
  const ui = ui_(); if (!ui) return;
  ui.createMenu('Hanami')
    .addItem('Publicera webbplatsen', 'publishSite')
    .addSeparator()
    .addItem('Nollställ "Slut idag"', 'resetSoldOut')
    .addItem('Visa API-nyckel för Vercel', 'showSecret')
    .addItem('Skicka testbeställning', 'testOrder')
    .addSeparator()
    .addItem('Installera / reparera', 'setup')
    .addToUi();
}

/** Kör en gång. Säker att köra igen – skriver aldrig över data. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(APP.TZ);

  const orders = ensureSheet_(SHEET.ORDERS, HEADERS.ORDERS, { 'Beställning': 260, 'Kommentar': 220, 'Rader (data)': 80 });
  const bookings = ensureSheet_(SHEET.BOOKINGS, HEADERS.BOOKINGS, { 'Meddelande': 260 });
  const menu = ensureSheet_(SHEET.MENU, HEADERS.MENU, { 'Kategori': 170, 'Kategoritext': 220, 'Namn': 220, 'Beskrivning': 420 });
  ensureSheet_(SHEET.LOG, HEADERS.LOG, { 'Detaljer': 500 });

  // Text-format så att datum, tider och +46-nummer inte tolkas om av Sheets
  textColumns_(orders, ['Mottagen', 'Ordernr', 'Bord', 'Hämtas datum', 'Hämtas tid', 'Telefon', 'Sms klar', 'Utskriven']);
  textColumns_(bookings, ['Mottagen', 'Boknr', 'Datum', 'Tid', 'Telefon', 'Sms bekräftad']);
  textColumns_(menu, ['Kategori-id', 'Id']);
  orders.getRange(2, colMap_(orders)['Summa'], orders.getMaxRows() - 1).setNumberFormat('#,##0" kr"');
  menu.getRange(2, colMap_(menu)['Pris'], menu.getMaxRows() - 1).setNumberFormat('0" kr"');
  orders.getRange(2, colMap_(orders)['Beställning'], orders.getMaxRows() - 1).setWrap(true);
  orders.hideColumns(colMap_(orders)['Rader (data)']);

  statusRules_(orders, ORDER_STATUS, STATUS_COLORS.ORDERS);
  statusRules_(bookings, BOOKING_STATUS, STATUS_COLORS.BOOKINGS);

  // Meny: fyll på första gången
  if (menu.getLastRow() < 2) {
    menu.getRange(2, 1, MENU_SEED.length, MENU_SEED[0].length).setValues(MENU_SEED);
  }
  const mc = colMap_(menu);
  const n = Math.max(menu.getLastRow() - 1, 1);
  menu.getRange(2, mc['Visas på webben'], n).insertCheckboxes();
  menu.getRange(2, mc['Slut idag'], n).insertCheckboxes();
  menu.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$A2<>""').setBackground('#EEF3F8').setBold(true)
      .setRanges([menu.getRange(2, 1, menu.getMaxRows() - 1, HEADERS.MENU.length)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$I2=TRUE').setFontColor('#B6493E')
      .setRanges([menu.getRange(2, 1, menu.getMaxRows() - 1, HEADERS.MENU.length)]).build()
  ]);
  menu.getRange(2, mc['Pris'], menu.getMaxRows() - 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 10000).setAllowInvalid(false).setHelpText('Pris i hela kronor').build());

  // Ta bort tomt standardblad
  ['Blad1', 'Sheet1', 'Trang tính1'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(orders);

  // Triggers
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['handleEdit', 'resetSoldOut'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('resetSoldOut').timeBased().atHour(4).everyDays(1).inTimezone(APP.TZ).create();

  // Hemlig nyckel
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_SECRET')) props.setProperty('API_SECRET', Utilities.getUuid() + Utilities.getUuid().slice(0, 8));
  if (!props.getProperty('SEQ_H')) props.setProperty('SEQ_H', '1000');
  if (!props.getProperty('SEQ_B')) props.setProperty('SEQ_B', '1000');
  clearMenuCache_();
  log_('INFO', 'Setup', 'Klar');

  const missing = ['NOTIFY_EMAIL', 'SITE_URL', 'VERCEL_DEPLOY_HOOK'].filter(k => !props.getProperty(k));
  say_('Installationen är klar ✅\n\n' +
    'Nästa steg:\n1. Distribuera → Ny distribution → Webbapp (Kör som: Jag, Åtkomst: Alla)\n' +
    '2. Hanami → Visa API-nyckel för Vercel\n' +
    (missing.length ? '\nSaknade skriptegenskaper: ' + missing.join(', ') : ''));
}

function ensureSheet_(name, headers, widths) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // lägg till nya kolumner om koden fått fler rubriker
    const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    headers.filter(h => have.indexOf(h) < 0).forEach(h => sh.getRange(1, sh.getLastColumn() + 1).setValue(h));
  }
  const width = sh.getLastColumn();
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#161B26').setFontColor('#FFFFFF').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 32);
  const map = colMap_(sh);
  headers.forEach(h => sh.setColumnWidth(map[h], (widths && widths[h]) || 120));
  return sh;
}

function textColumns_(sh, names) {
  const map = colMap_(sh);
  names.forEach(n => sh.getRange(2, map[n], sh.getMaxRows() - 1).setNumberFormat('@'));
}

function statusRules_(sh, values, colors) {
  const c = colMap_(sh)['Status'];
  const letter = sh.getRange(1, c).getA1Notation().replace(/\d/g, '');
  sh.getRange(2, c, sh.getMaxRows() - 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build());
  const range = sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getLastColumn());
  sh.setConditionalFormatRules(Object.keys(colors).map(v =>
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + letter + '2="' + v + '"')
      .setBackground(colors[v]).setRanges([range]).build()));
}

function showSecret() {
  const s = prop_('API_SECRET');
  const url = ScriptApp.getService().getUrl();
  say_(
    'Lägg in i Vercel → Settings → Environment Variables:\n\n' +
    'GAS_SECRET = ' + (s || '(kör setup först)') + '\n\n' +
    'GAS_URL = ' + (url || '(distribuera som webbapp först)') + '\n\n' +
    'Dela aldrig nyckeln med någon annan.');
}

/** Skapar en testbeställning och en testbokning (utan sms). */
function testOrder() {
  const first = readMenuRows_().filter(i => i.visible && i.price > 0 && i.categoryId !== 'lunch' && i.categoryId !== 'happy')[0];
  const today = now_('yyyy-MM-dd');
  const r = withLock_(() => createOrder_({ kind: 'pickup', name: 'TEST – radera', phone: '', pickupDate: today, pickupTime: '18:00',
    whenText: 'idag kl 18:00', payment: 'swish', message: 'Testbeställning', items: [{ id: first.id, qty: 2 }] }));
  SpreadsheetApp.getActive().toast('Testbeställning ' + r.no + ' skapad (' + r.total + ' kr). Kolla din e-post.', 'Hanami', 8);
}
