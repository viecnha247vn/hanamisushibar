// Enkel simulering av Google Apps Script (Sheets, Mail, UrlFetch …) för tester utan Google-konto.
const fs = require("fs"), vm = require("vm"), crypto = require("crypto");
function makeEnv() {
  const log = { mails: [], sms: [], hooks: [], alerts: [], toasts: [], triggers: [] };
  const chain = () => new Proxy(function () {}, { get: (t, k) => k === "build" ? () => ({}) : () => chain(), apply: () => chain() });
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; }
    getName() { return this.name; }
    getLastRow() { let n = this.data.length; while (n && this.data[n - 1].every(v => v === "" || v == null)) n--; return n; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => { let n = r.length; while (n && (r[n-1] === "" || r[n-1] == null)) n--; return n; })); }
    getMaxRows() { return this.maxRows; }
    cell(r, c) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(""); return row; }
    insertRowAfter(r) { this.data.splice(r, 0, []); return this; }
    appendRow(vals) { this.data.splice(this.getLastRow(), 0, vals.slice()); }
    deleteRows(start, n) { this.data.splice(start - 1, n); }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  }
  ["setFrozenRows","setRowHeight","setColumnWidth","hideColumns","setConditionalFormatRules"].forEach(m => Sheet.prototype[m] = function () { return this; });
  const disp = v => v === true ? "SANT" : v === false ? "FALSKT" : v == null ? "" : String(v);
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const d = this.sh.data[this.r - 1 + i]; row.push(d && d[this.c - 1 + j] !== undefined ? d[this.c - 1 + j] : ""); } out.push(row); } return out; }
    getDisplayValues() { return this.getValues().map(r => r.map(disp)); }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { this.sh.cell(this.r + i, this.c + j)[this.c + j - 1] = x; })); return this; }
    setValue(x) { this.sh.cell(this.r, this.c)[this.c - 1] = x; return this; }
    insertCheckboxes() { for (let i = 0; i < this.nr; i++) { const row = this.sh.cell(this.r + i, this.c); if (row[this.c - 1] === "" ) row[this.c - 1] = false; } return this; }
    uncheck() { for (let i = 0; i < this.nr; i++) this.sh.cell(this.r + i, this.c)[this.c - 1] = false; return this; }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    getNumRows() { return this.nr; }
    getSheet() { return this.sh; }
    getA1Notation() { return String.fromCharCode(64 + this.c) + this.r; }
    createTextFinder(text) { const self = this; return { matchEntireCell() { return this; }, findNext() {
      const v = self.getDisplayValues(); for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) if (v[i][j] === text) return new Range(self.sh, self.r + i, self.c + j); return null; } }; }
  }
  ["copyTo","setFontWeight","setBackground","setFontColor","setVerticalAlignment","setNumberFormat","setWrap","setDataValidation"].forEach(m => Range.prototype[m] = function () { return this; });
  const sheets = {};
  const ss = {
    getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets),
    deleteSheet: sh => delete sheets[sh.name], setActiveSheet() {}, getUrl: () => "https://docs.google.com/spreadsheets/d/TEST", getName: () => "Hanami – Drift",
    setSpreadsheetTimeZone() {}, toast: (m) => log.toasts.push(m)
  };
  sheets["Blad1"] = new Sheet("Blad1");
  const ui = { alert: m => log.alerts.push(m), createMenu: () => chain() };
  const props = {};
  const cache = {};
  const tzFmt = (d, tz, f) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
    return f.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour).replace("mm", p.minute).replace("ss", p.second);
  };
  const ctx = {
    console, JSON, Math, Date, Number, String, Object, Array, Error, RegExp,
    SpreadsheetApp: { CopyPasteType: { PASTE_FORMAT: 1, PASTE_DATA_VALIDATION: 2 }, getActive: () => ss, getUi: () => ui, newDataValidation: chain, newConditionalFormatRule: chain },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: tzFmt, getUuid: () => crypto.randomUUID(), base64Encode: x => Buffer.from(Array.isArray(x) ? Buffer.from(x) : String(x)).toString("base64"),
      computeDigest: (alg, s) => [...crypto.createHash("sha256").update(s).digest()], DigestAlgorithm: { SHA_256: 1 } },
    MailApp: { sendEmail: o => log.mails.push(o) },
    UrlFetchApp: { fetch: (url, o) => { (url.includes("46elks") ? log.sms : log.hooks).push({ url, ...o }); return { getResponseCode: () => 200, getContentText: () => "{}" }; } },
    ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: n => { log.triggers.push(n); return chain(); }, getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }) },
  };
  vm.createContext(ctx);
  const dir = process.env.GAS_DIR || require("path").join(__dirname, "..", "apps-script");
  const code = fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort((a, b) => (a === "Config.js" ? -1 : b === "Config.js" ? 1 : a.localeCompare(b)))
    .map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n;\n");
  vm.runInContext(code + "\n;this.__api={doPost,setup,handleEdit,resetSoldOut,publishSite,testOrder,showSecret,onOpen};", ctx);
  const call = (action, payload, secret = props.API_SECRET) => JSON.parse(ctx.__api.doPost({ postData: { contents: JSON.stringify({ secret, action, payload }) } }).text);
  return { ctx, api: ctx.__api, call, sheets, props, log };
}
module.exports = { makeEnv };
