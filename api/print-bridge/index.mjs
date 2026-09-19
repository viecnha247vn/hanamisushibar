#!/usr/bin/env node
// Hanami skrivarbrygga: hämtar nya beställningar från webbplatsen och skriver ut dem på kvittoskrivaren.
// Körs på en liten dator i köket (Raspberry Pi, kassadatorn …). Inga beroenden utöver Node 20.
//
//   node index.mjs            starta
//   node index.mjs --test     skriv ut ett testkvitto och avsluta
//
// Inställningar i config.json (se config.example.json).

import fs from "node:fs";
import net from "node:net";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orderReceipt, testReceipt } from "./receipt.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = process.env.HANAMI_CONFIG || path.join(dir, "config.json");
if (!fs.existsSync(cfgPath)) { console.error(`Saknar ${cfgPath}. Kopiera config.example.json → config.json och fyll i.`); process.exit(1); }
const cfg = { pollMs: 5000, width: 48, copies: 1, name: "HANAMI SUSHI BAR", site: "hanamisushibar.se", phone: "0431-472999", ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) };
for (const k of ["apiUrl", "printKey", "printer"]) if (!cfg[k]) { console.error(`config.json saknar "${k}".`); process.exit(1); }

const log = (...a) => console.log(new Date().toLocaleTimeString("sv-SE"), ...a);

/* ---------- skrivare ---------- */
// printer: "tcp:192.168.1.50:9100" | "usb:/dev/usb/lp0" | "file:\\\\DATOR\\EpsonTM" | "cups:EpsonTM"
async function printBytes(bytes) {
  const [type, ...rest] = cfg.printer.split(":"), target = rest.join(":");
  if (type === "tcp") {
    const [host, port = "9100"] = target.split(":");
    await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port: Number(port), timeout: 8000 });
      sock.once("connect", () => sock.end(bytes));
      sock.once("close", resolve);
      sock.once("timeout", () => { sock.destroy(); reject(new Error("timeout mot " + host)); });
      sock.once("error", reject);
    });
  } else if (type === "usb" || type === "file") {
    fs.writeFileSync(target, bytes);
  } else if (type === "cups") {
    const tmp = path.join(dir, `.job-${Date.now()}.bin`);
    fs.writeFileSync(tmp, bytes);
    try { await new Promise((res, rej) => execFile("lp", ["-d", target, "-o", "raw", tmp], e => (e ? rej(e) : res()))); }
    finally { fs.unlinkSync(tmp); }
  } else throw new Error("Okänd skrivartyp: " + type);
}

/* ---------- API ---------- */
async function api(method, body) {
  const res = await fetch(cfg.apiUrl.replace(/\/$/, "") + "/api/print", {
    method, headers: { "x-print-key": cfg.printKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { log("FEL: fel PRINT_KEY. Stoppar."); process.exit(1); }
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------- loop ---------- */
let backoff = cfg.pollMs, printerDown = false;
async function tick() {
  try {
    const { jobs } = await api("GET");
    for (const job of jobs) {
      const bytes = orderReceipt(job, cfg);
      for (let i = 0; i < cfg.copies; i++) await printBytes(bytes);
      await api("POST", { no: job.no });
      log(`Utskrivet ${job.no} (${job.kind === "table" ? "bord " + job.table : "hämtning " + job.pickupTime}) ${job.total} kr`);
      if (printerDown) { printerDown = false; }
    }
    backoff = cfg.pollMs;
  } catch (e) {
    const isPrinter = /timeout|ECONN|EHOSTUNREACH|ENOENT|EACCES|lp:/.test(e.message);
    if (isPrinter && !printerDown) { printerDown = true; log("SKRIVAREN NÅS INTE:", e.message, "– försöker igen"); }
    else if (!isPrinter) log("Fel:", e.message);
    backoff = Math.min(backoff * 2, 60000);
  }
  setTimeout(tick, backoff);
}

if (process.argv.includes("--test")) {
  printBytes(testReceipt(cfg)).then(() => { log("Testkvitto skickat till", cfg.printer); }, e => { log("Kunde inte skriva ut:", e.message); process.exit(1); });
} else {
  log(`Hanami skrivarbrygga startad → ${cfg.printer}, hämtar från ${cfg.apiUrl} var ${cfg.pollMs / 1000}:e sekund`);
  printBytes(testReceipt(cfg)).catch(e => log("OBS: kunde inte skriva testkvitto:", e.message));
  tick();
}
