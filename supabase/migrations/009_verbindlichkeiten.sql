-- ─────────────────────────────────────────────────────────────────────────────
-- 009 – Verbindlichkeiten: Eingangsrechnungen (Lieferantenrechnungen) mit
-- Fälligkeit. Beim Bezahlen entsteht automatisch eine E&A-Ausgabe
-- (import_quelle = 'eingangsrechnung'). Zahlung ist nur solange rückgängig
-- machbar, wie die E&A-Buchung nicht gesperrt ist (Monatsabschluss/UVA).
-- ─────────────────────────────────────────────────────────────────────────────

create table eingangsrechnungen (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants(id) on delete cascade,
  firma_id           uuid        references firmen(id) on delete set null,
  lieferant          text        not null,
  rechnungsnummer    text,
  beschreibung       text        not null,
  datum              date        not null,
  faellig_am         date        not null,
  betrag_netto       numeric     not null check (betrag_netto >= 0),
  ust_satz           numeric     not null default 20 check (ust_satz in (0, 10, 13, 20)),
  ust_betrag         numeric     generated always as (round(betrag_netto * ust_satz / 100, 2)) stored,
  betrag_brutto      numeric     generated always as (betrag_netto + round(betrag_netto * ust_satz / 100, 2)) stored,
  abzugsfaehig_pct   numeric     not null default 100 check (abzugsfaehig_pct between 0 and 100),
  kategorie_id       uuid        references ea_kategorien(id) on delete set null,
  status             text        not null default 'offen' check (status in ('offen', 'bezahlt', 'storniert')),
  bezahlt_am         date,
  zahlungsart        text        check (zahlungsart in ('bank', 'bar', 'karte', 'sonstig')),
  konto_id           uuid        references konten(id) on delete set null,
  ea_transaktion_id  uuid        references ea_transaktionen(id) on delete set null,
  notizen            text,
  erstellt_von       uuid        references auth.users(id),
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now()
);
comment on table eingangsrechnungen is 'Verbindlichkeiten: Eingangsrechnungen von Lieferanten mit Fälligkeit; Zahlung bucht eine E&A-Ausgabe';
comment on column eingangsrechnungen.ea_transaktion_id is 'E&A-Ausgabe, die beim Bezahlen angelegt wurde';

create index eingangsrechnungen_tenant_status_idx on eingangsrechnungen (tenant_id, status, faellig_am);

create trigger eingangsrechnungen_aktualisiert before update on eingangsrechnungen
  for each row execute function update_aktualisiert_am();

-- E&A-Buchungen aus Eingangsrechnungen kennzeichnen
alter table ea_transaktionen drop constraint if exists ea_transaktionen_import_quelle_check;
alter table ea_transaktionen add constraint ea_transaktionen_import_quelle_check
  check (import_quelle in ('manuell', 'csv', 'beleg', 'dauerauftrag', 'rechnung', 'eingangsrechnung'));

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table eingangsrechnungen enable row level security;

create policy "er_select" on eingangsrechnungen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "er_insert" on eingangsrechnungen for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "er_update" on eingangsrechnungen for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "er_delete" on eingangsrechnungen for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
