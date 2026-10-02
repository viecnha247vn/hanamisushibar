# Hanami Sushi Bar – hanamisushibar.se

Webbplats med meny, beställning för hämtning, beställning från bordet (QR) och bordsbokning.
Design: samma system som Vietfood (QDesign) – vitt, körsbärsrosa och koi-blått med guld för typografi. Playfair Display + Jost.

- `/` startsida · `/meny` meny och varukorg · `/kok` köksvy

```
 Gäst / Kök (webbläsare)
        │
        ▼
 Vercel ─ statisk sida (dist/) + API (api/*.js)      ← GitHub: main
        │  GAS_URL + GAS_SECRET (bara på servern)
        ▼
 Google Apps Script ─ webbapp (apps-script/*.js)     ← GitHub Action (clasp)
        │
        ▼
 Google Sheet ─ Beställningar · Bokningar · Meny · Logg
        │
        ├─ MailApp → restaurangens e-post
        ├─ 46elks  → sms till gästen
        ├─ Epson TM-T88VII (Server Direct Print) ← /api/sdp/<nyckel> (ingen dator behövs)
        ├─ Star CloudPRNT-skrivare ← /api/cloudprnt/<nyckel>
        └─ print-bridge/ (dator i köket) → valfri ESC/POS-skrivare, t.ex. Epson TM-T20III
```

| Kommando | |
|---|---|
| `npm test` | testar Apps Script-koden mot simulerat Sheet |
| `npm run build` | bygger `dist/` (menyn hämtas från arket) |
| `npm run gas:push` | skickar `apps-script/` till Google |
| `npm run gas:deploy` | push + uppdatera webbappen (`GAS_DEPLOYMENT_ID`) |

- `/kok` – köksvyn (lösenord = `ADMIN_KEY`)
- `/api/health` – kontroll av hela kedjan

Installation: [HUONG-DAN.md](HUONG-DAN.md)
