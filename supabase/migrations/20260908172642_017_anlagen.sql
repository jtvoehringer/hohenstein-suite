create table if not exists anlagen (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references tenants(id) on delete cascade,
  bezeichnung         text        not null,
  gruppe              text        not null default 'sonstiges'
                      check (gruppe in ('edv', 'bueroausstattung', 'fahrzeug', 'maschinen', 'immateriell', 'sonstiges')),
  anschaffungsdatum   date        not null,
  anschaffungskosten  numeric     not null check (anschaffungskosten >= 0),
  nutzungsdauer_jahre smallint    not null default 3 check (nutzungsdauer_jahre between 0 and 60),
  sofortabschreibung  boolean     not null default false,
  restwert            numeric     not null default 0 check (restwert >= 0),
  abgang_datum        date,
  abgang_erloes       numeric     check (abgang_erloes is null or abgang_erloes >= 0),
  lieferant           text,
  belegnummer         text,
  notizen             text,
  erstellt_von        uuid        references auth.users(id) on delete set null,
  erstellt_am         timestamptz not null default now(),
  aktualisiert_am     timestamptz not null default now()
);
comment on table anlagen is 'E&A: Anlagenverzeichnis (lineare AfA, Halbjahresregel, GWG-Sofortabschreibung)';

drop trigger if exists anlagen_aktualisiert on anlagen;
create trigger anlagen_aktualisiert before update on anlagen
  for each row execute function update_aktualisiert_am();

alter table anlagen enable row level security;
drop policy if exists "anlagen_select" on anlagen;
create policy "anlagen_select" on anlagen for select using (tenant_id in (select get_user_tenant_ids()));
drop policy if exists "anlagen_write" on anlagen;
create policy "anlagen_write" on anlagen for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create index if not exists idx_anlagen_tenant on anlagen (tenant_id, anschaffungsdatum);;
