# Server, rodičovský panel a propojení s telefonem a hodinkami

## Co přibylo

- **`/api/`** jsou serverové funkce na Vercelu:
  - `results`: výsledky testů z iPadu, iPhonu i hodinek a notifikace rodičům,
  - `settings`: nastavení pro telefon a hodinky,
  - `content`: lekce pro aplikace,
  - `push`: odběr notifikací,
  - `state`: stav z iPadu (morče, série, dnešní úkoly, týden, čas v aplikaci),
  - `status`: stav serveru,
  - `daily`: denní souhrn přes Vercel Cron kolem 19:00.
- **`/rodic/`** je rodičovský panel. Dá se přidat na plochu iPhonu i iPadu. Obsahuje:
  - výsledky (kdy, jak dlouho, jak dopadl, chyby),
  - aktivitu (naposledy v Parťákovi, čas v aplikaci po dnech, dnešní úkoly, série) a týdenní přehled,
  - morče (jak se má, úroveň, mince, zásoby, odznaky, cíl),
  - nastavení hodinek a telefonu,
  - notifikace,
  - QR kód pro spárování aplikace v iPhonu.
- **Parťák na iPadu** (verze 68) posílá po každém testu výsledek na server. Když je offline, výsledek počká ve frontě. V Nastavení přibyla sekce *Rodičovský přehled, telefon a hodinky*.

## Nastavení na Vercelu (jednorázově, bez terminálu)

1. **Databáze:** Vercel → projekt *chrisschool* → **Storage** → **Create Database** → **Upstash for Redis** (zdarma) → připojit k projektu. Proměnné `KV_REST_API_URL` a `KV_REST_API_TOKEN` se doplní samy.
2. **Proměnné:** Settings → **Environment Variables**, přidat (Production i Preview):
   - `PARTAK_KEY`: kód rodiny, který se zadává na iPadu, v panelu a v aplikaci,
   - `VAPID_PUBLIC_KEY` a `VAPID_PRIVATE_KEY`: klíče pro notifikace,
   - `VAPID_SUBJECT`: `mailto:jirka.heller@gmail.com`,
   - volitelně `CRON_SECRET`: libovolný dlouhý text, chrání denní souhrn.
3. **Redeploy:** Deployments → poslední → **Redeploy**, aby se proměnné načetly.

Tajné hodnoty nikdy nepatří do repozitáře, protože je veřejný.

## Zprovoznění

1. iPad → Parťák → Nastavení → *Rodičovský přehled…* → zadat kód rodiny → **Propojit**.
2. iPhone (rodič) → Safari → `…/rodic/` → přihlásit kódem → **Sdílet → Přidat na plochu**. Otevřít z plochy → **Oznámení → Zapnout oznámení** → **Poslat zkušební**.
3. Volitelně totéž na iPadu, pokud chceš panel i tam.

## Formát výsledku (pro aplikaci v iPhonu a hodinkách)

`POST /api/results`, hlavička `Authorization: Bearer <PARTAK_KEY>`

```json
{ "id": "unikatni-id", "source": "watch", "kind": "quiz", "subject": "ma", "lessonId": null,
  "title": "Násobilka 7", "startedAt": "2026-11-27T15:00:00Z", "finishedAt": "2026-11-27T15:03:12Z",
  "durationSec": 192, "total": 10, "correct": 8, "points": 12,
  "mistakes": [ { "q": "7 · 8 =", "given": "54", "correct": "56", "e": "", "sec": 9 } ] }
```

Lze poslat i dávku `{ "results": [ … ] }`. Stejné `id` se uloží jen jednou, takže opakované odeslání nevadí.
