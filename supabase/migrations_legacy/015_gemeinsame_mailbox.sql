-- 015: Gemeinsame Mailbox (office@hohenstein-partner.at) ─ eine zusätzliche,
-- team-weite IMAP/SMTP-Verbindung je Mandant neben den persönlichen Postfächern.
-- Umschaltung im Posteingang; die aktive Verbindung wählt der Server über das
-- Cookie hs_mail_konto (src/lib/email/verbindung.ts).
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

alter table user_email_connections add column if not exists gemeinsam boolean not null default false;

-- unique(tenant_id, user_id) ersetzen: privat weiterhin 1 Konto je User,
-- zusätzlich genau 1 gemeinsame Mailbox je Mandant
alter table user_email_connections drop constraint if exists user_email_connections_tenant_id_user_id_key;
create unique index if not exists uidx_uec_tenant_user_privat
  on user_email_connections (tenant_id, user_id) where not gemeinsam;
create unique index if not exists uidx_uec_tenant_gemeinsam
  on user_email_connections (tenant_id) where gemeinsam;

-- RLS: die gemeinsame Mailbox dürfen alle Mitglieder lesen/nutzen,
-- pflegen dürfen sie Admins und Mitarbeiter
drop policy if exists "uec_gemeinsam_select" on user_email_connections;
create policy "uec_gemeinsam_select" on user_email_connections for select
  using (gemeinsam = true and tenant_id in (select get_user_tenant_ids()));

drop policy if exists "uec_gemeinsam_insert" on user_email_connections;
create policy "uec_gemeinsam_insert" on user_email_connections for insert
  with check (gemeinsam = true and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

drop policy if exists "uec_gemeinsam_update" on user_email_connections;
create policy "uec_gemeinsam_update" on user_email_connections for update
  using (gemeinsam = true and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));

drop policy if exists "uec_gemeinsam_delete" on user_email_connections;
create policy "uec_gemeinsam_delete" on user_email_connections for delete
  using (gemeinsam = true and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));
