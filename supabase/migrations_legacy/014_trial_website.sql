-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014 – Trialzugang über die Hohenstein-Homepage (hohenstein-partner.at)
-- Hohenstein Suite | 2026-08-31
--
-- Website-Besucher können auf hohenstein-partner.at einen Trialzugang zu
-- software:112 anfordern (POST /api/public/trial, unauthentifiziert, per
-- Service-Role). Der Ablauf nutzt die bestehende Demo-Infrastruktur 1:1:
--   - firmen: neue/aktualisierte Firma mit quelle='Website-Trialanfrage'
--             (quelle ist bereits seit Migration 012 ein freies Textfeld –
--             kein Constraint-Update nötig, taucht automatisch im
--             Quelle-Filter der Firmen-Liste auf).
--   - demo_zugaenge: neuer Zugang mit firma_id-Verknüpfung und befristetem
--             gueltig_bis (Ablauf läuft über den bestehenden Cron
--             /api/cron/demo-zugaenge, der abgelaufene Zugänge bereits sperrt).
--   - s112DemoUserAnlegen(): bestehende Funktion, unverändert – legt den
--             Benutzer ausschließlich im Demo-Mandanten an.
-- Einzige Neuerung: ein Log für Missbrauchsschutz (Rate-Limit) und Nachvollziehbarkeit,
-- da dieser Endpunkt öffentlich und ohne Login erreichbar ist.
-- ─────────────────────────────────────────────────────────────────────────────

create table trial_anfragen (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  firma_name    text,
  firma_id      uuid        references firmen(id) on delete set null,
  demo_zugang_id uuid       references demo_zugaenge(id) on delete set null,
  ip            text,
  user_agent    text,
  herkunft      text        not null default 'hohenstein-partner.at',
  ergebnis      text        not null check (ergebnis in ('erfolgreich', 'abgelehnt', 'fehler')),
  hinweis       text,
  erstellt_am   timestamptz not null default now()
);
comment on table trial_anfragen is 'Protokoll aller Trialzugang-Anfragen über die öffentliche Website (Rate-Limit + Nachvollziehbarkeit); Schreibzugriff nur service_role.';

create index idx_trial_anfragen_email on trial_anfragen (lower(email), erstellt_am desc);
create index idx_trial_anfragen_ip on trial_anfragen (ip, erstellt_am desc);

alter table trial_anfragen enable row level security;
-- Nur Team (admin/mitarbeiter) darf das Protokoll einsehen; Insert ausschließlich über service_role (API-Route), daher keine Insert-Policy für authenticated.
create policy "trialanfragen_select" on trial_anfragen for select
  using (user_has_role_in_tenant('11111111-1111-4111-8111-111111111111'::uuid, array['admin','mitarbeiter']));
