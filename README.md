# Ledger — time tracking & billing reports

A private, single-user app for logging freelance hours, managing clients and
projects at different hourly rates, and sending clean time reports (PDF,
Excel, CSV).

## Features

- **Fast manual entry.** Durations as `1:30`, `1h 30m`, `90m` or `1.5`. Optional
  start/end times (enter both and the duration fills in; enter a start and a
  duration and the end fills in). The effective rate and billable total show
  before you save. "Add another" keeps the client and project.
- **Rate hierarchy.** Global default → client rate → project override. The
  effective rate is saved on every entry, so changing a rate later never
  changes past entries or reports. Any single entry's rate can be adjusted.
- **Timer.** Start, pause, resume, stop and save, or discard. State is kept in
  the database with server timestamps, so it survives refreshes and
  navigation. A timer that was never paused records exact start/end times.
- **Billing status.** Entries are uninvoiced until you mark them invoiced
  (individually or in bulk, with an optional invoice number). Generating or
  downloading a report never changes status.
- **Reports.** Filter by client, project, date preset or custom range, and
  billing status; preview totals and a per-project breakdown; download as
  PDF, Excel or CSV, named
  `Client Name_Time_Report_MM.DD.YY_MM.DD.YY_Lee.ext`. Optional "Worked"
  column with start/end times.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 ·
SQLite via Drizzle ORM and libSQL · Zod · react-pdf · ExcelJS · Vitest.

Locally the database is a single SQLite file. In production it is
[Turso](https://turso.tech) (hosted SQLite; the free plan is plenty for this
app), so it runs on Vercel or anywhere else without a disk.

## Setup

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # paste as AUTH_SECRET
npm run hash-password -- "choose a strong password"   # paste the printed line
```

Then:

```bash
npm run dev            # http://localhost:3000
```

The database (`data/app.db` by default) and its tables are created
automatically on first start. Open **Settings** to enter your business
details, default rate and timezone.

## Production (Vercel + Turso)

1. Create a Turso database: in Vercel, open the project → **Storage** →
   add **Turso**, or create one at turso.tech and copy its URL and token.
2. Set the project's environment variables: `AUTH_SECRET`, `APP_PASSWORD_HASH`
   (or `APP_PASSWORD`), and `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (added
   automatically by the integration).
3. Deploy. Tables are created automatically on first request; there is nothing
   to run by hand.

Other hosts work too: `npm run build && npm start` with the same variables.
Session cookies are marked `Secure` in production, so use HTTPS.

**Backups:** Turso keeps point-in-time backups on its paid plans; on any plan you
can export with `turso db shell <db> .dump > backup.sql`. Locally, copy
`data/app.db` while the app is stopped.

## Billing math

- Durations are stored as integer minutes; money as integer cents.
- Entry amount = minutes ÷ 60 × hourly rate, **rounded half-up to the cent once,
  when the entry is saved**.
- Report and dashboard totals are sums of those stored line amounts, so totals
  always match the line items exactly, across any mix of rates.
- Work dates are stored as plain calendar dates (`YYYY-MM-DD`) and never pass
  through UTC; "today", date presets and timer times use the timezone in
  Settings.

## Development

```bash
npm test               # unit + database + export tests
npm run lint           # type-check
npm run db:generate    # after editing src/db/schema.ts, creates a migration
```

| Path | What's there |
| --- | --- |
| `src/lib/` | Pure logic: money, durations/times, dates, rates, filenames, CSV, report totals |
| `src/db/` | Drizzle schema (with check constraints) and connection; migrations in `drizzle/` |
| `src/server/` | Data access (clients, projects, entries, timer, reports, settings), auth, exporters |
| `src/app/actions/` | Server actions: authenticated, validated with Zod |
| `src/app/(app)/` | Pages; `src/app/api/reports/[format]` serves downloads |
| `src/proxy.ts` | Requires a signed-in session for every page and API route |
| `tests/` | Vitest suites |
