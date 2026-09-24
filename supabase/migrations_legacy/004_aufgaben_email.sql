-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004 – Aufgaben (Team-To-dos) und E-Mail-Verbindungen (IMAP/SMTP)
-- Hohenstein Suite | 2026-08-27
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Aufgaben: offen / in Arbeit / erledigt · Verantwortlich · zu erledigen bis ─
create table aufgaben (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants(id) on delete cascade,
  titel             text        not null,
  beschreibung      text,
  status            text        not null default 'offen' check (status in ('offen', 'in_arbeit', 'erledigt')),
  prioritaet        text        not null default 'normal' check (prioritaet in ('niedrig', 'normal', 'hoch')),
  verantwortlich_id uuid        references auth.users(id) on delete set null,
  faellig_am        date,
  kontakt_id        uuid        references kontakte(id) on delete set null,
  firma_id          uuid        references firmen(id) on delete set null,
  bereich           text        check (bereich in ('crm', 'ea', 'demo', 'intern', 'sonstiges')),
  erledigt_am       timestamptz,
  erstellt_von      uuid        references auth.users(id),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
comment on table aufgaben is 'Team-Aufgaben mit Status, Verantwortlichem und Fälligkeit (Dashboard-Kachel)';

create trigger aufgaben_aktualisiert before update on aufgaben
  for each row execute function update_aktualisiert_am();

-- erledigt_am automatisch pflegen
create or replace function aufgaben_status_pflegen()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'erledigt' and (tg_op = 'INSERT' or old.status <> 'erledigt') then
    new.erledigt_am := now();
  elsif new.status <> 'erledigt' then
    new.erledigt_am := null;
  end if;
  return new;
end;
$$;
revoke execute on function aufgaben_status_pflegen() from public, anon, authenticated;

create trigger aufgaben_status before insert or update on aufgaben
  for each row execute function aufgaben_status_pflegen();

alter table aufgaben enable row level security;
create policy "aufgaben_select" on aufgaben for select using (tenant_id in (select get_user_tenant_ids()));
create policy "aufgaben_insert" on aufgaben for insert with check (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "aufgaben_update" on aufgaben for update using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
create policy "aufgaben_delete" on aufgaben for delete using (user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

create index idx_aufgaben_tenant_status on aufgaben(tenant_id, status, faellig_am);
create index idx_aufgaben_verantwortlich on aufgaben(verantwortlich_id);

-- ─── E-Mail-Verbindungen je Benutzer (IMAP/SMTP; O365 später ergänzbar) ───────
create table user_email_connections (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references tenants(id) on delete cascade,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  email_address    text        not null,
  anzeigename      text,
  imap_aktiv       boolean     not null default false,
  imap_host        text,
  imap_port        integer     not null default 993,
  imap_user        text,
  imap_pass_enc    text,
  smtp_host        text,
  smtp_port        integer     not null default 587,
  smtp_user        text,
  smtp_pass_enc    text,
  smtp_from_name   text,
  signatur         text,
  letzter_abruf    timestamptz,
  letzter_fehler   text,
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
comment on table user_email_connections is 'Persönliche IMAP-/SMTP-Zugänge (Passwörter verschlüsselt, nur serverseitig lesbar)';

create trigger uec_aktualisiert before update on user_email_connections
  for each row execute function update_aktualisiert_am();

alter table user_email_connections enable row level security;
-- Nur der Eigentümer sieht/ändert seine Verbindung (Passwörter zusätzlich verschlüsselt)
create policy "uec_own" on user_email_connections for all
  using (user_id = auth.uid() and tenant_id in (select get_user_tenant_ids()))
  with check (user_id = auth.uid() and tenant_id in (select get_user_tenant_ids()));
