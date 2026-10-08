// Hämtningstid för beställningar dygnet runt.
//   Öppet och köket hinner före stängning → idag, max(nu, öppning) + förberedelsetid.
//   Annars (stängt, efter stängning, eller för sent för köket) → nästa öppna dag, öppning + förberedelsetid.
// Samma regel finns i webbläsaren (src/meny.html, pickupInfo) och i Apps Script (Orders.js, createOrder_).
import settings from "../data/settings.js";
import { nowLocal, addDays, hoursFor } from "./util.js";

const ceil5 = m => Math.ceil(m / 5) * 5;

/** → { date, minutes, base, openFrom, closeAt, later } eller null om inget öppet de närmaste 14 dagarna. */
export function pickupSlot(now = nowLocal(), lead = settings.pickupLeadMinutes) {
  const h = hoursFor(now.date);
  if (h) {
    const openFrom = h[0] * 60, closeAt = h[1] * 60;
    if (now.minutes < closeAt) {
      const base = Math.max(now.minutes, openFrom), minutes = ceil5(base + lead);
      if (minutes <= closeAt) return { date: now.date, minutes, base, openFrom, closeAt, later: false };
    }
  }
  for (let i = 1; i <= 14; i++) {
    const date = addDays(now.date, i), hh = hoursFor(date);
    if (!hh) continue;
    const openFrom = hh[0] * 60, closeAt = hh[1] * 60;
    return { date, minutes: Math.min(ceil5(openFrom + lead), closeAt), base: openFrom, openFrom, closeAt, later: true };
  }
  return null;
}
