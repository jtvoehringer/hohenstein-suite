-- ── 011: Betriebsstandort & Region auf Firmen ─────────────────────────────────
-- Selektion nach ÖWM-Logik: Betriebsstandort = generisches Weinbaugebiet
-- (Niederösterreich, Burgenland, Steiermark, Wien, Bergland), Region = Gebiet
-- innerhalb des Betriebsstandorts (z. B. Kamptal – bzw. Bundesland im Bergland).
-- Bereits am 30.08.2026 via MCP in der Prod-DB eingespielt (inkl. Backfill aus
-- den Notizen der Lead-Importe).

alter table firmen add column if not exists betriebsstandort text;
alter table firmen add column if not exists region text;
create index if not exists idx_firmen_standort on firmen (tenant_id, betriebsstandort);
create index if not exists idx_firmen_region on firmen (tenant_id, region);
