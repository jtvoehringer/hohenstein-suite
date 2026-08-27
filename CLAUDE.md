# Hohenstein Suite – Projektkontext für Claude

## Auftraggeber / Nutzer
- Hohenstein Consulting OG – Nutzer: Jörgen (jv@hohenstein-partner.at), Hannes (jg@hohenstein-partner.at), Paul (pd@hohenstein-partner.at); alle Admin.
- Anrede: Du. Sprache in UI und Code-Kommentaren: Deutsch mit echten Umlauten, österreichische Schreibweise (Jänner).

## Projekt
- Internes Dashboard: CRM · E-Mail (IMAP) · E&A-Rechnung · Aufgaben · Demo-Umgebung. Referenzsystem: software:112 (Ordner „ERP Software112").
- Supabase-Projekt `hohenstein-suite` (Ref `usvniwfqozqkxdhjjumm`, eu-central-1). Vercel aus GitHub `main`.
- Mandanten: `11111111-1111-4111-8111-111111111111` Hohenstein Consulting OG (E&A-Betriebsbeginn 01.01.2026),
  `22222222-2222-4222-8222-222222222222` Demo-Umgebung (`ist_demo`, Reset über RPC `demo_zuruecksetzen()`).

## Tech-Konventionen
- Next.js 16 App Router, TypeScript, Tailwind 3 (Farbpräfix `hs-…`, Tokens lt. hohenstein-CD), Supabase SSR.
- `(supabase.from('tabelle') as any)` Muster; `tenant_id` immer aus `getCurrentMembership()` (server-only, `src/lib/auth/roles.ts`).
- Rollen `admin | mitarbeiter | leser`; `canWrite` / `canAdmin`. `lib/auth/roles` nie in Client-Komponenten importieren.
- Navigation zentral in `src/lib/navigation/index.ts`; Layout `src/app/(dashboard)/layout.tsx`, Kopfleiste/TabNav in `src/components/layout/`.
- DB-Funktionen: `set search_path = public`, `revoke execute from public, anon`, `pruefe_tenant_zugriff(p_tenant_id, rollen)` als erste Zeile.
- Gesperrte Buchungen (`is_locked`) sind per Trigger geschützt; UVA erst nach Monatsabschlüssen (RPC `sperre_ea_uva`).
- Details zur Portierung/Schema: `PORTIERUNG.md`, Migrationen in `supabase/migrations/`.

## Arbeitsweise
- Claude schreibt Code + SQL; Jörgen führt SQL im Supabase SQL Editor aus und pusht (`push.ps1`) – Vercel deployt automatisch.
- Umsetzungsentscheidungen direkt umsetzen; Rückmeldung erfolgt auf der Live-Version.
