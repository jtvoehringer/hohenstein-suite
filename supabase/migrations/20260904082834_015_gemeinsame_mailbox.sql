alter table user_email_connections add column if not exists gemeinsam boolean not null default false;

alter table user_email_connections drop constraint if exists user_email_connections_tenant_id_user_id_key;
create unique index if not exists uidx_uec_tenant_user_privat
  on user_email_connections (tenant_id, user_id) where not gemeinsam;
create unique index if not exists uidx_uec_tenant_gemeinsam
  on user_email_connections (tenant_id) where gemeinsam;

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
  using (gemeinsam = true and user_has_role_in_tenant(tenant_id, array['admin','mitarbeiter']));;
