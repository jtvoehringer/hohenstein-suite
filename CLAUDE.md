# Hohenstein Suite – Projektkontext für Claude

## Auftraggeber / Nutzer
- Hohenstein Consulting OG – Nutzer: Jörgen (jv@hohenstein-partner.at), Hannes (jg@hohenstein-partner.at), Paul (pd@hohenstein-partner.at); alle Admin.
- Anrede: Du. Sprache in UI und Code-Kommentaren: Deutsch mit echten Umlauten, österreichische Schreibweise (Jänner).

## Projekt
- Internes Dashboard: CRM (inkl. CSV-Import /crm/import und Visitenkarten-Scan /crm/kontakte/visitenkarte; Firmen mit
  `betriebsstandort`/`region` nach ÖWM-Logik – Betriebsstandort = generisches Weinbaugebiet inkl. Bergland, Region = Gebiet bzw. Bundesland, Migration 011 –
  sowie `quelle` als auswertbares Feld, Migration 012: ÖWM-Betriebssuche, Leadliste, Visitenkarten-Scan, CSV-Import, Manuell,
  und `account_manager` (uuid → auth.users, Migration 013): betreuendes Team-Mitglied, Zuordnung auf der Firmen-Detailseite,
  Filter in der Firmen-Liste, Spalte im CSV-Export; Auswahl über RPC `mandant_mitglieder`) · E-Mail (IMAP) · E&A-Rechnung · Fakturierung (Angebote/Rechnungen/Gutschriften, Offene Posten) · Aufgaben · Verwaltung der software:112-Demo. Referenzsystem: software:112 (Ordner „ERP Software112").
- Supabase-Projekt `hohenstein-suite` (Ref `usvniwfqozqkxdhjjumm`, eu-central-1). Vercel aus GitHub `main`.
- Ein Mandant: `11111111-1111-4111-8111-111111111111` Hohenstein Consulting OG (E&A-Betriebsbeginn 01.01.2026).
- Demo-Umgebung = Mandant „Weingut Musterhof (Demo)" `33333333-3333-4333-8333-333333333333` im software:112-Projekt
  (`zwcsgnemijkpyxrqykul`); Zugriff über `src/lib/s112/admin.ts` (Service-Role; nur dieser Mandant darf verändert werden,
  dort liegt auch der produktive „Sandbox"-Mandant!). SQL: `supabase/s112/demo_musterhof.sql`. Vorführ-Zugänge (nur Team): Tabelle `demo_zugaenge` (gueltig_bis NULL = unbefristet).
- Demo-Bereich (`/demo`) ist adminOnly (Team-Vorführ-Zugänge, unbefristet). Seit 31.08.2026 zusätzlich: öffentlicher,
  unauthentifizierter Endpunkt `POST /api/public/trial` (Migration 014) für hohenstein-partner.at – Website-Besucher bekommen
  automatisch (ohne Freigabe) einen befristeten (`TRIAL_DAUER_TAGE`, Standard 14 Tage) **Lesezugriff** auf denselben
  Demo-Mandanten, plus einen Lead in `firmen` (`quelle='Website-Trialanfrage'`). Nutzt bestehende Funktionen 1:1
  (`s112DemoUserAnlegen`, `demo_zugaenge`, Ablauf-Cron `/api/cron/demo-zugaenge`); neu ist nur das Rate-Limit-/Audit-Log
  `trial_anfragen` und ein nächtlicher Reset-Cron `/api/cron/demo-reset` (Missbrauchsschutz, da öffentlich erreichbar).
  Zugangsdaten- und interne Benachrichtigungsmail laufen über einen eigenen Brevo-SMTP-Versand (`src/lib/email/transaktional.ts`,
  env `BREVO_SMTP_*`/`TRIAL_*` – siehe `.env.local.example`), unabhängig von den IMAP/SMTP-Postfachverbindungen der Nutzer.
  CORS für die Website-Domain über `TRIAL_ALLOWED_ORIGINS`. Daneben `POST /api/public/kontakt` fürs allgemeine
  Kontaktformular der Website (ohne Trial-Provisionierung, landet ebenfalls als Lead in `firmen`/`kontakte`,
  `quelle='Website-Kontakt'`). Beide Endpunkte nutzen `src/lib/public/firmaMatch.ts` als Dublettenschutz
  (E-Mail/Name/Domain) gegen die bereits ~5.000 bestehenden Firmen aus den ÖWM-Importen – bei Treffer wird an
  die bestehende Firma angedockt statt eine Dublette anzulegen, die ursprüngliche `quelle` (z.B.
  ÖWM-Betriebssuche) bleibt dabei erhalten. Design: ausschließlich HC CD; ICP-CD nur für den
  „powered by ICP Solutions"-Hinweis.
- Fakturierung: `belege`/`beleg_positionen`/`beleg_zahlungen`, Nummern über RPC `get_next_belegnummer`;
  Zahlung bucht automatisch eine E&A-Einnahme (`import_quelle='rechnung'`). Nummernkreis/Standardtexte in /einstellungen (Karte „Fakturierung").
- Verbindlichkeiten: `eingangsrechnungen` (/rechnungen/verbindlichkeiten); Bezahlen bucht E&A-Ausgabe (`import_quelle='eingangsrechnung'`),
  Zahlung zurücknehmen löscht sie (nur wenn nicht gesperrt). Fällige Eingangs-/überfällige Ausgangsrechnungen erscheinen in der Hinweis-Glocke.

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
