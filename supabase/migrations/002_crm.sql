-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 – CRM: Firmen, Kontakte, Aktivitäten (Kalender), Pipeline
-- Hohenstein Suite | 2026-08-27
-- Abgeleitet aus software:112 (Migrationen 019/020/027/028/034/035/104/156/158),
-- ohne Weinhandels-Bezüge (Rabattgruppen, Skonto, Newsletter/Brevo, Verkäufe).
-- ─────────────────────────────────────────────────────────────────────────────

-- Segmente: mit wem hat Hohenstein Consulting zu tun?
create type kundensegment as enum ('weinbau', 'gastronomie', 'handel', 'beratung', 'partner', 'lieferant', 'sonstiges');

-- ─── Firmen ───────────────────────────────────────────────────────────────────
create table firmen (
  id                uuid          primary key default gen_random_uuid(),
  tenant_id         uuid          not null references tenants(id) on delete cascade,
  kundennummer      text,
  name              text          not null,
  segment           kundensegment not null default 'weinbau',
  strasse           text,
  plz               text,
  ort               text,
  land              text          default 'AT',
  telefon_vorwahl   varchar       default '+43',
  telefon           text,
  email             text,
  website           text,
  uid_nummer        text,
  zahlungsziel_tage integer       not null default 14,
  is_lead           boolean       not null default true,
  ist_kunde         boolean       not null default true,
  ist_lieferant     boolean       not null default false,
  notizen           text,
  aktiv             boolean       not null default true,
  erstellt_am       timestamptz   not null default now(),
  aktualisiert_am   timestamptz   not null default now()
);
comment on table firmen is 'CRM: Unternehmen (Weinbaubetriebe, Partner, Lieferanten …)';

-- ─── Kontakte (Personen) ──────────────────────────────────────────────────────
create table kontakte (
  id                    uuid          primary key default gen_random_uuid(),
  tenant_id             uuid          not null references tenants(id) on delete cascade,
  kundennummer          text,
  vorname               text,
  nachname              text          not null,
  segment               kundensegment not null default 'weinbau',
  firma_id              uuid          references firmen(id) on delete set null,
  position              text,
  email                 text,
  telefon_vorwahl       varchar       default '+43',
  telefon               text,
  mobil_vorwahl         varchar       default '+43',
  mobil                 text,
  strasse               text,
  plz                   text,
  ort                   text,
  land                  text          default 'AT',
  geburtsdatum          date,
  sprache               text          default 'de',
  ansprechpartner_intern text,
  is_lead               boolean       not null default true,
  notizen               text,
  aktiv                 boolean       not null default true,
  erstellt_am           timestamptz   not null default now(),
  aktualisiert_am       timestamptz   not null default now()
);
comment on table kontakte is 'CRM: Personen (Ansprechpartner, Einzelkunden)';

create table kontakt_firmen (
  id            uuid    primary key default gen_random_uuid(),
  kontakt_id    uuid    not null references kontakte(id) on delete cascade,
  firma_id      uuid    not null references firmen(id) on delete cascade,
  position      text,
  hauptkontakt  boolean not null default false,
  unique (kontakt_id, firma_id)
);

-- ─── Aktivitäten (Kalender + Kommunikations-Log) ──────────────────────────────
create table aktivitaeten (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references tenants(id) on delete cascade,
  kontakt_id            uuid        references kontakte(id) on delete set null,
  firma_id              uuid        references firmen(id) on delete set null,
  art                   text        not null check (art in (
                          'notiz','email','anruf','aufgabe','besprechung','demo','messe',
                          'besuch','angebot','sonstiges','urlaub','abwesenheit')),
  betreff               text,
  beschreibung          text,
  datum                 date        not null default current_date,
  bis_datum             date,
  ganztags              boolean     not null default true,
  uhrzeit_von           time,
  uhrzeit_bis           time,
  erledigt              boolean     not null default true,
  faellig_am            date,
  ist_privat            boolean     not null default false,
  -- E-Mail-Verknüpfung (Nachrichten-Modul)
  email_id              text        unique,
  email_conversation_id text,
  email_von             text,
  email_von_name        text,
  email_an              text,
  email_body            text,
  email_body_html       text,
  erstellt_von          uuid        references auth.users(id),
  erstellt_am           timestamptz not null default now()
);
comment on table aktivitaeten is 'CRM: Termine, Aufgaben und Kommunikations-Log je Kontakt/Firma';

create table aktivitaet_dokumente (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants(id) on delete cascade,
  aktivitaet_id  uuid        not null references aktivitaeten(id) on delete cascade,
  dateiname      text        not null,
  dateityp       text        not null,
  groesse_bytes  integer,
  storage_pfad   text        not null,
  erstellt_von   uuid        references auth.users(id),
  erstellt_am    timestamptz not null default now()
);

-- ─── Pipeline (Verkaufschancen) ───────────────────────────────────────────────
create type pipeline_stufe as enum (
  'interessent', 'kontaktiert', 'demo', 'angebot', 'verhandlung', 'abschluss', 'bestandskunde', 'verloren'
);

create table pipeline_eintraege (
  id                 uuid           primary key default gen_random_uuid(),
  tenant_id          uuid           not null references tenants(id) on delete cascade,
  kontakt_id         uuid           references kontakte(id) on delete set null,
  firma_id           uuid           references firmen(id) on delete set null,
  stufe              pipeline_stufe not null default 'interessent',
  titel              text           not null,
  kategorie          text,
  wert_euro          numeric(10,2),
  wahrscheinlichkeit integer        check (wahrscheinlichkeit between 0 and 100),
  erwartetes_datum   date,
  ganztags           boolean        default true,
  uhrzeit_von        time,
  uhrzeit_bis        time,
  erledigt           boolean        not null default false,
  erledigt_am        timestamptz,
  notizen            text,
  erstellt_am        timestamptz    not null default now(),
  aktualisiert_am    timestamptz    not null default now()
);
comment on table pipeline_eintraege is 'CRM: Verkaufschancen nach Stufen';

create table pipeline_verlauf (
  id             uuid           primary key default gen_random_uuid(),
  pipeline_id    uuid           not null references pipeline_eintraege(id) on delete cascade,
  stufe_von      pipeline_stufe,
  stufe_nach     pipeline_stufe not null,
  notizen        text,
  geaendert_von  uuid           references auth.users(id),
  geaendert_am   timestamptz    not null default now()
);

-- ─── Trigger ──────────────────────────────────────────────────────────────────
create trigger firmen_aktualisiert before update on firmen
  for each row execute function update_aktualisiert_am();
create trigger kontakte_aktualisiert before update on kontakte
  for each row execute function update_aktualisiert_am();
create trigger pipeline_aktualisiert before update on pipeline_eintraege
  for each row execute function update_aktualisiert_am();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table firmen               enable row level security;
alter table kontakte             enable row level security;
alter table kontakt_firmen       enable row level security;
alter table aktivitaeten         enable row level security;
alter table aktivitaet_dokumente enable row level security;
alter table pipeline_eintraege   enable row level security;
alter table pipeline_verlauf     enable row level security;

create policy "firmen_select" on firmen for select using (tenant_id in (select get_user_tenant_ids()));
create policy "firmen_insert" on firmen for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "firmen_update" on firmen for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "firmen_delete" on firmen for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "kontakte_select" on kontakte for select using (tenant_id in (select get_user_tenant_ids()));
create policy "kontakte_insert" on kontakte for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "kontakte_update" on kontakte for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "kontakte_delete" on kontakte for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "kf_select" on kontakt_firmen for select
  using (kontakt_id in (select id from kontakte where tenant_id in (select get_user_tenant_ids())));
create policy "kf_write" on kontakt_firmen for all
  using (kontakt_id in (select id from kontakte where user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter'])))
  with check (kontakt_id in (select id from kontakte where user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter'])));

-- Private Termine (ist_privat) sieht nur, wer sie angelegt hat
create policy "akt_select" on aktivitaeten for select
  using (tenant_id in (select get_user_tenant_ids()) and (ist_privat = false or erstellt_von = auth.uid()));
create policy "akt_insert" on aktivitaeten for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "akt_update" on aktivitaeten for update
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']) and (ist_privat = false or erstellt_von = auth.uid()));
create policy "akt_delete" on aktivitaeten for delete
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']) and (ist_privat = false or erstellt_von = auth.uid()));

create policy "aktdok_select" on aktivitaet_dokumente for select using (tenant_id in (select get_user_tenant_ids()));
create policy "aktdok_insert" on aktivitaet_dokumente for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "aktdok_delete" on aktivitaet_dokumente for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "pipe_select" on pipeline_eintraege for select using (tenant_id in (select get_user_tenant_ids()));
create policy "pipe_insert" on pipeline_eintraege for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "pipe_update" on pipeline_eintraege for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "pipe_delete" on pipeline_eintraege for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create policy "pipeverlauf_select" on pipeline_verlauf for select
  using (pipeline_id in (select id from pipeline_eintraege where tenant_id in (select get_user_tenant_ids())));
create policy "pipeverlauf_insert" on pipeline_verlauf for insert
  with check (pipeline_id in (select id from pipeline_eintraege where user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter'])));

-- ─── Indizes ──────────────────────────────────────────────────────────────────
create index idx_firmen_tenant     on firmen(tenant_id);
create index idx_firmen_segment    on firmen(tenant_id, segment);
create index idx_kontakte_tenant   on kontakte(tenant_id);
create index idx_kontakte_firma    on kontakte(firma_id);
create index idx_kontakte_email    on kontakte(tenant_id, email);
create index idx_kf_kontakt        on kontakt_firmen(kontakt_id);
create index idx_kf_firma          on kontakt_firmen(firma_id);
create index idx_akt_tenant_datum  on aktivitaeten(tenant_id, datum desc);
create index idx_akt_kontakt       on aktivitaeten(kontakt_id);
create index idx_akt_firma         on aktivitaeten(firma_id);
create index idx_akt_conversation  on aktivitaeten(tenant_id, email_conversation_id);
create index idx_aktdok_aktivitaet on aktivitaet_dokumente(aktivitaet_id);
create index idx_pipe_tenant       on pipeline_eintraege(tenant_id, stufe);
create index idx_pipe_kontakt      on pipeline_eintraege(kontakt_id);
create index idx_pipe_firma        on pipeline_eintraege(firma_id);

-- ─── Storage: Dokumente zu Aktivitäten (Pfad: <tenant_id>/<datei>) ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aktivitaet-dokumente', 'aktivitaet-dokumente', false, 15728640, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'
])
on conflict (id) do nothing;

create policy "aktdok: mitglieder lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'aktivitaet-dokumente'
    and ((storage.foldername(name))[1])::uuid in (select get_user_tenant_ids()));
create policy "aktdok: schreibend hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'aktivitaet-dokumente'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
create policy "aktdok: schreibend löschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'aktivitaet-dokumente'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
