-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 – Fakturierung: Leistungskatalog, Belege (Angebot/Rechnung/
-- Gutschrift), Positionen, Zahlungen, Nummernkreise
-- Hohenstein Suite | 2026-08-27
--
-- Abläufe:
--   Angebot  : entwurf → gesendet → angenommen | abgelehnt  (→ „In Rechnung umwandeln")
--   Rechnung : entwurf → gestellt → teilbezahlt → bezahlt | storniert
--   Gutschrift: entwurf → gestellt → verrechnet
-- Die Belegnummer wird erst beim „Stellen" über get_next_belegnummer vergeben
-- (Entwürfe haben nummer = NULL). Summen werden von der Server Action aus den
-- Positionen berechnet und gespeichert; bezahlt_betrag/Status pflegt ein Trigger
-- auf beleg_zahlungen.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Leistungskatalog ─────────────────────────────────────────────────────────
create table leistungen (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references tenants(id) on delete cascade,
  bezeichnung      text        not null,
  beschreibung     text,
  einheit          text        not null default 'Stunde' check (einheit in ('Tag', 'Stunde', 'Monat', 'Jahr', 'Stück', 'pauschal')),
  preis_netto      numeric     not null default 0 check (preis_netto >= 0),
  ust_satz         numeric     not null default 20 check (ust_satz in (0, 10, 13, 20)),
  ea_kategorie_id  uuid        references ea_kategorien(id) on delete set null,
  aktiv            boolean     not null default true,
  sortierung       smallint    not null default 0,
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now()
);
comment on table leistungen is 'Fakturierung: Katalog der verrechenbaren Leistungen (Beratungstage, Lizenzen, Schulungen …)';

-- ─── Belege: Angebote, Rechnungen, Gutschriften ───────────────────────────────
create table belege (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  belegart          text        not null check (belegart in ('angebot', 'rechnung', 'gutschrift')),
  nummer            text,
  status            text        not null default 'entwurf' check (status in (
                      'entwurf', 'gesendet', 'angenommen', 'abgelehnt',
                      'gestellt', 'teilbezahlt', 'bezahlt', 'storniert', 'verrechnet')),
  firma_id          uuid        references firmen(id) on delete set null,
  kontakt_id        uuid        references kontakte(id) on delete set null,
  -- Empfänger-Snapshot (bleibt auch bei späteren CRM-Änderungen unverändert)
  empf_name         text        not null default '',
  empf_zusatz       text,
  empf_strasse      text,
  empf_plz          text,
  empf_ort          text,
  empf_land         text        default 'AT',
  empf_uid          text,
  empf_email        text,
  datum             date        not null default current_date,
  leistung_von      date,
  leistung_bis      date,
  faellig_am        date,
  zahlungsziel_tage integer     not null default 14,
  ust_modus         text        not null default 'normal' check (ust_modus in ('normal', 'reverse_charge', 'kleinunternehmer')),
  einleitung        text,
  schlusstext       text,
  interne_notiz     text,
  summe_netto       numeric     not null default 0,
  summe_ust         numeric     not null default 0,
  summe_brutto      numeric     not null default 0,
  bezahlt_betrag    numeric     not null default 0,
  bezahlt_am        date,
  storniert_am      timestamptz,
  storno_grund      text,
  quelle_beleg_id   uuid        references belege(id) on delete set null,
  gesendet_am       timestamptz,
  gesendet_an       text,
  ea_kategorie_id   uuid        references ea_kategorien(id) on delete set null,
  erstellt_von      uuid        references auth.users(id),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now(),
  unique (tenant_id, nummer)
);
comment on table belege is 'Fakturierung: Angebote, Rechnungen und Gutschriften (Kopfdaten + Empfänger-Snapshot)';
comment on column belege.nummer is 'Belegnummer – NULL im Entwurf, wird beim Stellen über get_next_belegnummer vergeben';
comment on column belege.quelle_beleg_id is 'Herkunft: Rechnung aus Angebot bzw. Gutschrift zu Rechnung';

-- ─── Positionen ───────────────────────────────────────────────────────────────
create table beleg_positionen (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  beleg_id          uuid        not null references belege(id) on delete cascade,
  pos               integer     not null default 1,
  leistung_id       uuid        references leistungen(id) on delete set null,
  bezeichnung       text        not null,
  beschreibung      text,
  menge             numeric     not null default 1,
  einheit           text        not null default 'Stunde',
  einzelpreis_netto numeric     not null default 0,
  rabatt_pct        numeric     not null default 0 check (rabatt_pct between 0 and 100),
  ust_satz          numeric     not null default 20 check (ust_satz in (0, 10, 13, 20)),
  summe_netto       numeric     generated always as (round(menge * einzelpreis_netto * (1 - rabatt_pct / 100), 2)) stored
);
comment on table beleg_positionen is 'Fakturierung: Positionen je Beleg (summe_netto wird generiert)';

-- ─── Zahlungen ────────────────────────────────────────────────────────────────
create table beleg_zahlungen (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants(id) on delete cascade,
  beleg_id           uuid        not null references belege(id) on delete cascade,
  datum              date        not null default current_date,
  betrag             numeric     not null check (betrag > 0),
  art                text        not null default 'bank' check (art in ('bank', 'bar', 'karte', 'sonstig')),
  konto_id           uuid        references konten(id) on delete set null,
  ea_transaktion_id  uuid        references ea_transaktionen(id) on delete set null,
  notizen            text,
  erstellt_von       uuid        references auth.users(id),
  erstellt_am        timestamptz not null default now()
);
comment on table beleg_zahlungen is 'Fakturierung: Zahlungseingänge je Rechnung (mit Verweis auf die E&A-Buchung)';

-- ─── Einstellungen: Nummernkreise und Standardtexte ───────────────────────────
alter table tenant_einstellungen
  add column if not exists rechnung_prefix          text    not null default 'RE',
  add column if not exists rechnung_zaehler         integer not null default 1,
  add column if not exists rechnung_stellen         integer not null default 4,
  add column if not exists angebot_prefix           text    not null default 'AN',
  add column if not exists angebot_zaehler          integer not null default 1,
  add column if not exists gutschrift_prefix        text    not null default 'GS',
  add column if not exists gutschrift_zaehler       integer not null default 1,
  add column if not exists rechnung_zahlungsziel    integer not null default 14,
  add column if not exists rechnung_fusstext        text,
  add column if not exists rechnung_einleitung_std  text,
  add column if not exists rechnung_schluss_std     text,
  add column if not exists rechnung_nummer_mit_jahr boolean not null default true;

-- ─── E&A: Buchungen aus Rechnungszahlungen ────────────────────────────────────
alter table ea_transaktionen drop constraint if exists ea_transaktionen_import_quelle_check;
alter table ea_transaktionen add constraint ea_transaktionen_import_quelle_check
  check (import_quelle in ('manuell', 'csv', 'beleg', 'dauerauftrag', 'rechnung'));

-- ─── Trigger: aktualisiert_am ─────────────────────────────────────────────────
create trigger leistungen_aktualisiert before update on leistungen
  for each row execute function update_aktualisiert_am();
create trigger belege_aktualisiert before update on belege
  for each row execute function update_aktualisiert_am();

-- ─── Trigger: Zahlungen → bezahlt_betrag / Status / bezahlt_am ────────────────
create or replace function beleg_zahlungen_summieren()
returns trigger language plpgsql set search_path = public as $$
declare
  v_beleg_id uuid := case when tg_op = 'DELETE' then old.beleg_id else new.beleg_id end;
  v_summe    numeric;
  v_letzte   date;
  v_beleg    belege%rowtype;
begin
  select coalesce(sum(betrag), 0), max(datum) into v_summe, v_letzte
  from beleg_zahlungen where beleg_id = v_beleg_id;

  select * into v_beleg from belege where id = v_beleg_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  update belege set
    bezahlt_betrag = v_summe,
    bezahlt_am     = case when v_summe >= summe_brutto and v_summe > 0 then v_letzte else null end,
    status = case
      when belegart <> 'rechnung' or status in ('entwurf', 'storniert') then status
      when v_summe <= 0 then 'gestellt'
      when v_summe >= summe_brutto then 'bezahlt'
      else 'teilbezahlt'
    end
  where id = v_beleg_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function beleg_zahlungen_summieren() from public, anon, authenticated;

create trigger beleg_zahlungen_summe after insert or delete on beleg_zahlungen
  for each row execute function beleg_zahlungen_summieren();

-- ─── Nummernkreis: Belegnummer ────────────────────────────────────────────────
-- Muster wie get_next_kundennummer: z.B. 'RE-2026-0007' (mit Jahr) oder 'RE-0007'.
create or replace function get_next_belegnummer(p_tenant_id uuid, p_belegart text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text; v_stellen integer; v_zaehler integer; v_mit_jahr boolean;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin', 'mitarbeiter']);
  if p_belegart = 'rechnung' then
    update tenant_einstellungen
    set rechnung_zaehler = rechnung_zaehler + 1
    where tenant_id = p_tenant_id
    returning rechnung_prefix, rechnung_stellen, rechnung_zaehler - 1, rechnung_nummer_mit_jahr
    into v_prefix, v_stellen, v_zaehler, v_mit_jahr;
  elsif p_belegart = 'angebot' then
    update tenant_einstellungen
    set angebot_zaehler = angebot_zaehler + 1
    where tenant_id = p_tenant_id
    returning angebot_prefix, rechnung_stellen, angebot_zaehler - 1, rechnung_nummer_mit_jahr
    into v_prefix, v_stellen, v_zaehler, v_mit_jahr;
  elsif p_belegart = 'gutschrift' then
    update tenant_einstellungen
    set gutschrift_zaehler = gutschrift_zaehler + 1
    where tenant_id = p_tenant_id
    returning gutschrift_prefix, rechnung_stellen, gutschrift_zaehler - 1, rechnung_nummer_mit_jahr
    into v_prefix, v_stellen, v_zaehler, v_mit_jahr;
  else
    raise exception 'Unbekannte Belegart: %', p_belegart;
  end if;
  if not found then return null; end if;
  if v_mit_jahr then
    return v_prefix || '-' || extract(year from current_date)::int || '-' || lpad(v_zaehler::text, v_stellen, '0');
  end if;
  return v_prefix || '-' || lpad(v_zaehler::text, v_stellen, '0');
end;
$$;
revoke execute on function get_next_belegnummer(uuid, text) from public, anon;
grant execute on function get_next_belegnummer(uuid, text) to authenticated, service_role;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table leistungen       enable row level security;
alter table belege           enable row level security;
alter table beleg_positionen enable row level security;
alter table beleg_zahlungen  enable row level security;

create policy "leist_select" on leistungen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "leist_insert" on leistungen for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "leist_update" on leistungen for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "leist_delete" on leistungen for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "belege_select" on belege for select using (tenant_id in (select get_user_tenant_ids()));
create policy "belege_insert" on belege for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "belege_update" on belege for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "belege_delete" on belege for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "belpos_select" on beleg_positionen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "belpos_write" on beleg_positionen for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "belzahl_select" on beleg_zahlungen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "belzahl_write" on beleg_zahlungen for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

-- ─── Indizes ──────────────────────────────────────────────────────────────────
create index idx_leist_tenant        on leistungen(tenant_id, aktiv, sortierung);
create index idx_belege_tenant_datum on belege(tenant_id, datum desc);
create index idx_belege_art_status   on belege(tenant_id, belegart, status);
create index idx_belege_firma        on belege(firma_id);
create index idx_belege_kontakt      on belege(kontakt_id);
create index idx_belege_quelle       on belege(quelle_beleg_id);
create index idx_belpos_beleg        on beleg_positionen(beleg_id, pos);
create index idx_belzahl_beleg       on beleg_zahlungen(beleg_id, datum desc);
create index idx_belzahl_tenant      on beleg_zahlungen(tenant_id, datum desc);
