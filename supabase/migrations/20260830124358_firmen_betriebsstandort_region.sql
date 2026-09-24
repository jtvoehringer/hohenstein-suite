-- 011: Firmen um Betriebsstandort (generisches Weinbaugebiet) und Region (Gebiet/Bundesland) erweitern
alter table firmen add column if not exists betriebsstandort text;
alter table firmen add column if not exists region text;
create index if not exists idx_firmen_standort on firmen (tenant_id, betriebsstandort);
create index if not exists idx_firmen_region on firmen (tenant_id, region);;
