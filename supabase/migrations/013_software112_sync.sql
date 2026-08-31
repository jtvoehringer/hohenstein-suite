-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013 – software:112 Zahlungs-Sync (Zugriffssperre-Rückmeldung 31.8.2026)
-- "wir müssten unsere Stripe Implementierung noch einbauen ... ich frag mich
-- ob wir das Zahlungstracking nicht in die Hohenstein Suite übernehmen können
-- und bei den Kunden im E&A Modul anhängen. Oder wie wollen wir die Zahlungen
-- verfolgen - bei 200 Mandanten gehen wir da bei Abstimmungsarbeiten unter..."
--
-- firmen.s112_tenant_id verknüpft eine CRM-Firma mit einem software:112-Mandanten
-- (tenants.id im ANDEREN Supabase-Projekt zwcsgnemijkpyxrqykul - daher keine
-- Foreign Key, nur ein loser uuid-Verweis). Die neue Seite /software112 liest
-- per s112Admin() (bestehender Service-Role-Zugriff, src/lib/s112/admin.ts)
-- alle echten Mandanten samt Stripe-Status und die neuen, unverbuchten Zeilen
-- aus stripe_zahlungen_log (software:112-Migration 183) und bucht sie hier
-- automatisch als E&A-Einnahme (ea_transaktionen, Kategorie "Softwarelizenzen
-- / SaaS", bereits als Standardkategorie vorhanden).
-- ─────────────────────────────────────────────────────────────────────────────

alter table firmen add column if not exists s112_tenant_id uuid unique;
comment on column firmen.s112_tenant_id is 'Verweis auf tenants.id im software:112-Projekt (kein FK, anderes Supabase-Projekt) - verknüpft die CRM-Firma mit dem software:112-Mandanten für den automatischen E&A-Sync.';
create index if not exists idx_firmen_s112_tenant on firmen(s112_tenant_id) where s112_tenant_id is not null;

-- Neue import_quelle für automatisch aus dem software:112-Zahlungs-Sync erzeugte
-- E&A-Buchungen (analog 'rechnung'/'eingangsrechnung' aus 008/009).
alter table ea_transaktionen drop constraint if exists ea_transaktionen_import_quelle_check;
alter table ea_transaktionen add constraint ea_transaktionen_import_quelle_check
  check (import_quelle in ('manuell', 'csv', 'beleg', 'dauerauftrag', 'rechnung', 'eingangsrechnung', 'software112'));
