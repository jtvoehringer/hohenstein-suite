alter table demo_zugaenge alter column gueltig_bis drop not null;
comment on column demo_zugaenge.gueltig_bis is 'Ablaufdatum; NULL = unbefristet (interner Vorführ-Zugang des Teams)';;
