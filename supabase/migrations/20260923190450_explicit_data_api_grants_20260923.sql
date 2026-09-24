-- Explizite Data-API-Grants (Supabase-Änderung ab 30.10.2026).
-- Spiegelt den Grant-Stand vom 23.09.2026, damit ein Neuaufbau aus den Migrationen
-- (Branch, db reset, neues Projekt) dieselben Rechte erhält. Idempotent.
do $g$
declare t text;
begin
  foreach t in array array['ablage_dateien','ablage_ordner','aktivitaet_dokumente','aktivitaeten','anlagen','aufgaben','beleg_positionen','beleg_zahlungen','belege','benachrichtigungen','demo_resets','demo_zugaenge','ea_belege','ea_dauerauftraege','ea_dauerauftrag_log','ea_kategorien','ea_monatsabschluss','ea_transaktionen','ea_uva','eingangsrechnungen','firmen','kontakt_firmen','kontakte','konten','konto_umbuchungen','leistungen','pipeline_eintraege','pipeline_verlauf','profiles','tenant_einstellungen','tenant_memberships','tenants','trial_anfragen','user_email_connections','zugelassene_domains']::text[] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('grant select, insert, update, delete, truncate, references, trigger on table public.%I to anon, authenticated, service_role', t);
    end if;
  end loop;
end $g$;;
