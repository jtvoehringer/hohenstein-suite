alter table aktivitaeten add column if not exists serie_id uuid;
alter table aktivitaeten add column if not exists serie_regel text;

create index if not exists idx_aktivitaeten_serie
  on aktivitaeten (tenant_id, serie_id) where serie_id is not null;;
