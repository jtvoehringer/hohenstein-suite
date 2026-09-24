delete from tenants where ist_demo = true;
drop function if exists demo_zuruecksetzen();

create table demo_zugaenge (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  kontakt_id        uuid        references kontakte(id) on delete set null,
  firma_id          uuid        references firmen(id) on delete set null,
  name              text        not null,
  email             text        not null,
  s112_user_id      uuid,
  s112_rolle        text        not null default 'winzer' check (s112_rolle in ('winzer', 'leser')),
  gueltig_bis       date        not null,
  status            text        not null default 'aktiv' check (status in ('aktiv', 'gesperrt', 'abgelaufen', 'geloescht')),
  letzte_anmeldung  timestamptz,
  notizen           text,
  erstellt_von      uuid        references auth.users(id),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
comment on table demo_zugaenge is 'Zeitlich begrenzte Demo-Logins für Interessenten im software:112-Demo-Mandanten';

create trigger demo_zugaenge_aktualisiert before update on demo_zugaenge
  for each row execute function update_aktualisiert_am();

alter table demo_zugaenge enable row level security;
create policy "demozug_select" on demo_zugaenge for select using (tenant_id in (select get_user_tenant_ids()));
create policy "demozug_write" on demo_zugaenge for all
  using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']))
  with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create index idx_demozug_tenant on demo_zugaenge(tenant_id, status, gueltig_bis);

create table demo_resets (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants(id) on delete cascade,
  ausgeloest_von uuid       references auth.users(id),
  erstellt_am   timestamptz not null default now()
);
alter table demo_resets enable row level security;
create policy "demoreset_select" on demo_resets for select using (tenant_id in (select get_user_tenant_ids()));
create policy "demoreset_insert" on demo_resets for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));;
