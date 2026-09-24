-- 014: Serientermine ─ wiederkehrende Termine (z. B. Jour Fixe jeden Mittwoch).
-- Umsetzung als materialisierte Einzeltermine: beim Anlegen mit Wiederholung
-- werden alle Instanzen bis zum Enddatum als normale aktivitaeten-Zeilen
-- erzeugt und über serie_id verknüpft; serie_regel ist das Anzeige-Label
-- (taeglich | woechentlich | zweiwoechentlich | monatlich).
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

alter table aktivitaeten add column if not exists serie_id uuid;
alter table aktivitaeten add column if not exists serie_regel text;

create index if not exists idx_aktivitaeten_serie
  on aktivitaeten (tenant_id, serie_id) where serie_id is not null;
