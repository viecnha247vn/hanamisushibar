// Anropar Google Apps Script-webbappen. URL och nyckel finns bara på servern.
import { HttpError } from "./util.js";

export async function gas(action, payload = {}, { timeout = 25000 } = {}) {
  const url = process.env.GAS_URL, secret = process.env.GAS_SECRET;
  if (!url || !secret) throw new Error("GAS_URL eller GAS_SECRET saknas i miljövariablerna.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res, text;
  try {
    // Apps Script svarar med 302 till googleusercontent.com – fetch följer den automatiskt
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, action, payload }),
      redirect: "follow",
      signal: ctrl.signal
    });
    text = await res.text();
  } catch (e) {
    throw new Error(`Apps Script svarar inte (${action}): ${e.name === "AbortError" ? "timeout" : e.message}`);
  } finally {
    clearTimeout(timer);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Apps Script gav inget JSON (${action}, HTTP ${res.status}): ${text.slice(0, 200)}`); }
  if (!data.ok) {
    if (data.status && data.status < 500 && data.status !== 401) throw new HttpError(data.status, data.error);
    throw new Error(`Apps Script-fel (${action}): ${data.error}`);
  }
  return data;
}
