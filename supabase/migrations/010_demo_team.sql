-- ─────────────────────────────────────────────────────────────────────────────
-- 010 – Demo-Bereich nur fürs Management-Team: Vorführ-Zugänge dürfen
-- unbefristet sein (gueltig_bis NULL = kein Ablauf). Externer Zugriff für
-- Interessenten wird nicht mehr über die Suite vergeben.
-- ─────────────────────────────────────────────────────────────────────────────

alter table demo_zugaenge alter column gueltig_bis drop not null;
comment on column demo_zugaenge.gueltig_bis is 'Ablaufdatum; NULL = unbefristet (interner Vorführ-Zugang des Teams)';
