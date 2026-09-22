# Hohenstein Suite – Projektkontext für Claude

## Auftraggeber / Nutzer
- Hohenstein Consulting OG – Nutzer: Jörgen (jv@hohenstein-partner.at), Hannes (jg@hohenstein-partner.at), Paul (pd@hohenstein-partner.at); alle Admin.
- Anrede: Du. Sprache in UI und Code-Kommentaren: Deutsch mit echten Umlauten, österreichische Schreibweise (Jänner).

## Projekt
- Internes Dashboard: CRM (inkl. CSV-Import /crm/import und Visitenkarten-Scan /crm/kontakte/visitenkarte; Firmen mit
  `betriebsstandort`/`region` nach ÖWM-Logik – Betriebsstandort = generisches Weinbaugebiet inkl. Bergland, Region = Gebiet bzw. Bundesland, Migration 011 –
  sowie `quelle` als auswertbares Feld, Migration 012: ÖWM-Betriebssuche, Leadliste, Visitenkarten-Scan, CSV-Import, Manuell,
  und `account_manager` (uuid → auth.users, Migration 013): betreuendes Team-Mitglied, Zuordnung auf der Firmen-Detailseite,
  Filter in der Firmen-Liste, Spalte im CSV-Export; Auswahl über RPC `mandant_mitglieder`; Sammelaktionen in Firmen- und Kontakte-Liste:
  Klickboxen + Leiste „Pipeline" (je Auswahl eine Chance „<Kampagne> – <Name>", `createPipelineEintraegeFuerFirmen/-Kontakte`,
  `SammelChanceForm`) und „Löschen" (`deleteFirmen/deleteKontakte`); Produktkunde (Migration 020) auf Firmen und Kontakten:
  Toggle `produktkunde` + `produkte` jsonb [{produkt: software112|webpage|weinshop, kundennummer}] – Formularblock `ProduktkundeFelder`,
  Pills `ProduktPills`, Filter „Produktkunden"/Produkt-Select in beiden Listen, CSV-Spalten; Produktliste `PRODUKTE` in `lib/crm/types.ts`) · E-Mail (IMAP) · E&A-Rechnung · Fakturierung (Angebote/Rechnungen/Gutschriften, Offene Posten) · Aufgaben · Verwaltung der software:112-Demo. Referenzsystem: software:112 (Ordner „ERP Software112").
- Supabase-Projekt `hohenstein-suite` (Ref `usvniwfqozqkxdhjjumm`, eu-central-1). Vercel aus GitHub `main`.
- Ein Mandant: `11111111-1111-4111-8111-111111111111` Hohenstein Consulting OG (E&A-Betriebsbeginn 01.01.2026).
- Demo-Umgebung = Mandant „Weingut Musterhof (Demo)" `33333333-3333-4333-8333-333333333333` im software:112-Projekt
  (`zwcsgnemijkpyxrqykul`); Zugriff über `src/lib/s112/admin.ts` (Service-Role; nur dieser Mandant darf verändert werden,
  dort liegt auch der produktive „Sandbox"-Mandant!). SQL: `supabase/s112/demo_musterhof.sql`. Vorführ-Zugänge (nur Team): Tabelle `demo_zugaenge` (gueltig_bis NULL = unbefristet).
- Demo-Bereich ist adminOnly (nur Management-Team, zum Vorführen bei Kundenterminen); KEINE Zugänge für Interessenten –
  das läuft später über die Hohenstein-Homepage. Design: ausschließlich HC CD; ICP-CD nur für den „powered by ICP Solutions"-Hinweis.
- Fakturierung: `belege`/`beleg_positionen`/`beleg_zahlungen`, Nummern über RPC `get_next_belegnummer`;
  Zahlung bucht automatisch eine E&A-Einnahme (`import_quelle='rechnung'`). Nummernkreis/Standardtexte in /einstellungen (Karte „Fakturierung").
- Serientermine (Migration 014): Termine mit Wiederholung (täglich/wöchentlich/14-tägig/monatlich, Enddatum Pflicht, max. 2 Jahre)
  werden beim Anlegen als materialisierte Einzeltermine mit gemeinsamer `serie_id` + `serie_regel` erzeugt (createAktivitaet);
  Bearbeiten/Verschieben wirkt je Instanz, Löschen bietet „diesen / ab diesem / ganze Serie" (deleteAktivitaetSerie).
- Morgenbericht auf der Übersicht (/dashboard, nur Hohenstein-Mandant, Schreibberechtigte; `dashboard/MorgenberichtKarte.tsx`, per Suspense
  gestreamt): links Testzugänge über hohenstein-partner.at (`trial_anfragen` + `demo_zugaenge`, letzte 14 Tage, Bot-Ablehnungen ausgeblendet,
  letzte Anmeldung via `s112LetzteAnmeldungen`), rechts Healthstatus software:112 (`src/lib/s112/health.ts`: App-Ping S112_APP_URL,
  DB-Antwortzeit, aktive Mandanten/Stripe-Status, `system_ereignisse` 24 h inkl. Smoke-Test, `morgenberichte`-Cron heute vs. gestern,
  offene `stripe_zahlungen_log`) mit Gesamtampel. Trial-API: /api/public/trial (Website-Formular → Firma/Kontakt/Demo-User/Mails).
- Benachrichtigungen (Migration 022, `src/lib/benachrichtigungen/server.ts`): Ereignisse „Aufgabe zugewiesen", „Aufgabe für alle"
  (`aufgaben.fuer_alle`, Verantwortlich „– Alle –") und „@Erwähnung" (Vorname oder voller Name der Team-Mitglieder in Aufgaben-
  Beschreibung und Termin-Beschreibung, nur neue Erwähnungen beim Bearbeiten) werden über Kanäle zugestellt: App (Tabelle
  `benachrichtigungen`, Glocke in der Kopfleiste über /api/dashboard/hinweise, gelesen via POST /api/benachrichtigungen) und E-Mail
  (Brevo, `sendeSystemMail`; je Benutzer abschaltbar über `profiles.benachrichtigung_email` im Profil). Empfänger-Mails über
  RPC `mandant_mitglieder_mit_email` (nur Service-Role). Auslöser wird nie selbst benachrichtigt; Zustellung ist best effort.
  WhatsApp als weiterer Kanal wäre über die Meta WhatsApp Business Cloud API ergänzbar (Kanal-Liste in `Ereignis.kanaele`).
- Reporting (/reporting, Übersicht → Reporting): Unternehmens-Cockpit je Geschäftsjahr mit Stichtag – KPIs (Einnahmen/Aufwendungen/Ergebnis
  netto, Liquidität, Forderungen, Verbindlichkeiten), Vermögensübersicht als Nebenrechnung zur E&A (Anlagevermögen zu Buchwerten,
  Umlaufvermögen = Kontensalden + offene Ausgangsrechnungen, Verbindlichkeiten = offene Eingangsrechnungen + USt-Saldo-Schätzung),
  Monatsverlauf, Kategorien mit Vorjahr, Konten, USt/UVA; Daten in `reporting/_data.ts`, Druck/PDF über Print-CSS.
- Anlagenverzeichnis (Migrationen 017/018, /buchhaltung/anlagen, übernommen aus KPS Smart Buchhaltung Wellen 7/7b/8):
  Tabelle `anlagen` mit AfA-Methode linear | degressiv (max. 30 %, Wechsel auf linear) | gwg, Halbjahresregel bei Zugang 2. HJ /
  Abgang 1. HJ, Konto-Nr. (Kontenklasse 0), Abgang mit Datum/Erlös; Verknüpfung Anlage ↔ Anschaffungsbuchung (`anlagen.transaktion_id`,
  Kandidaten = Ausgaben in Kategorien mit konto_nr 1–999; Buchungsliste zeigt Badges „Anlage"/„Anlage anlegen"/„AfA", BuchungForm leitet
  bei neuer Kontenklasse-0-Ausgabe zu `/buchhaltung/anlagen?buchung=<id>`). AfA-Buchung am Jahresende (`bucheAfa`/`afaZuruecknehmen`):
  je Anlage eine Ausgabe „Abschreibung (AfA)" (Systemkategorie 7010, 0 % USt, ohne Konto, `ea_transaktionen.anlage_id`, eindeutig je Jahr).
  Anlagenspiegel druckbar (A4 quer) unter /buchhaltung/anlagen/spiegel?jahr=. Reporting rechnet AfA-Buchungen aus den Aufwendungen heraus und
  zeigt „Ergebnis nach AfA" (= Ergebnis + Anlagenkäufe Kontenklasse 0 − AfA laut Verzeichnis). Buchwert-Semantik: AfA wird jährlich per
  31.12. gebucht, im laufenden Jahr gilt der Buchwert 1.1. Berechnung in `src/lib/ea/anlagen.ts`.
- Datencenter (Migration 016): Tab /datencenter mit Ordnerbaum (`ablage_ordner`) + Dateien (`ablage_dateien`, Bucket `datencenter`, 50 MB);
  Datei-Anhänge an Firmen/Kontakten/Aufgaben laufen über dieselbe Ablage (firma_id/kontakt_id/aufgabe_id – Migration 021, Karte
  „Dateien"/„Anhänge" auf den Detailseiten bzw. im Aufgaben-Panel, `DateienKarte`; im Datencenter unter „Anhänge (CRM & Aufgaben)");
  Termine nutzen weiter `aktivitaet_dokumente`. Upload geht DIREKT aus dem Browser in den Bucket
  (signierte Upload-URL, `src/lib/datencenter/upload.ts`, zweistufige JSON-API /api/datencenter/datei start/fertig) – Vercel-Functions
  nehmen nur 4,5 MB Body an; Download/Löschen über /api/datencenter/datei/[id]. Bucket ohne MIME-Allowlist (Migration 019), API sperrt ausführbare Dateien.
- Gemeinsame Mailbox (Migration 015): zusätzlich zu den persönlichen Postfächern eine team-weite Verbindung je Mandant
  (`user_email_connections.gemeinsam`, z. B. office@hohenstein-partner.at); aktive Mailbox wählt das Cookie `hs_mail_konto`
  (Umschalter im Posteingang neben der Adresse), Einrichtung unter Nachrichten → E-Mail-Konto → Gemeinsame Mailbox.
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
- Claude schreibt Code + SQL und spielt Migrationen direkt über den Supabase-MCP ein; geänderte Dateien liefert Claude direkt
  in den Projektordner. Jörgen committet und pusht dann mit `.\push.ps1 "Beschreibung"` (= git add -A, commit, push) –
  Vercel deployt automatisch.
- Umsetzungsentscheidungen direkt umsetzen; Rückmeldung erfolgt auf der Live-Version.
