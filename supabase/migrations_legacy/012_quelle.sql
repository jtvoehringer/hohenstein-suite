-- ── 012: Quelle als auswertbares Feld auf Firmen ──────────────────────────────
-- Woher stammt der Datensatz (ÖWM-Betriebssuche, Leadliste, Visitenkarten-Scan,
-- CSV-Import, Manuell …). Bereits am 30.08.2026 via MCP in der Prod-DB
-- eingespielt (inkl. Backfill aus den Quelle-Angaben in den Notizen).

alter table firmen add column if not exists quelle text;
create index if not exists idx_firmen_quelle on firmen (tenant_id, quelle);
