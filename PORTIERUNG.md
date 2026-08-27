# Portierungsregeln – Hohenstein Suite (aus software:112)

Projekt: `/home/claude/suite` (Next.js 16, App Router, TypeScript, Tailwind 3, Supabase SSR).
Referenzcode (NUR lesen, nie ändern): `/home/claude/ref` (software:112).
Die Suite ist das interne Dashboard der Hohenstein Consulting OG (Beratung + Vertrieb von software:112).
Sprache der UI: Deutsch (Du-Form in Hinweisen ist ok, „Sie" nicht nötig), immer echte Umlaute (ä/ö/ü), österreichische
Schreibweise (Jänner), Beträge `€ 1.234,56` (siehe `src/lib/format.ts`: `fmtEuro`, `fmtEuroMitZeichen`, `fmtDatum`).

## Was bereits existiert (NICHT ändern – nur verwenden)
- `src/lib/supabase/{client,server,admin}.ts`
- `src/lib/auth/roles.ts` (server-only!): `getCurrentMembership()`, `requireTenantId()`, `canWrite(role)`, `canAdmin(role)`,
  `ROLLEN_SCHREIBEND`. Rollen: `'admin' | 'mitarbeiter' | 'leser'`.
- `src/lib/auth/activeTenant.ts`, `src/lib/auth/mandantActions.ts`
- `src/lib/format.ts`, `src/lib/utils/csv.ts`, `src/lib/email/crypto.ts` (encryptPass/decryptPass), `src/lib/ea/betriebsbeginn.ts`
- `src/lib/crm/types.ts` (SEGMENTE, PIPELINE_STUFEN, PIPELINE_KATEGORIEN, AKTIVITAET_ARTEN, Row-Typen, kontaktName)
- `src/lib/navigation/index.ts` – Routen sind FIX (siehe unten). Nicht ändern.
- Layout: `src/app/(dashboard)/layout.tsx` (Topbar, TabNav, DemoBanner, CommandPalette, Footer). Seiten rendern nur ihren Inhalt
  (kein eigener Container/Padding nötig – der Rahmen ist `max-w-7xl p-4..8`).
- `src/components/ui/{ClickableTableRow,ConfirmDeleteForm,StopPropagation}.tsx`
- `src/app/api/me/active-tenant/route.ts`, `src/app/api/global-search/route.ts`, `src/app/api/dashboard/hinweise/route.ts`
- `tailwind.config.ts` (Präfix `hs-…`), `src/app/globals.css` (Klassen: `card`, `btn-primary`, `btn-secondary`, `btn-danger`,
  `input`, `form-label`, `overline`, `kpi`, `pill`, `table-head`, `betrag`).

## Feste Routen (Navigation)
- Übersicht: `/dashboard`, `/aufgaben`
- CRM: `/crm` (Kalender/Aktivitäten), `/crm/kontakte`, `/crm/kontakte/[id]`, `/crm/firmen`, `/crm/firmen/[id]`, `/crm/pipeline`
- E-Mail: `/nachrichten`, `/nachrichten/einstellungen`
- E&A: `/buchhaltung`, `/buchhaltung/neu`, `/buchhaltung/belege`, `/buchhaltung/belege/[id]`, `/buchhaltung/kategorien`,
  `/buchhaltung/dauerauftraege`, `/buchhaltung/monatsabschluss`, `/buchhaltung/uva`, `/buchhaltung/export`,
  `/konten`, `/konten/neu`, `/konten/[id]/abstimmung`
- Demo: `/demo` · System: `/profil` (fertig), `/einstellungen`, `/benutzer`

## Mechanische Ersetzungen beim Portieren
- CSS-Klassen: `s112-` → `hs-` (z.B. `text-s112-muted` → `text-hs-muted`, `bg-s112-teal` → `bg-hs-teal`), `--s112-` → `--hs-`.
  Bevorzugt die neuen globalen Klassen (`card`, `btn-primary`, `input`, `pill` …) verwenden.
- Rollen: `'system_admin'`, `'tenant_admin'` → `'admin'`; `'winzer'` → `'mitarbeiter'`; `'leser'` bleibt.
  Arrays wie `['system_admin','tenant_admin','winzer']` → `['admin','mitarbeiter']`.
- `getTenantId(supabase)` / eigene Membership-Queries → `getCurrentMembership()` bzw. `requireTenantId()` aus `@/lib/auth/roles`.
- Cookie-Name/Events: `s112:…` → `hs:…` (`PALETTE_EVENT`, `HINWEISE_EVENT` aus `@/components/layout/Topbar`).
- Entfernen: alles zu Weinbau (verkaufsposten, zahlungen, weinausbau, fuellungen, rieden, preislisten, rabattgruppen,
  skonto, kundennummer-Rechnung, Brevo/Newsletter, SumUp, M365/Graph, Stripe, `isSandboxAdminUnlock`, `SANDBOX_ADMIN_ALLOWLIST`,
  Sandbox-Sonderlogik, `modul_*`-Toggles, `branding.primary_color`). Kein `lib/m365`, kein `lib/brevo`, kein `lib/stripe`.
- Icons: `lucide-react`, 16–18px, strokeWidth 1.5–1.75. Keine Emojis.

## Datenbank (Supabase-Projekt `usvniwfqozqkxdhjjumm`, Schema in `supabase/migrations/*.sql`)
Tabellen: `tenants(id,name,slug,ist_demo,active)`, `tenant_memberships(tenant_id,user_id,role,aktiv)`,
`profiles(id,display_name,full_name,telefon,avatar_url)`, `tenant_einstellungen(tenant_id, anzeigename, logo_url, betrieb_*,
kunden_prefix/zaehler/stellen, ust_satz_standard, ea_buchung_modus, ea_kleinunternehmer, ea_uva_zeitraum, ea_betriebsbeginn,
session_timeout_minuten, fristen_vorwarnung_tage)`, `zugelassene_domains(domain, role)`.
CRM: `firmen`, `kontakte`, `kontakt_firmen`, `aktivitaeten`, `aktivitaet_dokumente`, `pipeline_eintraege`, `pipeline_verlauf`
(Spalten exakt lt. `002_crm.sql` – KEINE Spalten aus software:112 annehmen, die dort nicht stehen, z.B. kein
`rabattgruppe_id`, `stammkunde`, `newsletter`, `skonto_pct`, `betrieb_nr`, `weingut_ansprechpartner` → heißt jetzt
`ansprechpartner_intern`; Kontakte haben `position`; Firmen `ist_kunde`/`ist_lieferant`/`is_lead`).
E&A: `ea_kategorien` (tenant_id NULL = Standardvorlage; beim ersten Zugriff eines Mandanten ohne eigene Kategorien die
Vorlage kopieren), `ea_transaktionen` (KEIN verkaufsposten_id; `ust_betrag`, `betrag_brutto`, `betrag_abzugsfaehig`
sind GENERATED – nie inserten/updaten; `firma_id`, `konto_id`, `belegnummer`, `abgeglichen`, `is_locked`,
`import_quelle in ('manuell','csv','beleg','dauerauftrag')`), `ea_belege`, `ea_dauerauftraege`, `ea_dauerauftrag_log`,
`ea_monatsabschluss`, `ea_uva`, `konten`, `konto_umbuchungen`.
Sonstiges: `aufgaben(titel,beschreibung,status offen|in_arbeit|erledigt,prioritaet niedrig|normal|hoch,verantwortlich_id,
faellig_am,kontakt_id,firma_id,bereich,erledigt_am,erstellt_von)`, `user_email_connections` (nur IMAP/SMTP; `signatur`,
`letzter_abruf`, `letzter_fehler`).
RPCs (alle mit p_tenant_id): `get_next_kundennummer`, `pruefe_ea_zeitraum_offen(p_tenant_id,p_datum)`,
`berechne_ea_uva(p_tenant_id,p_jahr,p_zeitraum)`, `sperre_ea_monat`, `oeffne_ea_monat`, `sperre_ea_uva`,
`setze_kontobewegung_abgeglichen(p_tenant_id,p_quelle 'ea_transaktion'|'umbuchung_von'|'umbuchung_nach',p_id,p_abgeglichen)`,
`process_ea_dauerauftraege()` (nur service_role → Admin-Client), `demo_zuruecksetzen()`.
Storage-Buckets: `ea-belege`, `aktivitaet-dokumente`, `mandant-logos` – Pfad IMMER `${tenantId}/…` (Policies prüfen den Ordner).
Ein Trigger verhindert Änderungen an gesperrten Buchungen (is_locked) – Fehlermeldung an den Nutzer durchreichen.

## Sicherheitsregeln
- Jede Query mit `.eq('tenant_id', tenantId)`; tenantId immer serverseitig aus `getCurrentMembership()`, NIE aus dem Request.
- Schreibende Server Actions/Routes prüfen `canWrite(role)` (bzw. `canAdmin` für Monatsabschluss/UVA/Einstellungen/Benutzer).
- `lib/auth/roles` nie in Client-Komponenten importieren (nur Typen: `import type { UserRole }`).
- `supabase.from('x') as any` Muster beibehalten (Typ `R = Record<string, any>`).

## Qualität
- Nach dem Portieren: `npx tsc --noEmit` muss ohne Fehler durchlaufen (nur eigene Dateien fixen).
- Alle in `.select('…')`/`.insert({…})`/`.update({…})` verwendeten Spaltennamen gegen `supabase/migrations/*.sql` prüfen
  (grep). Fehlende Spalten sind Laufzeitfehler, die tsc nicht findet!
- Leere Zustände: ein Satz in `text-hs-text-2` + Primäraktion. Ladezustand: einfache `loading.tsx` optional.
- Server Components mit `export const dynamic = 'force-dynamic'`.
- Keine Dateien außerhalb der eigenen Modul-Ordner anlegen/ändern (Ausnahme: eigene Unterordner unter `src/lib/<modul>/`
  und `src/components/<modul>/`).
