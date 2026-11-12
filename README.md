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
SQLite via Drizzle ORM (better-sqlite3) · Zod · react-pdf · ExcelJS · Vitest.

Everything runs in one Node process with one database file; there are no paid
services.

## Setup

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
openssl rand -base64 48          # paste as AUTH_SECRET
npm run hash-password -- "choose a strong password"   # paste the printed line
```

Then:

```bash
npm run dev            # http://localhost:3000
npm run db:seed        # optional: sample clients, projects and entries
```

The database (`data/app.db` by default) and its tables are created
automatically on first start. Open **Settings** to enter your business
details, default rate and timezone.

## Production

```bash
npm run build
npm start              # serves on port 3000 (set PORT to change)
```

Run it on any host that has a persistent disk (a small VPS, a home server, Fly.io
or Railway with a volume, etc.) and put it behind HTTPS. Session cookies are
marked `Secure` in production, so plain-HTTP access won't stay signed in.
Serverless platforms without a persistent filesystem (e.g. Vercel) are not
suitable for the SQLite file.

**Backups:** the whole dataset is `data/app.db` (plus `-wal`/`-shm` files while
running). Back it up with `sqlite3 data/app.db ".backup backup.db"`, or by
copying the file while the app is stopped.

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
