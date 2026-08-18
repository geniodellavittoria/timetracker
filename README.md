# ⏱ Zeiterfassung

Eine persönliche Arbeitszeiterfassung. Kommen, Pausenminuten und Gehen eintragen — daraus werden
die Arbeitsstunden berechnet, pro Tag summiert und als laufender Überstundensaldo gegen ein pro
Wochentag konfigurierbares Ziel geführt.

Einzelbenutzer, keine Konten. Läuft kostenlos auf Cloudflare Workers mit einer D1-Datenbank.

## Was die App macht

- **Eine Zeile pro Tag**: Kommen, Pausenminuten, Gehen → Arbeitsstunden, live beim Tippen berechnet.
- **Ziele pro Wochentag**, mit einem Pensum-Panel — "42-Std-Woche, 80 %, Freitag frei" eingeben
  und die Verteilung überlassen.
- **Freie Tage überall in der Woche.** Ein Ziel von 0 *ist* ein freier Tag — Wochenenden sind
  nicht speziell, ein freier Tag mitten in der Woche funktioniert genau gleich. Stunden, die an
  einem freien Tag trotzdem gearbeitet werden, zählen als reine Überzeit.
- **Ferien-, Krankheits- und Feiertage**, die als das Ziel des jeweiligen Wochentags zählen und
  so weder Überzeit erzeugen noch kosten.
- **Wochen- und Monatsansicht** mit Wochen-Buckets und einem kumulierten Saldo im Header.
- **Nicht erfasste Tage werden markiert, nicht bestraft.** Ein nie erfasster Arbeitstag drückt den
  Saldo nicht nach unten; er erscheint stattdessen als "⚠ N nicht erfasste Arbeitstage".

## Erste Schritte

```bash
npm install
npx wrangler login
npx wrangler d1 create timetracker     # die ausgegebene database_id in wrangler.jsonc einfügen
npm run db:local                       # lokale Entwicklungsdatenbank anlegen
npm run dev                            # http://localhost:5173
```

`npm run dev` startet den Worker in Cloudflares echter Runtime *und* den React-Client mit Hot
Reload, auf einem Origin — so entspricht das lokale Verhalten der Produktion.

### Deployen

```bash
npm run db:remote                      # Migrationen auf die Produktionsdatenbank anwenden
npx wrangler secret put APP_PASSWORD   # Passwort setzen (siehe unten)
npm run deploy                         # → https://timetracker.<your-subdomain>.workers.dev
```

Cloudflares Free Tier reicht dafür bequem: 100k Worker-Requests/Tag, und D1 gibt 5 GB mit
5 Mio. Row Reads und 100k Row Writes pro Tag. Eine einzelne Person, die jeden Arbeitstag im
Jahr erfasst, erzeugt ein paar hundert Zeilen.

**[docs/DEPLOY.md](docs/DEPLOY.md)** enthält das vollständige Runbook — eine Checkliste zur
Verifikation des laufenden Deployments und eine Tabelle, was bei einem fehlgeschlagenen Schritt
zu tun ist.

### Passwortschutz

Die deployte URL ist öffentlich, daher `APP_PASSWORD` als Worker-Secret setzen. Die ganze App
liegt dann hinter HTTP Basic Auth — UI wie API — mit dem Benutzernamen `me`.

Lokal ist die Sperre aus, ausser eine `.dev.vars`-Datei wird angelegt (siehe
`.dev.vars.example`), damit die Entwicklung reibungslos bleibt.

## Scripts

| Befehl | Was er macht |
|---|---|
| `npm run dev` | Worker + Client mit Hot Reload auf http://localhost:5173 |
| `npm test` | Volle Suite: Berechnungen, API und UI-Komponenten |
| `npm run test:tz` | Dieselbe Suite unter `TZ=Europe/Zurich` — siehe unten |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run deploy` | Build und Deploy auf Cloudflare |
| `npm run db:local` / `db:remote` | Migrationen anwenden |

## Wie es aufgebaut ist

```
src/shared/   Reiner Berechnungscode — von Client UND Worker importiert
src/worker/   Hono-API auf der Workers-Runtime, D1 als Storage
src/client/   React 19 + Vite
migrations/   D1-Schema, von wrangler angewendet
```

`src/shared/` ist der wichtige Teil. Dieselben Funktionen `workedMinutesFor` und
`buildRangeSummary` laufen im Browser für die Live-Vorschau und im Worker als Autorität — die
Zahl, die beim Tippen erscheint, ist dadurch per Konstruktion dieselbe, die gespeichert wird.

Drei Schichten setzen dieselben Regeln durch — die gemeinsamen Validatoren im Client, dieselben
Validatoren im Worker, und `CHECK`-Constraints in SQL. Das ist Absicht: Der Datenbank-Constraint
ist die Schicht, die auch bei einem Bug in den anderen beiden noch greift.

### Zwei Dinge, die man wissen sollte

**Ziele werden nicht versioniert.** Eine Änderung eines Wochentagziels berechnet jeden
vergangenen Saldo neu, nicht nur zukünftige. Für den persönlichen Gebrauch unproblematisch —
aber gut zu wissen, bevor man Ziele mitten im Jahr ändert.

**Nachtschichten werden nicht unterstützt.** Eine Gehen-Zeit, die vor oder gleich der
Kommen-Zeit liegt, wird abgelehnt — in der UI, der API und der Datenbank. Das schliesst auch
`00:00` als Gehen-Zeit aus.

### Zeit und Zeitzonen

Zeiten werden als ganzzahlige Minuten seit Mitternacht gespeichert, und die gesamte Arithmetik
bleibt in ganzen Minuten — Dezimalstellen tauchen nur in Formatierern auf, damit Summen nicht
driften können. Jeder Datums-Helper arbeitet intern mit UTC; der Browser schickt sein eigenes
lokales `today` an den Summary-Endpoint, weil Workers in UTC laufen und sonst einen Eintrag um
01:00 Uhr in Zürich als "morgen" einstufen würden.

`npm run test:tz` existiert aus diesem Grund. Der DST-Test in `test/shared/dates.test.ts` läuft
unter UTC trivial durch und zeigt seine Wirkung erst in einer Zeitzone mit Sommerzeit.

## Backups

```bash
npx wrangler d1 export timetracker --remote --output backup.sql
```
