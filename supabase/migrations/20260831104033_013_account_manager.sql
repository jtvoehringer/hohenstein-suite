alter table firmen add column if not exists account_manager uuid references auth.users(id) on delete set null;

create index if not exists idx_firmen_account_manager
  on firmen (tenant_id, account_manager) where account_manager is not null;;
