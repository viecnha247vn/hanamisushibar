// Hämtningstid för beställningar dygnet runt.
//   Före öppning idag → idag kl öppning (köket förbereder), men aldrig tidigare än nu + förberedelsetid.
//   Öppet, till och med stängningsminuten → idag, nu + förberedelsetid (får bli efter stängning, t.ex. 20.00 → 20.15).
//   Efter stängning eller stängd dag → nästa öppna dag kl öppning.
// Samma regel finns i webbläsaren (src/meny.html, pickupInfo) och i Apps Script (Orders.js, createOrder_).
import settings from "../data/settings.js";
import { nowLocal, addDays, hoursFor } from "./util.js";

const ceil5 = m => Math.ceil(m / 5) * 5;

/** → { date, minutes, base, openFrom, closeAt, later } eller null om inget öppet de närmaste 14 dagarna. */
export function pickupSlot(now = nowLocal(), lead = settings.pickupLeadMinutes) {
  const h = hoursFor(now.date);
  if (h) {
    const openFrom = h[0] * 60, closeAt = h[1] * 60;
    if (now.minutes <= closeAt) {
      const base = Math.max(now.minutes, openFrom), minutes = Math.max(openFrom, ceil5(now.minutes + lead));
      return { date: now.date, minutes, base, openFrom, closeAt, later: false };
    }
  }
  for (let i = 1; i <= 14; i++) {
    const date = addDays(now.date, i), hh = hoursFor(date);
    if (!hh) continue;
    const openFrom = hh[0] * 60, closeAt = hh[1] * 60;
    return { date, minutes: openFrom, base: openFrom, openFrom, closeAt, later: true };
  }
  return null;
}

/**
 * "Hämta senare": gästen väljer dag och skriver valfri tid (5-minuterssteg) mellan tidigast möjligt och stängning,
 * idag och de närmaste dagarna (settings.pickupDaysAhead). → [{ date, min, max }] (minuter efter midnatt)
 * Samma regel i webbläsaren (src/meny.html, laterSlots). lead = 0 vid kontrollen på servern: köksvyns aktuella
 * förberedelsetid kontrolleras av Apps Script (createOrder_), som känner till den.
 */
export function laterSlots(now = nowLocal(), lead = settings.pickupLeadMinutes) {
  const out = [];
  for (let i = 0; i <= (settings.pickupDaysAhead ?? 3); i++) {
    const date = addDays(now.date, i), h = hoursFor(date);
    if (!h) continue;
    const open = h[0] * 60, close = h[1] * 60;
    const min = i === 0 ? Math.max(open, now.minutes + lead) : open;
    if (min <= close) out.push({ date, min, max: close });
  }
  return out;
}

/** Kontrollerar gästens val av senare hämtningstid → { date, time } eller null om tiden inte går. */
export function pickLaterSlot(date, time, now = nowLocal()) {
  const day = laterSlots(now, 0).find(d => d.date === date), m = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!day || !m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= day.min && min <= day.max && Number(m[2]) < 60 ? { date, time } : null;
}

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
