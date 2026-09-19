/** Hjälpfunktioner för arket. Alla värden läses som visad text (getDisplayValues) för att slippa datumkonvertering. */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new ApiError(500, 'Fliken "' + name + '" saknas. Kör setup().');
  return sh;
}

/** Kolumnindex (1-baserat) utifrån rubrik. */
function colMap_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const map = {};
  head.forEach((h, i) => { map[h] = i + 1; });
  return map;
}

/** Läser rader som objekt { rubrik: värde, _row }. limit = bara de sista N raderna. */
function rows_(sh, limit) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = limit ? Math.max(2, last - limit + 1) : 2;
  const width = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0];
  return sh.getRange(start, 1, last - start + 1, width).getDisplayValues().map((r, i) => {
    const o = { _row: start + i };
    head.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
}

function findRow_(sh, colName, value) {
  const c = colMap_(sh)[colName];
  const cell = sh.getRange(2, c, Math.max(1, sh.getLastRow() - 1), 1)
    .createTextFinder(String(value)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function appendObject_(sh, obj) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  sh.appendRow(head.map(h => (obj[h] === undefined ? '' : obj[h])));
  const r = sh.getLastRow();
  sh.getRange(r, 1, 1, head.length).setVerticalAlignment('top');
  return r;
}

function nextNumber_(prefix) {
  const props = PropertiesService.getScriptProperties();
  const key = 'SEQ_' + prefix;
  const n = Number(props.getProperty(key) || 1000) + 1;
  props.setProperty(key, String(n));
  return prefix + n;
}

const pretty_ = phone => String(phone || '').replace(/^\+46/, '0');
