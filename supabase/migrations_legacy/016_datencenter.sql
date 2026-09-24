-- 016: Datencenter ─ zentrale Dateiablage mit Ordnerstruktur (Tab „Datencenter")
-- plus Datei-Anhänge an Firmen und Kontakten (gleiche Ablage, verknüpft über
-- firma_id/kontakt_id; solche Dateien erscheinen im Datencenter unter
-- „CRM-Anhänge"). Termine nutzen weiterhin aktivitaet_dokumente (Migration 002).
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

create table if not exists ablage_ordner (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants(id) on delete cascade,
  parent_id    uuid        references ablage_ordner(id) on delete cascade,
  name         text        not null,
  erstellt_von uuid        references auth.users(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
comment on table ablage_ordner is 'Datencenter: Ordnerbaum je Mandant (parent_id = Überordner, NULL = Wurzel)';

create table if not exists ablage_dateien (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants(id) on delete cascade,
  ordner_id     uuid        references ablage_ordner(id) on delete cascade,
  firma_id      uuid        references firmen(id) on delete set null,
  kontakt_id    uuid        references kontakte(id) on delete set null,
  dateiname     text        not null,
  dateityp      text,
  groesse_bytes bigint,
  storage_pfad  text        not null,
  erstellt_von  uuid        references auth.users(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);
comment on table ablage_dateien is 'Datencenter: Dateien (Bucket datencenter); ordner_id NULL + firma_id/kontakt_id = CRM-Anhang';

alter table ablage_ordner  enable row level security;
alter table ablage_dateien enable row level security;

drop policy if exists "ablord_select" on ablage_ordner;
create policy "ablord_select" on ablage_ordner for select using (tenant_id in (select get_user_tenant_ids()));
drop policy if exists "ablord_write" on ablage_ordner;
create policy "ablord_write" on ablage_ordner for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

drop policy if exists "abldat_select" on ablage_dateien;
create policy "abldat_select" on ablage_dateien for select using (tenant_id in (select get_user_tenant_ids()));
drop policy if exists "abldat_write" on ablage_dateien;
create policy "abldat_write" on ablage_dateien for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create index if not exists idx_ablord_tenant_parent on ablage_ordner (tenant_id, parent_id);
create index if not exists idx_abldat_tenant_ordner on ablage_dateien (tenant_id, ordner_id);
create index if not exists idx_abldat_firma          on ablage_dateien (firma_id) where firma_id is not null;
create index if not exists idx_abldat_kontakt        on ablage_dateien (kontakt_id) where kontakt_id is not null;

-- Storage-Bucket (Pfad: <tenant_id>/<datei>); 50 MB, gängige Bürodateitypen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('datencenter', 'datencenter', false, 52428800, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed', 'message/rfc822',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet'
])
on conflict (id) do nothing;

drop policy if exists "datencenter: mitglieder lesen" on storage.objects;
create policy "datencenter: mitglieder lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'datencenter'
    and ((storage.foldername(name))[1])::uuid in (select get_user_tenant_ids()));
drop policy if exists "datencenter: schreibend hochladen" on storage.objects;
create policy "datencenter: schreibend hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'datencenter'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
drop policy if exists "datencenter: schreibend löschen" on storage.objects;
create policy "datencenter: schreibend löschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'datencenter'
    and user_has_role_in_tenant(((storage.foldername(name))[1])::uuid, array['admin','mitarbeiter']));
