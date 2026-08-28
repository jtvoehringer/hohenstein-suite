# Hohenstein Suite

Internes Dashboard der **Hohenstein Consulting OG**: CRM (Kalender, Kontakte, Firmen, Pipeline), E-Mail (IMAP/SMTP),
E&A-Rechnung (Buchungen, Belege, Kategorien, Daueraufträge, Monatsabschluss, UVA, Konten), Fakturierung (Angebote,
Rechnungen, Gutschriften, PDF, E-Mail-Versand, Zahlungen → E&A, Offene Posten, Verbindlichkeiten/Eingangsrechnungen → E&A-Ausgabe), Aufgaben und die Verwaltung der software:112-Demo-Umgebung
(Mandant „Weingut Musterhof (Demo)": Reset der Beispieldaten, interne Vorführ-Zugänge – nur für das Management-Team, kein externer Zugriff). Fachliche Basis: software:112. Design: hohenstein Corporate Design (Poppins,
IBM Plex Sans/Mono, Markenblau #77A6E7) – „powered by ICP Solutions".

## Stack
- Next.js 16 (App Router, TypeScript, Tailwind 3), Supabase (Postgres + RLS + Auth, Projekt `hohenstein-suite`,
  Ref `usvniwfqozqkxdhjjumm`, eu-central-1), Vercel.
- Ein Mandant **Hohenstein Consulting OG**; die Demo-Umgebung lebt im software:112-Projekt (siehe `S112_*`-Variablen, SQL in `supabase/s112/`).
- Rollen: `admin` · `mitarbeiter` · `leser`. Benutzer mit `@hohenstein-partner.at` / `@icp-consultants.at` werden
  beim ersten Anmelden automatisch als Admin in beiden Mandanten freigeschaltet (Tabelle `zugelassene_domains`).

## Umgebungsvariablen (Vercel → Settings → Environment Variables)
| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://usvniwfqozqkxdhjjumm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (nur Server: Einladungen, Cron) |
| `NEXT_PUBLIC_APP_URL` | z.B. `https://hohenstein-suite.vercel.app` |
| `EMAIL_CRYPT_SECRET` | langer Zufallsstring (Verschlüsselung der IMAP/SMTP-Passwörter) |
| `CRON_SECRET` | Zufallsstring – Vercel sendet ihn beim Cron-Aufruf mit |
| `ANTHROPIC_API_KEY` | optional: Beleg-Erkennung (OCR) |
| `S112_SUPABASE_URL` | `https://zwcsgnemijkpyxrqykul.supabase.co` – software:112-Projekt (Demo-Umgebung) |
| `S112_SERVICE_ROLE_KEY` | service_role des software:112-Projekts (Demo-Reset, Demo-Zugänge) |
| `S112_APP_URL` | `https://software112.icp-consultants.at` (Login-Adresse für Demo-Zugänge) |
| `S112_DEMO_TENANT_ID` | `33333333-3333-4333-8333-333333333333` (Mandant Weingut Musterhof (Demo)) |

Supabase → Authentication → URL Configuration: **Site URL** = App-URL, **Redirect URLs** = `https://<app>/auth/callback`,
`https://<app>/auth/invite`, `https://<app>/auth/update-password`.

## Entwicklung
```bash
npm install
cp .env.local.example .env.local   # Werte eintragen
npm run dev
npm run type-check
```

## Datenbank
Migrationen liegen in `supabase/migrations/` (001–010; 007 Demo-Zugänge, 008 Fakturierung, 009 Verbindlichkeiten, 010 Demo-Team) und sind im Projekt bereits eingespielt. Neue Migrationen:
Datei anlegen und im Supabase SQL Editor ausführen. Regeln: jede Funktion mit `set search_path = public`,
`revoke execute … from public, anon`, RPCs mit `p_tenant_id` prüfen `pruefe_tenant_zugriff(...)`.

## Deployment
Push auf `main` löst das Vercel-Deployment aus (`push.ps1`). Crons (siehe `vercel.json`): `/api/cron/ea-dauerauftraege`
täglich 05:00 UTC verbucht fällige Daueraufträge, `/api/cron/demo-zugaenge` 05:30 UTC sperrt abgelaufene Demo-Zugänge.
