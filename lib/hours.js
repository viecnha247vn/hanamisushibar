// Öppet just nu (svensk tid)? Används för att låta skrivaren och skärmarna vila när restaurangen är stängd.
import S from "../data/settings.js";

/** true om klockan är inom öppettiden idag, från `before` min före öppning till `after` min efter stängning.
 *  Stängda dagar (null, closedDates) = false. Standard: 2 h före (ägaren 2026-10-28 "đọc đơn sớm hơn"), 1 h efter. */
export const BEFORE_MIN = 120, AFTER_MIN = 60;
export function openNow(before = BEFORE_MIN, after = AFTER_MIN, now = new Date()) {
  const force = typeof process !== "undefined" ? process.env.HOURS_FORCE : "";   // tester: "open" | "closed"
  if (force === "open") return true;
  if (force === "closed") return false;
  const p = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: S.timezone || "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    .formatToParts(now).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  if ((S.closedDates || []).includes(date)) return false;
  const wd = { sön: 0, mån: 1, tis: 2, ons: 3, tors: 4, fre: 5, lör: 6 }[String(p.weekday).replace(".", "")];
  const h = S.hours?.[wd];
  if (!h) return false;
  const min = Number(p.hour) * 60 + Number(p.minute);
  return min >= h[0] * 60 - before && min < h[1] * 60 + after;
}
