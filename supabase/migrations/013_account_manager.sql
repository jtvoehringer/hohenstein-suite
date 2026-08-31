-- 013: Account Manager auf Firmen ─ Zuordnung eines Leads/Kunden zu einem
-- Team-Mitglied (Jörgen, Hannes, Paul). Auswahl über die bestehende RPC
-- mandant_mitglieder (Migration 006); Filter in der Firmen-Liste.
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

alter table firmen add column if not exists account_manager uuid references auth.users(id) on delete set null;

create index if not exists idx_firmen_account_manager
  on firmen (tenant_id, account_manager) where account_manager is not null;
