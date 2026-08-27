-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 – E&A-Rechnung (Einnahmen-Ausgaben-Rechnung, § 4 Abs. 3 EStG)
-- Hohenstein Suite | 2026-08-27
-- Abgeleitet aus software:112 (Migrationen 099/144/146/162–168/180), ohne
-- Weinhandels-Bezüge (Verkaufsposten, Zahlungen, SumUp).
--
-- Tabellen: ea_kategorien · ea_transaktionen · ea_belege · ea_dauerauftraege ·
-- ea_dauerauftrag_log · ea_monatsabschluss · ea_uva · konten · konto_umbuchungen
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Kategorien (tenant_id NULL = Standardvorlage für alle Mandanten) ─────────
create table ea_kategorien (
  id               uuid     primary key default gen_random_uuid(),
  tenant_id        uuid     references tenants(id) on delete cascade,
  typ              text     not null check (typ in ('einnahme', 'ausgabe', 'beides')),
  name             text     not null,
  konto_nr         smallint,
  ust_satz_std     numeric  not null default 20 check (ust_satz_std in (0, 10, 13, 20)),
  abzugsfaehig_pct numeric  not null default 100 check (abzugsfaehig_pct between 0 and 100),
  aktiv            boolean  not null default true,
  sortierung       smallint not null default 0,
  unique (tenant_id, name)
);
comment on table ea_kategorien is 'E&A: Einnahmen-/Ausgabenkategorien (Kontenrahmen light)';

insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung) values
  (null, 'einnahme', 'Beratungshonorare',                 4000, 20, 100,  10),
  (null, 'einnahme', 'Softwarelizenzen / SaaS',           4100, 20, 100,  20),
  (null, 'einnahme', 'Projekt- und Implementierungserlöse', 4200, 20, 100, 30),
  (null, 'einnahme', 'Schulungen & Workshops',            4300, 20, 100,  40),
  (null, 'einnahme', 'Erlöse EU-Ausland (Reverse Charge)', 4400,  0, 100,  50),
  (null, 'einnahme', 'Sonstige Betriebseinnahmen',        4800, 20, 100,  90),
  (null, 'ausgabe',  'Fremdleistungen / Subunternehmer',  5700, 20, 100, 100),
  (null, 'ausgabe',  'Software & Cloud-Dienste',          7300, 20, 100, 110),
  (null, 'ausgabe',  'Hardware & Büroausstattung',        7310, 20, 100, 115),
  (null, 'ausgabe',  'Telefon & Internet',                7380, 20, 100, 120),
  (null, 'ausgabe',  'Büro & Verwaltung',                 7800, 20, 100, 130),
  (null, 'ausgabe',  'Miete & Betriebskosten',            7000,  0, 100, 140),
  (null, 'ausgabe',  'Fahrzeug & Reisekosten',            7600, 20, 100, 150),
  (null, 'ausgabe',  'Bewirtung / Repräsentation',        7650, 10,  50, 155),
  (null, 'ausgabe',  'Marketing & Werbung',               7900, 20, 100, 160),
  (null, 'ausgabe',  'Steuer- & Rechtsberatung',          7750, 20, 100, 170),
  (null, 'ausgabe',  'Versicherungen',                    7500,  0, 100, 180),
  (null, 'ausgabe',  'Bankspesen & Gebühren',             7700,  0, 100, 190),
  (null, 'ausgabe',  'Personalkosten',                    6000,  0, 100, 200),
  (null, 'ausgabe',  'Weiterbildung',                     7620, 20, 100, 210),
  (null, 'ausgabe',  'Sonstige Betriebsausgaben',         7990, 20, 100, 290);

-- ─── Konten (Bank, Kassa) ─────────────────────────────────────────────────────
create table konten (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  name              text        not null,
  iban              text,
  typ               text        not null default 'giro' check (typ in ('giro', 'kreditkarte', 'kassa', 'sonstiges')),
  eroeffnungsdatum  date        not null default current_date,
  eroeffnungssaldo  numeric     not null default 0,
  aktiv             boolean     not null default true,
  sortierung        smallint    not null default 0,
  erstellt_am       timestamptz not null default now()
);
comment on table konten is 'E&A: Bank-/Kassakonten für die Kontoabstimmung';

-- ─── Daueraufträge ────────────────────────────────────────────────────────────
create table ea_dauerauftraege (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references tenants(id) on delete cascade,
  typ                  text        not null check (typ in ('einnahme', 'ausgabe')),
  beschreibung         text        not null,
  kategorie_id         uuid        references ea_kategorien(id) on delete set null,
  konto_id             uuid        references konten(id) on delete set null,
  betrag_netto         numeric     not null check (betrag_netto > 0),
  ust_satz             numeric     not null default 20 check (ust_satz in (0, 10, 13, 20)),
  intervall            text        not null default 'monatlich' check (intervall in ('monatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich')),
  tag_im_monat         smallint    not null default 1 check (tag_im_monat between 1 and 28),
  naechste_faelligkeit date        not null,
  aktiv                boolean     not null default true,
  notizen              text,
  erstellt_am          timestamptz not null default now()
);

-- ─── Buchungen ────────────────────────────────────────────────────────────────
create table ea_transaktionen (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants(id) on delete cascade,
  typ                text        not null check (typ in ('einnahme', 'ausgabe')),
  datum              date        not null,
  beschreibung       text        not null,
  kategorie_id       uuid        references ea_kategorien(id) on delete set null,
  firma_id           uuid        references firmen(id) on delete set null,
  konto_id           uuid        references konten(id) on delete set null,
  betrag_netto       numeric     not null check (betrag_netto >= 0),
  ust_satz           numeric     not null default 20 check (ust_satz in (0, 10, 13, 20)),
  ust_betrag         numeric     generated always as (round(betrag_netto * ust_satz / 100, 2)) stored,
  betrag_brutto      numeric     generated always as (betrag_netto + round(betrag_netto * ust_satz / 100, 2)) stored,
  abzugsfaehig_pct   numeric     not null default 100 check (abzugsfaehig_pct between 0 and 100),
  betrag_abzugsfaehig numeric    generated always as (round(betrag_netto * abzugsfaehig_pct / 100, 2)) stored,
  belegnummer        text,
  is_locked          boolean     not null default false,
  abgeglichen        boolean     not null default false,
  dauerauftrag_id    uuid        references ea_dauerauftraege(id) on delete set null,
  import_quelle      text        not null default 'manuell' check (import_quelle in ('manuell', 'csv', 'beleg', 'dauerauftrag')),
  bank_ref           text,
  notizen            text,
  erstellt_von       uuid        references auth.users(id),
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now(),
  unique (tenant_id, bank_ref)
);
comment on table ea_transaktionen is 'E&A: Einnahmen und Ausgaben (Netto + USt, brutto generiert)';

create trigger ea_transaktionen_aktualisiert before update on ea_transaktionen
  for each row execute function update_aktualisiert_am();

-- Gesperrte Buchungen (Monatsabschluss/UVA) dürfen fachlich nicht mehr verändert
-- werden. Erlaubt bleiben Kontoabstimmung (abgeglichen), Kontozuordnung und Notizen.
create or replace function ea_transaktion_sperre_pruefen()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_locked and not public.ist_service_kontext() then
      raise exception 'Buchung ist gesperrt (Monatsabschluss/UVA) und kann nicht gelöscht werden.';
    end if;
    return old;
  end if;
  if old.is_locked and not public.ist_service_kontext() then
    if new.typ <> old.typ or new.datum <> old.datum or new.beschreibung <> old.beschreibung
       or new.betrag_netto <> old.betrag_netto or new.ust_satz <> old.ust_satz
       or new.abzugsfaehig_pct <> old.abzugsfaehig_pct
       or coalesce(new.kategorie_id::text, '') <> coalesce(old.kategorie_id::text, '')
       or new.is_locked = false then
      raise exception 'Buchung ist gesperrt (Monatsabschluss/UVA) und kann nicht mehr geändert werden.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function ea_transaktion_sperre_pruefen() from public, anon, authenticated;

create trigger ea_transaktionen_sperre before update or delete on ea_transaktionen
  for each row execute function ea_transaktion_sperre_pruefen();

-- ─── Belege (Upload + optionale KI-Erkennung) ─────────────────────────────────
create table ea_belege (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants(id) on delete cascade,
  ea_transaktion_id  uuid        references ea_transaktionen(id) on delete set null,
  dateiname          text        not null,
  dateityp           text        not null,
  groesse_bytes      integer,
  storage_pfad       text        not null,
  status             text        not null default 'erkannt' check (status in ('erkannt', 'verbucht', 'fehler')),
  erkannte_daten     jsonb,
  fehler_details     text,
  hochgeladen_von    uuid        references auth.users(id),
  hochgeladen_am     timestamptz not null default now(),
  verbucht_am        timestamptz
);
comment on table ea_belege is 'E&A: hochgeladene Belege (PDF/Foto) mit erkannten Buchungsdaten';

create table ea_dauerauftrag_log (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants(id) on delete cascade,
  dauerauftrag_id    uuid        not null references ea_dauerauftraege(id) on delete cascade,
  status             text        not null check (status in ('erstellt', 'uebersprungen', 'fehler')),
  ea_transaktion_id  uuid        references ea_transaktionen(id) on delete set null,
  fehler_details     text,
  erstellt_am        timestamptz not null default now()
);

-- ─── Monatsabschluss und UVA ──────────────────────────────────────────────────
create table ea_monatsabschluss (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  jahr              smallint    not null,
  monat             smallint    not null check (monat between 1 and 12),
  abgeschlossen_am  timestamptz not null default now(),
  abgeschlossen_von uuid        references auth.users(id),
  unique (tenant_id, jahr, monat)
);

create table ea_uva (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants(id) on delete cascade,
  jahr         smallint    not null,
  zeitraum     text        not null,   -- 'Q1'…'Q4' oder '01'…'12'
  bmgl_ust_0   numeric     not null default 0,
  bmgl_ust_10  numeric     not null default 0,
  bmgl_ust_13  numeric     not null default 0,
  bmgl_ust_20  numeric     not null default 0,
  ust_10       numeric     not null default 0,
  ust_13       numeric     not null default 0,
  ust_20       numeric     not null default 0,
  ust_gesamt   numeric     generated always as (ust_10 + ust_13 + ust_20) stored,
  vst_10       numeric     not null default 0,
  vst_13       numeric     not null default 0,
  vst_20       numeric     not null default 0,
  vst_gesamt   numeric     generated always as (vst_10 + vst_13 + vst_20) stored,
  zahllast     numeric     generated always as ((ust_10 + ust_13 + ust_20) - (vst_10 + vst_13 + vst_20)) stored,
  gesperrt     boolean     not null default false,
  gesperrt_am  timestamptz,
  notizen      text,
  erstellt_am  timestamptz not null default now(),
  unique (tenant_id, jahr, zeitraum)
);
comment on table ea_uva is 'E&A: Umsatzsteuervoranmeldung je Periode (gesperrt = übermittelt)';

-- ─── Umbuchungen zwischen Konten ──────────────────────────────────────────────
create table konto_umbuchungen (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references tenants(id) on delete cascade,
  von_konto_id     uuid        not null references konten(id) on delete cascade,
  nach_konto_id    uuid        not null references konten(id) on delete cascade,
  betrag           numeric     not null check (betrag > 0),
  datum            date        not null default current_date,
  beschreibung     text,
  von_abgeglichen  boolean     not null default false,
  nach_abgeglichen boolean     not null default false,
  erstellt_von     uuid        references auth.users(id),
  erstellt_am      timestamptz not null default now(),
  check (von_konto_id <> nach_konto_id)
);

-- ─── Funktionen ───────────────────────────────────────────────────────────────

-- Liegt das Datum in einem offenen Zeitraum (kein Monatsabschluss, keine übermittelte UVA)?
create or replace function pruefe_ea_zeitraum_offen(p_tenant_id uuid, p_datum date)
returns table(offen boolean, grund text)
language plpgsql security definer set search_path = public as $$
declare
  v_jahr    smallint := extract(year  from p_datum)::smallint;
  v_monat   smallint := extract(month from p_datum)::smallint;
  v_quartal text     := 'Q' || ceil(v_monat / 3.0)::int;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id);
  if exists (select 1 from ea_monatsabschluss where tenant_id = p_tenant_id and jahr = v_jahr and monat = v_monat) then
    return query select false, format('Monat %s/%s ist bereits abgeschlossen.', v_monat, v_jahr);
    return;
  end if;
  if exists (
    select 1 from ea_uva
    where tenant_id = p_tenant_id and jahr = v_jahr and gesperrt = true
      and zeitraum in (v_quartal, lpad(v_monat::text, 2, '0'))
  ) then
    return query select false, 'Zeitraum wurde bereits per UVA übermittelt.';
    return;
  end if;
  return query select true, null::text;
end;
$$;
revoke execute on function pruefe_ea_zeitraum_offen(uuid, date) from public, anon;
grant execute on function pruefe_ea_zeitraum_offen(uuid, date) to authenticated, service_role;

-- UVA-Kennzahlen für eine Periode berechnen
create or replace function berechne_ea_uva(p_tenant_id uuid, p_jahr smallint, p_zeitraum text)
returns table(bmgl_0 numeric, bmgl_10 numeric, bmgl_13 numeric, bmgl_20 numeric,
              ust_10 numeric, ust_13 numeric, ust_20 numeric,
              vst_10 numeric, vst_13 numeric, vst_20 numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_von date; v_bis date;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id);
  if p_zeitraum in ('Q1','Q2','Q3','Q4') then
    v_von := make_date(p_jahr, (case p_zeitraum when 'Q1' then 1 when 'Q2' then 4 when 'Q3' then 7 else 10 end), 1);
    v_bis := (v_von + interval '3 months' - interval '1 day')::date;
  else
    v_von := make_date(p_jahr, p_zeitraum::smallint, 1);
    v_bis := (v_von + interval '1 month' - interval '1 day')::date;
  end if;
  return query
  select
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=0  then t.betrag_netto else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=10 then t.betrag_netto else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=13 then t.betrag_netto else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=20 then t.betrag_netto else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=10 then t.ust_betrag else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=13 then t.ust_betrag else 0 end), 0),
    coalesce(sum(case when t.typ='einnahme' and t.ust_satz=20 then t.ust_betrag else 0 end), 0),
    coalesce(sum(case when t.typ='ausgabe'  and t.ust_satz=10 then round(t.ust_betrag * t.abzugsfaehig_pct / 100, 2) else 0 end), 0),
    coalesce(sum(case when t.typ='ausgabe'  and t.ust_satz=13 then round(t.ust_betrag * t.abzugsfaehig_pct / 100, 2) else 0 end), 0),
    coalesce(sum(case when t.typ='ausgabe'  and t.ust_satz=20 then round(t.ust_betrag * t.abzugsfaehig_pct / 100, 2) else 0 end), 0)
  from ea_transaktionen t
  where t.tenant_id = p_tenant_id and t.datum between v_von and v_bis;
end;
$$;
revoke execute on function berechne_ea_uva(uuid, smallint, text) from public, anon;
grant execute on function berechne_ea_uva(uuid, smallint, text) to authenticated, service_role;

-- Monat abschließen: Buchungen sperren + Abschluss protokollieren
create or replace function sperre_ea_monat(p_tenant_id uuid, p_jahr smallint, p_monat smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_von date; v_bis date;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin']);
  v_von := make_date(p_jahr, p_monat, 1);
  v_bis := (v_von + interval '1 month' - interval '1 day')::date;
  update ea_transaktionen set is_locked = true
  where tenant_id = p_tenant_id and datum between v_von and v_bis and is_locked = false;
  insert into ea_monatsabschluss (tenant_id, jahr, monat, abgeschlossen_von)
  values (p_tenant_id, p_jahr, p_monat, auth.uid())
  on conflict (tenant_id, jahr, monat) do nothing;
end;
$$;
revoke execute on function sperre_ea_monat(uuid, smallint, smallint) from public, anon;
grant execute on function sperre_ea_monat(uuid, smallint, smallint) to authenticated, service_role;

-- Monatsabschluss aufheben (nur solange keine UVA der Periode übermittelt ist)
create or replace function oeffne_ea_monat(p_tenant_id uuid, p_jahr smallint, p_monat smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_von date; v_bis date;
  v_quartal text := 'Q' || ceil(p_monat / 3.0)::int;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin']);
  if exists (
    select 1 from ea_uva where tenant_id = p_tenant_id and jahr = p_jahr and gesperrt = true
      and zeitraum in (v_quartal, lpad(p_monat::text, 2, '0'))
  ) then
    raise exception 'Der Zeitraum wurde bereits per UVA übermittelt und kann nicht mehr geöffnet werden.';
  end if;
  v_von := make_date(p_jahr, p_monat, 1);
  v_bis := (v_von + interval '1 month' - interval '1 day')::date;
  delete from ea_monatsabschluss where tenant_id = p_tenant_id and jahr = p_jahr and monat = p_monat;
  -- Trigger erlaubt is_locked=false nur im Service-Kontext – daher hier über SECURITY DEFINER
  -- mit explizitem Umweg: Trigger temporär umgehen, indem die Sperrprüfung deaktiviert wird.
  perform set_config('hs.sperre_umgehen', 'on', true);
  update ea_transaktionen set is_locked = false
  where tenant_id = p_tenant_id and datum between v_von and v_bis;
  perform set_config('hs.sperre_umgehen', 'off', true);
end;
$$;
revoke execute on function oeffne_ea_monat(uuid, smallint, smallint) from public, anon;
grant execute on function oeffne_ea_monat(uuid, smallint, smallint) to authenticated, service_role;

-- Sperrprüfung um die Umgehung (nur innerhalb oeffne_ea_monat) ergänzen
create or replace function ea_transaktion_sperre_pruefen()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('hs.sperre_umgehen', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.is_locked and not public.ist_service_kontext() then
      raise exception 'Buchung ist gesperrt (Monatsabschluss/UVA) und kann nicht gelöscht werden.';
    end if;
    return old;
  end if;
  if old.is_locked and not public.ist_service_kontext() then
    if new.typ <> old.typ or new.datum <> old.datum or new.beschreibung <> old.beschreibung
       or new.betrag_netto <> old.betrag_netto or new.ust_satz <> old.ust_satz
       or new.abzugsfaehig_pct <> old.abzugsfaehig_pct
       or coalesce(new.kategorie_id::text, '') <> coalesce(old.kategorie_id::text, '')
       or new.is_locked = false then
      raise exception 'Buchung ist gesperrt (Monatsabschluss/UVA) und kann nicht mehr geändert werden.';
    end if;
  end if;
  return new;
end;
$$;

-- UVA übermitteln/sperren: setzt vollständige Monatsabschlüsse der Periode voraus
create or replace function sperre_ea_uva(p_tenant_id uuid, p_jahr smallint, p_zeitraum text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_von date; v_bis date;
  v_monate smallint[]; v_monat smallint;
  v_fehlende smallint[] := '{}';
  v_beginn date;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin']);
  select ea_betriebsbeginn into v_beginn from tenant_einstellungen where tenant_id = p_tenant_id;

  if p_zeitraum in ('Q1','Q2','Q3','Q4') then
    v_von := make_date(p_jahr, (case p_zeitraum when 'Q1' then 1 when 'Q2' then 4 when 'Q3' then 7 else 10 end), 1);
    v_bis := (v_von + interval '3 months' - interval '1 day')::date;
    v_monate := array[
      extract(month from v_von)::smallint,
      extract(month from v_von + interval '1 month')::smallint,
      extract(month from v_von + interval '2 months')::smallint];
  else
    v_von := make_date(p_jahr, p_zeitraum::smallint, 1);
    v_bis := (v_von + interval '1 month' - interval '1 day')::date;
    v_monate := array[p_zeitraum::smallint];
  end if;

  foreach v_monat in array v_monate loop
    -- Monate, die vollständig vor dem Betriebsbeginn enden, brauchen keinen Abschluss
    if v_beginn is not null
       and (make_date(p_jahr, v_monat, 1) + interval '1 month' - interval '1 day')::date < v_beginn then
      continue;
    end if;
    if not exists (select 1 from ea_monatsabschluss where tenant_id = p_tenant_id and jahr = p_jahr and monat = v_monat) then
      v_fehlende := array_append(v_fehlende, v_monat);
    end if;
  end loop;

  if array_length(v_fehlende, 1) > 0 then
    raise exception 'Monatsabschluss fehlt für Monat(e) % / % – die UVA kann erst übermittelt werden, wenn alle Monate dieser Periode abgeschlossen sind.',
      array_to_string(v_fehlende, ', '), p_jahr;
  end if;

  update ea_transaktionen set is_locked = true
  where tenant_id = p_tenant_id and datum between v_von and v_bis and is_locked = false;

  update ea_uva set gesperrt = true, gesperrt_am = now()
  where tenant_id = p_tenant_id and jahr = p_jahr and zeitraum = p_zeitraum;
end;
$$;
revoke execute on function sperre_ea_uva(uuid, smallint, text) from public, anon;
grant execute on function sperre_ea_uva(uuid, smallint, text) to authenticated, service_role;

-- Daueraufträge ausführen (Cron, Service-Kontext)
create or replace function process_ea_dauerauftraege()
returns table(verarbeitet integer, erstellt integer, uebersprungen integer, fehler integer)
language plpgsql security definer set search_path = public as $$
declare
  r ea_dauerauftraege%rowtype;
  v_neue_id uuid; v_pruef record;
  v_verarbeitet int := 0; v_erstellt int := 0; v_uebersprungen int := 0; v_fehler int := 0;
begin
  for r in select * from ea_dauerauftraege where aktiv = true and naechste_faelligkeit <= current_date loop
    v_verarbeitet := v_verarbeitet + 1;
    begin
      select * into v_pruef from pruefe_ea_zeitraum_offen(r.tenant_id, r.naechste_faelligkeit);
      if not v_pruef.offen then
        insert into ea_dauerauftrag_log (tenant_id, dauerauftrag_id, status, fehler_details)
        values (r.tenant_id, r.id, 'uebersprungen', v_pruef.grund);
        v_uebersprungen := v_uebersprungen + 1;
      else
        insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, betrag_netto, ust_satz,
                                      dauerauftrag_id, konto_id, import_quelle, abzugsfaehig_pct)
        select r.tenant_id, r.typ, r.naechste_faelligkeit, r.beschreibung, r.kategorie_id, r.betrag_netto, r.ust_satz,
               r.id, r.konto_id, 'dauerauftrag', coalesce(k.abzugsfaehig_pct, 100)
        from (select 1) x left join ea_kategorien k on k.id = r.kategorie_id
        returning id into v_neue_id;
        insert into ea_dauerauftrag_log (tenant_id, dauerauftrag_id, status, ea_transaktion_id)
        values (r.tenant_id, r.id, 'erstellt', v_neue_id);
        v_erstellt := v_erstellt + 1;
      end if;
      -- Fälligkeit in beiden Fällen weiterrücken
      update ea_dauerauftraege set naechste_faelligkeit =
        case r.intervall
          when 'monatlich'        then r.naechste_faelligkeit + interval '1 month'
          when 'vierteljaehrlich' then r.naechste_faelligkeit + interval '3 months'
          when 'halbjaehrlich'    then r.naechste_faelligkeit + interval '6 months'
          when 'jaehrlich'        then r.naechste_faelligkeit + interval '1 year'
        end
      where id = r.id;
    exception when others then
      insert into ea_dauerauftrag_log (tenant_id, dauerauftrag_id, status, fehler_details)
      values (r.tenant_id, r.id, 'fehler', sqlerrm);
      v_fehler := v_fehler + 1;
    end;
  end loop;
  return query select v_verarbeitet, v_erstellt, v_uebersprungen, v_fehler;
end;
$$;
revoke execute on function process_ea_dauerauftraege() from public, anon, authenticated;
grant execute on function process_ea_dauerauftraege() to service_role;

-- Kontoabstimmung: Bewegung als abgeglichen markieren
create or replace function setze_kontobewegung_abgeglichen(p_tenant_id uuid, p_quelle text, p_id uuid, p_abgeglichen boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin', 'mitarbeiter']);
  if p_quelle = 'ea_transaktion' then
    update ea_transaktionen set abgeglichen = p_abgeglichen where id = p_id and tenant_id = p_tenant_id;
  elsif p_quelle = 'umbuchung_von' then
    update konto_umbuchungen set von_abgeglichen = p_abgeglichen where id = p_id and tenant_id = p_tenant_id;
  elsif p_quelle = 'umbuchung_nach' then
    update konto_umbuchungen set nach_abgeglichen = p_abgeglichen where id = p_id and tenant_id = p_tenant_id;
  else
    raise exception 'Unbekannte Quelle: %', p_quelle;
  end if;
end;
$$;
revoke execute on function setze_kontobewegung_abgeglichen(uuid, text, uuid, boolean) from public, anon;
grant execute on function setze_kontobewegung_abgeglichen(uuid, text, uuid, boolean) to authenticated, service_role;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table ea_kategorien       enable row level security;
alter table konten              enable row level security;
alter table ea_dauerauftraege   enable row level security;
alter table ea_transaktionen    enable row level security;
alter table ea_belege           enable row level security;
alter table ea_dauerauftrag_log enable row level security;
alter table ea_monatsabschluss  enable row level security;
alter table ea_uva              enable row level security;
alter table konto_umbuchungen   enable row level security;

create policy "eakat_select" on ea_kategorien for select
  using (tenant_id is null or tenant_id in (select get_user_tenant_ids()));
create policy "eakat_insert" on ea_kategorien for insert
  with check (tenant_id is not null and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eakat_update" on ea_kategorien for update
  using (tenant_id is not null and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eakat_delete" on ea_kategorien for delete
  using (tenant_id is not null and user_has_role_in_tenant(tenant_id, array['admin']));

create policy "konten_select" on konten for select using (tenant_id in (select get_user_tenant_ids()));
create policy "konten_write" on konten for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "eada_select" on ea_dauerauftraege for select using (tenant_id in (select get_user_tenant_ids()));
create policy "eada_write" on ea_dauerauftraege for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "eatx_select" on ea_transaktionen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "eatx_insert" on ea_transaktionen for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eatx_update" on ea_transaktionen for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eatx_delete" on ea_transaktionen for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "eabel_select" on ea_belege for select using (tenant_id in (select get_user_tenant_ids()));
create policy "eabel_write" on ea_belege for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "ealog_select" on ea_dauerauftrag_log for select using (tenant_id in (select get_user_tenant_ids()));

create policy "eama_select" on ea_monatsabschluss for select using (tenant_id in (select get_user_tenant_ids()));

create policy "eauva_select" on ea_uva for select using (tenant_id in (select get_user_tenant_ids()));
create policy "eauva_insert" on ea_uva for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eauva_update" on ea_uva for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "eauva_delete" on ea_uva for delete using (user_has_role_in_tenant(tenant_id, array['admin']) and gesperrt = false);

create policy "umb_select" on konto_umbuchungen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "umb_write" on konto_umbuchungen for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

-- ─── Indizes ──────────────────────────────────────────────────────────────────
create index idx_eatx_tenant_datum on ea_transaktionen(tenant_id, datum desc);
create index idx_eatx_kategorie    on ea_transaktionen(kategorie_id);
create index idx_eatx_konto        on ea_transaktionen(tenant_id, konto_id);
create index idx_eatx_firma        on ea_transaktionen(firma_id);
create index idx_eabel_tenant      on ea_belege(tenant_id, hochgeladen_am desc);
create index idx_eabel_tx          on ea_belege(ea_transaktion_id);
create index idx_eada_faellig      on ea_dauerauftraege(aktiv, naechste_faelligkeit);
create index idx_ealog_da          on ea_dauerauftrag_log(dauerauftrag_id, erstellt_am desc);
create index idx_umb_tenant        on konto_umbuchungen(tenant_id, datum desc);
create index idx_konten_tenant     on konten(tenant_id, sortierung);

-- ─── Storage: Belege (Pfad: <tenant_id>/<datei>) ──────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ea-belege', 'ea-belege', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "belege: mitglieder lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'ea-belege' and ((storage.foldername(name))[1])::uuid in (select get_user_tenant_ids()));
create policy "belege: schreibend hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ea-belege'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
create policy "belege: schreibend löschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ea-belege'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
