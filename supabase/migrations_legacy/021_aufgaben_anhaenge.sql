-- 021: Dateianhänge an Aufgaben – gleiche Ablage wie Firmen/Kontakte (ablage_dateien, Bucket datencenter)
-- Verknüpfung über ablage_dateien.aufgabe_id; im Datencenter unter „Anhänge" sichtbar. Idempotent.
alter table ablage_dateien add column if not exists aufgabe_id uuid references aufgaben(id) on delete set null;
create index if not exists idx_abldat_aufgabe on ablage_dateien (aufgabe_id) where aufgabe_id is not null;
comment on table ablage_dateien is 'Datencenter: Dateien (Bucket datencenter); ordner_id NULL + firma_id/kontakt_id/aufgabe_id = Anhang an Firma, Kontakt oder Aufgabe';
