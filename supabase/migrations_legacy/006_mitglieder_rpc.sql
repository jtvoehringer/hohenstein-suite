-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006 – Mitgliederliste je Mandant (für Verantwortlich-Auswahl)
-- Hohenstein Suite | 2026-08-27
-- Jedes aktive Mitglied darf die Kolleginnen/Kollegen seines Mandanten mit
-- Name (kein E-Mail) sehen – ohne Service-Role-Key.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function mandant_mitglieder(p_tenant_id uuid)
returns table(user_id uuid, name text, role text)
language sql security definer stable set search_path = public as $$
  select m.user_id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.display_name), ''), 'Unbekannt') as name,
         m.role
  from tenant_memberships m
  left join profiles p on p.id = m.user_id
  where m.tenant_id = p_tenant_id
    and m.aktiv = true
    and (public.ist_service_kontext() or exists (
      select 1 from tenant_memberships me
      where me.tenant_id = p_tenant_id and me.user_id = auth.uid() and me.aktiv = true))
  order by name
$$;
revoke execute on function mandant_mitglieder(uuid) from public, anon;
grant execute on function mandant_mitglieder(uuid) to authenticated, service_role;
