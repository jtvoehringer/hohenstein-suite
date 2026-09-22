-- 022: Benachrichtigungen + Aufgaben „für alle"
--  - aufgaben.fuer_alle: Aufgabe ist dem ganzen Team zugewiesen (Verantwortlich „– Alle –")
--  - benachrichtigungen: In-App-Benachrichtigungen (Glocke) je Empfänger; E-Mail-Versand
--    läuft parallel über den transaktionalen Brevo-Versand (src/lib/benachrichtigungen/server.ts)
--  - profiles.benachrichtigung_email: E-Mail-Benachrichtigungen je Benutzer abschaltbar (Profil)
-- Idempotent.

alter table aufgaben add column if not exists fuer_alle boolean not null default false;
comment on column aufgaben.fuer_alle is 'Aufgabe für alle Team-Mitglieder (Verantwortlich „Alle"); verantwortlich_id ist dann NULL';

alter table profiles add column if not exists benachrichtigung_email boolean not null default true;
comment on column profiles.benachrichtigung_email is 'E-Mail bei Zuweisung/Erwähnung (Aufgaben, Termine) – im Profil abschaltbar';

create table if not exists benachrichtigungen (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  empfaenger_id     uuid        not null references auth.users(id) on delete cascade,
  ausgeloest_von    uuid        references auth.users(id) on delete set null,
  art               text        not null check (art in ('aufgabe_zugewiesen', 'aufgabe_alle', 'erwaehnung', 'system')),
  titel             text        not null,
  text              text,
  href              text,
  quelle_typ        text,
  quelle_id         uuid,
  gelesen_am        timestamptz,
  email_gesendet_am timestamptz,
  erstellt_am       timestamptz not null default now()
);
comment on table benachrichtigungen is 'In-App-Benachrichtigungen (Glocke): Zuweisung, Erwähnung (@Name), Team-Aufgaben';

alter table benachrichtigungen enable row level security;
-- Lesen/Als-gelesen-markieren: nur die eigenen
drop policy if exists "benachr_select" on benachrichtigungen;
create policy "benachr_select" on benachrichtigungen for select using (empfaenger_id = auth.uid());
drop policy if exists "benachr_update" on benachrichtigungen;
create policy "benachr_update" on benachrichtigungen for update
  using (empfaenger_id = auth.uid()) with check (empfaenger_id = auth.uid());
-- Anlegen: Schreibberechtigte des Mandanten (für Kolleginnen/Kollegen desselben Mandanten)
drop policy if exists "benachr_insert" on benachrichtigungen;
create policy "benachr_insert" on benachrichtigungen for insert
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter'])
    and exists (select 1 from tenant_memberships m where m.tenant_id = benachrichtigungen.tenant_id and m.user_id = benachrichtigungen.empfaenger_id and m.aktiv));
drop policy if exists "benachr_delete" on benachrichtigungen;
create policy "benachr_delete" on benachrichtigungen for delete using (empfaenger_id = auth.uid());

create index if not exists idx_benachr_empfaenger_offen on benachrichtigungen (empfaenger_id, erstellt_am desc) where gelesen_am is null;
create index if not exists idx_benachr_empfaenger on benachrichtigungen (empfaenger_id, erstellt_am desc);

-- Mitglieder mit E-Mail (für den Mailversand) – nur Service-Role/Server; Aufruf über Admin-Client
create or replace function mandant_mitglieder_mit_email(p_tenant_id uuid)
returns table(user_id uuid, name text, email text, benachrichtigung_email boolean)
language sql security definer stable set search_path = public as $$
  select m.user_id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.display_name), ''), 'Unbekannt') as name,
         u.email::text,
         coalesce(p.benachrichtigung_email, true)
  from tenant_memberships m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.tenant_id = p_tenant_id and m.aktiv = true
$$;
revoke execute on function mandant_mitglieder_mit_email(uuid) from public, anon, authenticated;
grant execute on function mandant_mitglieder_mit_email(uuid) to service_role;
