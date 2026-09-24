alter table anlagen add column if not exists methode text not null default 'linear';
alter table anlagen drop constraint if exists anlagen_methode_check;
alter table anlagen add constraint anlagen_methode_check check (methode in ('linear', 'degressiv', 'gwg'));
alter table anlagen add column if not exists degressiv_satz numeric;
alter table anlagen drop constraint if exists anlagen_degressiv_satz_check;
alter table anlagen add constraint anlagen_degressiv_satz_check check (degressiv_satz is null or (degressiv_satz > 0 and degressiv_satz <= 30));
alter table anlagen add column if not exists konto_nr text;
alter table anlagen add column if not exists transaktion_id uuid references ea_transaktionen(id) on delete set null;
update anlagen set methode = 'gwg' where sofortabschreibung and methode = 'linear';
create index if not exists idx_anlagen_transaktion on anlagen (transaktion_id) where transaktion_id is not null;

alter table ea_transaktionen add column if not exists anlage_id uuid references anlagen(id) on delete restrict;
comment on column ea_transaktionen.anlage_id is 'AfA-Buchung: Anlage, deren Jahres-Abschreibung diese Buchung ist (NULL bei allen anderen Buchungen)';
create unique index if not exists uq_ea_transaktionen_afa_je_jahr
  on ea_transaktionen (anlage_id, (extract(year from datum)::int)) where anlage_id is not null;

create or replace function ea_transaktion_anlage_pruefen() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.anlage_id is not null and not exists (select 1 from anlagen a where a.id = new.anlage_id and a.tenant_id = new.tenant_id) then
    raise exception 'Die Anlage gehört nicht zu diesem Mandanten.';
  end if;
  return new;
end;
$$;
revoke execute on function ea_transaktion_anlage_pruefen() from public, anon, authenticated;
drop trigger if exists ea_transaktionen_anlage on ea_transaktionen;
create trigger ea_transaktionen_anlage before insert or update of anlage_id, tenant_id on ea_transaktionen
  for each row execute function ea_transaktion_anlage_pruefen();

insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung)
select null, 'ausgabe', 'Anlagenkauf (aktivierungspflichtig)', 660, 20, 100, 105
where not exists (select 1 from ea_kategorien where tenant_id is null and name = 'Anlagenkauf (aktivierungspflichtig)');
insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung)
select null, 'ausgabe', 'Abschreibung (AfA)', 7010, 0, 100, 106
where not exists (select 1 from ea_kategorien where tenant_id is null and name = 'Abschreibung (AfA)');
insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung)
select t.id, 'ausgabe', 'Anlagenkauf (aktivierungspflichtig)', 660, 20, 100, 105 from tenants t
where not exists (select 1 from ea_kategorien k where k.tenant_id = t.id and k.name = 'Anlagenkauf (aktivierungspflichtig)');
insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung)
select t.id, 'ausgabe', 'Abschreibung (AfA)', 7010, 0, 100, 106 from tenants t
where not exists (select 1 from ea_kategorien k where k.tenant_id = t.id and k.name = 'Abschreibung (AfA)');;
