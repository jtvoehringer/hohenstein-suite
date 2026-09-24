-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 – Grundgerüst: Mandanten, Mitgliedschaften, Profile, Einstellungen
-- Hohenstein Suite | 2026-08-27
--
-- Rollenmodell: admin (Vollzugriff, Benutzer/Einstellungen) · mitarbeiter
-- (anlegen/bearbeiten) · leser (nur lesen). Jeder Datensatz gehört zu einem
-- Mandanten (tenant). Zwei Mandanten sind vorgesehen: „Hohenstein Consulting OG"
-- (Echtdaten) und „Demo-Umgebung" (Beispieldaten, jederzeit zurücksetzbar).
--
-- Härtungsregel für DB-Funktionen: SET search_path = public, REVOKE EXECUTE
-- FROM PUBLIC/anon, Zugriff nur für authenticated (und service_role).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ─── Mandanten ────────────────────────────────────────────────────────────────
create table tenants (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        unique not null,
  ist_demo    boolean     not null default false,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table tenants is 'Mandanten der Suite (Echtbetrieb und Demo-Umgebung)';

create table tenant_memberships (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null check (role in ('admin', 'mitarbeiter', 'leser')),
  aktiv       boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
comment on table tenant_memberships is 'User ↔ Mandant mit Rolle';

create index idx_tenant_memberships_user_id   on tenant_memberships(user_id);
create index idx_tenant_memberships_tenant_id on tenant_memberships(tenant_id);

-- ─── Profile ──────────────────────────────────────────────────────────────────
create table profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  display_name  text,
  full_name     text,
  telefon       text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table profiles is 'Erweiterte Benutzerprofile (1:1 zu auth.users)';

-- ─── Einstellungen je Mandant ─────────────────────────────────────────────────
create table tenant_einstellungen (
  tenant_id               uuid        primary key references tenants(id) on delete cascade,
  anzeigename             text,
  logo_url                text,
  -- Firmendaten (Rechnungs-/Briefkopf, UVA)
  betrieb_name            text,
  betrieb_strasse         text,
  betrieb_plz             text,
  betrieb_ort             text,
  betrieb_telefon         text,
  betrieb_email           text,
  betrieb_website         text,
  betrieb_uid             text,
  betrieb_steuernummer    text,
  betrieb_iban            text,
  betrieb_bic             text,
  -- Kundennummern (CRM)
  kunden_prefix           text        not null default 'K',
  kunden_zaehler          integer     not null default 1,
  kunden_stellen          integer     not null default 4,
  -- E&A-Rechnung
  ust_satz_standard       numeric     not null default 20,
  ea_buchung_modus        text        not null default 'brutto' check (ea_buchung_modus in ('brutto', 'netto')),
  ea_kleinunternehmer     boolean     not null default false,
  ea_uva_zeitraum         text        not null default 'quartalsweise' check (ea_uva_zeitraum in ('monatlich', 'quartalsweise')),
  ea_betriebsbeginn       date,
  -- Sitzung / Hinweise
  session_timeout_minuten integer,
  fristen_vorwarnung_tage smallint    not null default 30,
  aktualisiert_am         timestamptz not null default now()
);
comment on table tenant_einstellungen is 'Mandanteneinstellungen: Firmendaten, Nummernkreise, E&A-Parameter';

-- ─── Trigger-Funktionen ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function update_updated_at() from public, anon, authenticated;

create or replace function update_aktualisiert_am()
returns trigger language plpgsql set search_path = public as $$
begin
  new.aktualisiert_am = now();
  return new;
end;
$$;
revoke execute on function update_aktualisiert_am() from public, anon, authenticated;

create trigger tenants_updated_at before update on tenants
  for each row execute function update_updated_at();
create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger tenant_einstellungen_aktualisiert before update on tenant_einstellungen
  for each row execute function update_aktualisiert_am();

-- ─── Helper: Mandanten des Users, Rollenprüfung ───────────────────────────────
create or replace function get_user_tenant_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select tenant_id from tenant_memberships
  where user_id = auth.uid() and aktiv = true
$$;
revoke execute on function get_user_tenant_ids() from public, anon;
grant execute on function get_user_tenant_ids() to authenticated, service_role;

create or replace function user_has_role_in_tenant(p_tenant_id uuid, p_roles text[])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from tenant_memberships
    where user_id = auth.uid() and tenant_id = p_tenant_id and aktiv = true
      and role = any(p_roles)
  )
$$;
revoke execute on function user_has_role_in_tenant(uuid, text[]) from public, anon;
grant execute on function user_has_role_in_tenant(uuid, text[]) to authenticated, service_role;

-- Service-Role/SQL-Editor/Cron passieren die Zugriffsprüfung automatisch
create or replace function ist_service_kontext()
returns boolean language plpgsql stable set search_path = public as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
begin
  if v_claims is null then
    return nullif(current_setting('request.jwt.claim.role', true), '') is null;
  end if;
  begin
    v_role := v_claims::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;
  return v_role = 'service_role';
end;
$$;
revoke execute on function ist_service_kontext() from public, anon;
grant execute on function ist_service_kontext() to authenticated, service_role;

-- Zentrale Zugriffsprüfung für SECURITY-DEFINER-Funktionen mit p_tenant_id
create or replace function pruefe_tenant_zugriff(p_tenant_id uuid, p_rollen text[] default null)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.ist_service_kontext() then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_tenant_id is null or not exists (
    select 1 from tenant_memberships
    where user_id = auth.uid() and tenant_id = p_tenant_id and aktiv = true
      and (p_rollen is null or role = any(p_rollen))
  ) then
    raise exception 'Kein Zugriff auf diesen Mandanten' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function pruefe_tenant_zugriff(uuid, text[]) from public, anon;
grant execute on function pruefe_tenant_zugriff(uuid, text[]) to authenticated, service_role;

-- ─── Neuer Benutzer: Profil anlegen + Mitgliedschaften nach Domain ────────────
-- Benutzer mit E-Mail-Domain hohenstein-partner.at (bzw. icp-consultants.at)
-- werden automatisch als admin in allen aktiven Mandanten aufgenommen – so
-- genügt eine Einladung über Supabase Auth, ohne manuelle Zuordnung.
create table zugelassene_domains (
  domain  text primary key,
  role    text not null default 'admin' check (role in ('admin', 'mitarbeiter', 'leser'))
);
insert into zugelassene_domains (domain, role) values
  ('hohenstein-partner.at', 'admin'),
  ('icp-consultants.at',    'admin');

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text := lower(split_part(new.email, '@', 2));
  v_role   text;
begin
  insert into profiles (id, display_name, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name')
  )
  on conflict (id) do nothing;

  select role into v_role from zugelassene_domains where domain = v_domain;
  if v_role is not null then
    insert into tenant_memberships (tenant_id, user_id, role)
    select t.id, new.id, v_role from tenants t where t.active = true
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
exception when others then
  return new; -- Fehler nie an die User-Erstellung weitergeben
end;
$$;
revoke execute on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table tenants              enable row level security;
alter table tenant_memberships   enable row level security;
alter table profiles             enable row level security;
alter table tenant_einstellungen enable row level security;
alter table zugelassene_domains  enable row level security;

create policy "tenants: eigene lesen" on tenants
  for select using (id in (select get_user_tenant_ids()));
create policy "tenants: admin aktualisiert" on tenants
  for update using (user_has_role_in_tenant(id, array['admin']));

-- Mitgliedschaften: eigene sehen; admin sieht alle im Mandanten und verwaltet sie
create policy "memberships: eigene lesen" on tenant_memberships
  for select using (user_id = auth.uid());
create policy "memberships: admin liest alle" on tenant_memberships
  for select using (user_has_role_in_tenant(tenant_id, array['admin']));
create policy "memberships: admin insert" on tenant_memberships
  for insert with check (user_has_role_in_tenant(tenant_id, array['admin']));
create policy "memberships: admin update" on tenant_memberships
  for update using (user_has_role_in_tenant(tenant_id, array['admin']) and user_id <> auth.uid());
create policy "memberships: admin delete" on tenant_memberships
  for delete using (user_has_role_in_tenant(tenant_id, array['admin']) and user_id <> auth.uid());

create policy "profiles: eigenes lesen" on profiles
  for select using (id = auth.uid());
create policy "profiles: kollegen lesen" on profiles
  for select using (id in (
    select user_id from tenant_memberships where tenant_id in (select get_user_tenant_ids())
  ));
create policy "profiles: eigenes bearbeiten" on profiles
  for update using (id = auth.uid());
create policy "profiles: eigenes anlegen" on profiles
  for insert with check (id = auth.uid());

create policy "einstellungen: mitglieder lesen" on tenant_einstellungen
  for select using (tenant_id in (select get_user_tenant_ids()));
create policy "einstellungen: admin insert" on tenant_einstellungen
  for insert with check (user_has_role_in_tenant(tenant_id, array['admin']));
create policy "einstellungen: admin update" on tenant_einstellungen
  for update using (user_has_role_in_tenant(tenant_id, array['admin']));

create policy "domains: authentifizierte lesen" on zugelassene_domains
  for select to authenticated using (true);

-- ─── Nummernkreis: Kundennummer ───────────────────────────────────────────────
create or replace function get_next_kundennummer(p_tenant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text; v_stellen integer; v_zaehler integer;
begin
  perform public.pruefe_tenant_zugriff(p_tenant_id, array['admin', 'mitarbeiter']);
  update tenant_einstellungen
  set kunden_zaehler = kunden_zaehler + 1
  where tenant_id = p_tenant_id
  returning kunden_prefix, kunden_stellen, kunden_zaehler - 1
  into v_prefix, v_stellen, v_zaehler;
  if not found then return null; end if;
  return v_prefix || '-' || lpad(v_zaehler::text, v_stellen, '0');
end;
$$;
revoke execute on function get_next_kundennummer(uuid) from public, anon;
grant execute on function get_next_kundennummer(uuid) to authenticated, service_role;

-- ─── Storage: Mandanten-Logos (öffentlich lesbar) ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mandant-logos', 'mandant-logos', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "logos: öffentlich lesen" on storage.objects
  for select using (bucket_id = 'mandant-logos');
create policy "logos: admin hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mandant-logos'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin']));
create policy "logos: admin aktualisieren" on storage.objects
  for update to authenticated
  using (bucket_id = 'mandant-logos'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin']));
create policy "logos: admin löschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mandant-logos'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin']));
