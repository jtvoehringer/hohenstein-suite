-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005 – Mandanten anlegen + Demo-Umgebung (Beispieldaten, zurücksetzbar)
-- Hohenstein Suite | 2026-08-27
--
-- Zwei Mandanten: „Hohenstein Consulting OG" (Echtdaten) und „Demo-Umgebung"
-- (ist_demo = true). demo_zuruecksetzen() löscht alle Daten des Demo-Mandanten
-- und erzeugt frische Beispieldaten relativ zum heutigen Datum – so bleibt die
-- Demo immer aktuell (Termine „diese Woche", Buchungen der letzten Monate …).
-- ─────────────────────────────────────────────────────────────────────────────

insert into tenants (id, name, slug, ist_demo) values
  ('11111111-1111-4111-8111-111111111111', 'Hohenstein Consulting OG', 'hohenstein', false),
  ('22222222-2222-4222-8222-222222222222', 'Demo-Umgebung',            'demo',       true);

insert into tenant_einstellungen (tenant_id, anzeigename, betrieb_name, betrieb_ort, betrieb_plz, betrieb_email, kunden_prefix, ea_uva_zeitraum)
values
  ('11111111-1111-4111-8111-111111111111', 'Hohenstein Consulting', 'Hohenstein Consulting OG', null, null, 'office@hohenstein-partner.at', 'K', 'quartalsweise'),
  ('22222222-2222-4222-8222-222222222222', 'Demo-Umgebung', 'Demo Consulting GmbH', 'Krems an der Donau', '3500', 'office@demo.example', 'D', 'quartalsweise');

-- ─── Demo-Daten erzeugen ──────────────────────────────────────────────────────
create or replace function demo_zuruecksetzen()
returns void language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  u uuid[];                  -- Benutzer des Demo-Mandanten (für Verantwortliche)
  n int;
  heute date := current_date;
  -- Firmen
  f_steinberg uuid; f_krems uuid; f_traube uuid; f_donau uuid; f_lang uuid; f_wachau uuid; f_kamptal uuid; f_stb uuid; f_cloud uuid; f_partner uuid;
  -- Kontakte
  k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid; k6 uuid; k7 uuid; k8 uuid; k9 uuid; k10 uuid;
  -- Kategorien
  kat_honorar uuid; kat_saas uuid; kat_projekt uuid; kat_schulung uuid; kat_sonst_e uuid;
  kat_fremd uuid; kat_software uuid; kat_hardware uuid; kat_telefon uuid; kat_buero uuid; kat_miete uuid;
  kat_fahrt uuid; kat_bewirt uuid; kat_marketing uuid; kat_stb uuid; kat_vers uuid; kat_bank uuid; kat_weiterb uuid;
  -- Konten
  konto_giro uuid; konto_kassa uuid; konto_kk uuid;
  m int; d date; tx_id uuid;
begin
  select id into t from tenants where ist_demo = true limit 1;
  if t is null then
    raise exception 'Kein Demo-Mandant vorhanden';
  end if;
  perform public.pruefe_tenant_zugriff(t, array['admin', 'mitarbeiter']);

  select coalesce(array_agg(user_id order by created_at), '{}') into u from tenant_memberships where tenant_id = t and aktiv = true;
  n := coalesce(array_length(u, 1), 0);

  -- ── Alles löschen (Reihenfolge wegen FK) ───────────────────────────────────
  perform set_config('hs.sperre_umgehen', 'on', true);
  delete from ea_dauerauftrag_log   where tenant_id = t;
  delete from ea_belege             where tenant_id = t;
  delete from ea_transaktionen      where tenant_id = t;
  delete from ea_dauerauftraege     where tenant_id = t;
  delete from ea_uva                where tenant_id = t;
  delete from ea_monatsabschluss    where tenant_id = t;
  delete from konto_umbuchungen     where tenant_id = t;
  delete from konten                where tenant_id = t;
  delete from ea_kategorien         where tenant_id = t;
  delete from aufgaben              where tenant_id = t;
  delete from aktivitaet_dokumente  where tenant_id = t;
  delete from aktivitaeten          where tenant_id = t;
  delete from pipeline_eintraege    where tenant_id = t;
  delete from kontakte              where tenant_id = t;
  delete from firmen                where tenant_id = t;
  perform set_config('hs.sperre_umgehen', 'off', true);

  update tenant_einstellungen set kunden_zaehler = 1, ea_betriebsbeginn = date_trunc('year', heute)::date where tenant_id = t;

  -- ── Firmen ────────────────────────────────────────────────────────────────
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, telefon, email, website, uid_nummer, is_lead, ist_kunde, ist_lieferant, notizen)
  values (t, 'D-0001', 'Weingut Steinberg GmbH', 'weinbau', 'Kellergasse 12', '3500', 'Krems an der Donau', '2732 12345', 'office@weingut-steinberg.example', 'weingut-steinberg.example', 'ATU12345678', false, true, false, 'Pilotkunde software:112 seit Frühjahr. 24 ha, Schwerpunkt Grüner Veltliner.')
  returning id into f_steinberg;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, telefon, email, is_lead, ist_kunde, notizen)
  values (t, 'D-0002', 'Vinothek Krems', 'handel', 'Obere Landstraße 4', '3500', 'Krems an der Donau', '2732 55511', 'info@vinothek-krems.example', false, true, 'Interesse an CRM-Modul für Newsletter.')
  returning id into f_krems;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, telefon, email, is_lead, notizen)
  values (t, 'D-0003', 'Gasthof Zur Traube', 'gastronomie', 'Hauptplatz 7', '3601', 'Dürnstein', '2711 222', 'traube@gasthof.example', true, 'Empfehlung von Weingut Steinberg.')
  returning id into f_traube;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, email, website, is_lead, notizen)
  values (t, 'D-0004', 'Weingut Donauhof', 'weinbau', 'Donaulände 3', '3512', 'Mautern', 'office@donauhof.example', 'donauhof.example', true, 'Demo vereinbart. 12 ha, bio-zertifiziert, aktuell Excel + Papier-Kellerbuch.')
  returning id into f_donau;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, telefon, is_lead, notizen)
  values (t, 'D-0005', 'Buschenschank Lang', 'weinbau', 'Weinbergweg 9', '3491', 'Straß im Straßertale', '2735 777', true, 'Kleinbetrieb, 4 ha. Preissensibel – Starter-Paket anbieten.')
  returning id into f_lang;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, email, website, uid_nummer, is_lead, notizen)
  values (t, 'D-0006', 'Weingut Wachauer Terrassen', 'weinbau', 'Spitzer Straße 41', '3620', 'Spitz', 'office@wachauer-terrassen.example', 'wachauer-terrassen.example', 'ATU87654321', false, 'Kunde seit Juni – Onboarding läuft, Datenimport Rieden offen.')
  returning id into f_wachau;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, email, is_lead, notizen)
  values (t, 'D-0007', 'Winzerhof Kamptal', 'weinbau', 'Kamptalstraße 18', '3550', 'Langenlois', 'hof@winzerhof-kamptal.example', true, 'Messekontakt Wieselburg. Will Angebot bis Ende des Monats.')
  returning id into f_kamptal;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, email, uid_nummer, is_lead, ist_kunde, ist_lieferant, notizen)
  values (t, 'D-0008', 'Kanzlei Berger Steuerberatung', 'lieferant', 'Ringstraße 22', '3500', 'Krems an der Donau', 'office@stb-berger.example', 'ATU11223344', false, false, true, 'Unser Steuerberater – Jahresabschluss, UVA-Rückfragen.')
  returning id into f_stb;
  insert into firmen (tenant_id, kundennummer, name, segment, ort, land, email, is_lead, ist_kunde, ist_lieferant, notizen)
  values (t, 'D-0009', 'CloudHost Europe B.V.', 'lieferant', 'Amsterdam', 'NL', 'billing@cloudhost.example', false, false, true, 'Hosting/Datenbank – monatliche Rechnung (Reverse Charge).')
  returning id into f_cloud;
  insert into firmen (tenant_id, kundennummer, name, segment, strasse, plz, ort, email, website, is_lead, ist_kunde, notizen)
  values (t, 'D-0010', 'Weinbauverband Niederösterreich', 'partner', 'Wiener Straße 64', '3100', 'St. Pölten', 'office@weinbauverband.example', 'weinbauverband.example', false, false, 'Kooperationspartner – Vortrag Digitalisierung im Herbst.')
  returning id into f_partner;

  -- ── Kontakte ──────────────────────────────────────────────────────────────
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, telefon, mobil, is_lead, notizen)
  values (t, 'D-0011', 'Martin', 'Steinberger', 'weinbau', f_steinberg, 'Betriebsleiter', 'm.steinberger@weingut-steinberg.example', '2732 12345', '664 1234567', false, 'Entscheider. Bevorzugt Telefon, vormittags.')
  returning id into k1;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, mobil, is_lead)
  values (t, 'D-0012', 'Anna', 'Steinberger', 'weinbau', f_steinberg, 'Kellermeisterin', 'a.steinberger@weingut-steinberg.example', '664 7654321', false)
  returning id into k2;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, telefon, is_lead)
  values (t, 'D-0013', 'Julia', 'Kern', 'handel', f_krems, 'Geschäftsführung', 'j.kern@vinothek-krems.example', '2732 55511', false)
  returning id into k3;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, is_lead)
  values (t, 'D-0014', 'Herbert', 'Traube', 'gastronomie', f_traube, 'Inhaber', 'traube@gasthof.example', true)
  returning id into k4;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, mobil, is_lead, notizen)
  values (t, 'D-0015', 'Lukas', 'Donauer', 'weinbau', f_donau, 'Junior-Chef', 'l.donauer@donauhof.example', '676 5551234', true, 'Technikaffin, hat die Demo angefragt.')
  returning id into k5;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, telefon, is_lead)
  values (t, 'D-0016', 'Maria', 'Lang', 'weinbau', f_lang, 'Inhaberin', '2735 777', true)
  returning id into k6;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, mobil, is_lead)
  values (t, 'D-0017', 'Stefan', 'Wachauer', 'weinbau', f_wachau, 'Betriebsleiter', 's.wachauer@wachauer-terrassen.example', '699 1112233', false)
  returning id into k7;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, is_lead)
  values (t, 'D-0018', 'Petra', 'Kampl', 'weinbau', f_kamptal, 'Geschäftsführerin', 'p.kampl@winzerhof-kamptal.example', true)
  returning id into k8;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, telefon, is_lead)
  values (t, 'D-0019', 'Thomas', 'Berger', 'lieferant', f_stb, 'Steuerberater', 't.berger@stb-berger.example', '2732 99900', false)
  returning id into k9;
  insert into kontakte (tenant_id, kundennummer, vorname, nachname, segment, firma_id, position, email, is_lead)
  values (t, 'D-0020', 'Elisabeth', 'Hofer', 'partner', f_partner, 'Geschäftsführung', 'e.hofer@weinbauverband.example', false)
  returning id into k10;
  update tenant_einstellungen set kunden_zaehler = 21 where tenant_id = t;

  -- ── Aktivitäten (Kalender + Log) ──────────────────────────────────────────
  insert into aktivitaeten (tenant_id, kontakt_id, firma_id, art, betreff, beschreibung, datum, ganztags, uhrzeit_von, uhrzeit_bis, erledigt, erstellt_von) values
    (t, k5, f_donau,     'demo',        'Demo software:112 – Weingut Donauhof', 'Online-Demo: Kellerbuch, Rieden, E&A. Lukas bringt den Vater mit.', heute + 1, false, '10:00', '11:00', false, u[1]),
    (t, k1, f_steinberg, 'besprechung', 'Jour fixe Steinberg', 'Status Onboarding, offene Punkte Datenimport, Feedback Dashboard.', heute + 2, false, '14:00', '15:00', false, u[1]),
    (t, k8, f_kamptal,   'angebot',     'Angebot Winzerhof Kamptal versenden', 'Paket Pro + Schulung, Laufzeit 24 Monate.', heute + 3, true, null, null, false, u[1]),
    (t, k7, f_wachau,    'besuch',      'Vor-Ort-Termin Wachauer Terrassen', 'Rieden-Import gemeinsam durchgehen, Kellerplan aufnehmen.', heute + 6, false, '09:00', '12:00', false, u[1]),
    (t, k10, f_partner,  'besprechung', 'Abstimmung Vortrag Weinbauverband', 'Agenda „Digitalisierung im Weinbau", 20 Minuten Slot.', heute + 9, false, '11:00', '11:45', false, u[1]),
    (t, k3, f_krems,     'anruf',       'Rückruf Vinothek Krems', 'Frage zu CRM-Newsletter – Brevo-Anbindung erklären.', heute + 1, false, '16:00', '16:15', false, u[1]),
    (t, null, null,      'messe',       'Messe Wieselburg – Stand vorbereiten', 'Roll-up, Demo-Laptop, Visitenkarten.', heute + 14, true, null, null, false, u[1]),
    (t, k1, f_steinberg, 'anruf',       'Telefonat Steinberg – Rechnung Q2', 'Rechnung bestätigt, Zahlung bis Monatsende.', heute - 2, false, '09:30', '09:45', true, u[1]),
    (t, k5, f_donau,     'email',       'Demo-Anfrage über Website', 'Lukas Donauer fragt nach einer Demo – Termin vorgeschlagen.', heute - 5, true, null, null, true, u[1]),
    (t, k8, f_kamptal,   'messe',       'Erstkontakt Messe', 'Kontakt am Stand, will Angebot.', heute - 12, true, null, null, true, u[1]),
    (t, k7, f_wachau,    'besprechung', 'Kick-off Onboarding Wachauer Terrassen', 'Projektplan abgestimmt, Zugänge angelegt.', heute - 20, false, '10:00', '12:00', true, u[1]),
    (t, k9, f_stb,       'besprechung', 'UVA Q-Abstimmung mit Steuerberater', 'Offene Belege nachgereicht.', heute - 25, false, '15:00', '15:30', true, u[1]),
    (t, k6, f_lang,      'anruf',       'Erstgespräch Buschenschank Lang', 'Interesse, aber Budget klein – Starter-Paket.', heute - 33, false, '11:00', '11:20', true, u[1]),
    (t, null, null,      'notiz',       'Preisliste 2026/27 aktualisiert', 'Neue Staffel für Kleinbetriebe unter 5 ha.', heute - 40, true, null, null, true, u[1]),
    (t, k2, f_steinberg, 'demo',        'Schulung Kellerbuch – Anna Steinberger', 'Umziehen/Verschneiden, Blend-Protokoll.', heute - 48, false, '13:00', '16:00', true, u[1]);

  -- ── Pipeline ──────────────────────────────────────────────────────────────
  insert into pipeline_eintraege (tenant_id, kontakt_id, firma_id, stufe, titel, kategorie, wert_euro, wahrscheinlichkeit, erwartetes_datum, notizen) values
    (t, k5, f_donau,     'demo',         'software:112 Pro – Weingut Donauhof',       'software112', 4680, 50, heute + 30, 'Demo morgen. Bio-Betrieb, braucht Behandlungsprotokoll.'),
    (t, k8, f_kamptal,   'angebot',      'software:112 Pro + Schulung – Winzerhof Kamptal', 'software112', 6200, 60, heute + 21, 'Angebot in Arbeit.'),
    (t, k6, f_lang,      'kontaktiert',  'software:112 Starter – Buschenschank Lang', 'software112', 1440, 25, heute + 60, null),
    (t, k4, f_traube,    'interessent',  'CRM-Modul – Gasthof Zur Traube',           'software112',  960, 15, heute + 90, 'Empfehlung, noch kein Gespräch.'),
    (t, k3, f_krems,     'verhandlung',  'CRM + Newsletter – Vinothek Krems',        'beratung',    2400, 70, heute + 14, 'Preisfrage Brevo-Kontingent.'),
    (t, k1, f_steinberg, 'bestandskunde','Erweiterung Weinexport-Modul – Steinberg', 'software112', 1200, 80, heute + 45, 'Export nach DE/CH ab Herbst.'),
    (t, k10, f_partner,  'angebot',      'Vortrag + Workshop Weinbauverband NÖ',     'schulung',    1800, 65, heute + 40, 'Termin im Oktober.'),
    (t, null, null,      'verloren',     'Weingut Musterhof – Kellerbuch',           'software112', 3200,  0, heute - 10, 'Entscheidung für Mitbewerber (Preis).');

  -- ── Aufgaben ──────────────────────────────────────────────────────────────
  insert into aufgaben (tenant_id, titel, beschreibung, status, prioritaet, verantwortlich_id, faellig_am, firma_id, kontakt_id, bereich, erstellt_von) values
    (t, 'Angebot Winzerhof Kamptal fertigstellen', 'Paket Pro, 24 Monate, Schulungstag inkludieren.', 'in_arbeit', 'hoch',   u[1], heute + 3,  f_kamptal, k8, 'crm', u[1]),
    (t, 'Demo-Umgebung für Donauhof vorbereiten', 'Bio-Beispieldaten, Behandlungsprotokoll zeigen.', 'offen',     'hoch',   u[(1 % greatest(n,1)) + 1], heute + 1, f_donau, k5, 'demo', u[1]),
    (t, 'Belege Juli verbuchen',                   'Tankbelege, Hosting-Rechnung, Bewirtung Messe.', 'offen',     'normal', u[(2 % greatest(n,1)) + 1], heute + 5, null, null, 'ea', u[1]),
    (t, 'Rieden-Import Wachauer Terrassen prüfen', 'eAMA-Export gegen Stammdaten abgleichen.',       'in_arbeit', 'normal', u[1], heute + 6,  f_wachau, k7, 'crm', u[1]),
    (t, 'Monatsabschluss Vormonat',               'Alle Buchungen abgeglichen? Dann abschließen.',   'offen',     'normal', u[1], (date_trunc('month', heute) + interval '14 days')::date, null, null, 'ea', u[1]),
    (t, 'Vortrag Weinbauverband – Folien',        'Folienentwurf nach Vorlage CD.',                  'offen',     'niedrig', u[(1 % greatest(n,1)) + 1], heute + 20, f_partner, k10, 'intern', u[1]),
    (t, 'Rückruf Vinothek Krems',                 'Brevo-Kontingente erklären.',                     'erledigt',  'normal', u[1], heute - 1, f_krems, k3, 'crm', u[1]),
    (t, 'UVA Vorquartal übermitteln',             'Nach Monatsabschlüssen in FinanzOnline eintragen.','erledigt',  'hoch',   u[1], heute - 12, null, null, 'ea', u[1]),
    (t, 'Messestand Wieselburg buchen',           'Standfläche 9 m², Strom, Internet.',              'erledigt',  'normal', u[(2 % greatest(n,1)) + 1], heute - 30, null, null, 'intern', u[1]);

  -- ── E&A: Kategorien (Kopie der Standardvorlage) ───────────────────────────
  insert into ea_kategorien (tenant_id, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung)
  select t, typ, name, konto_nr, ust_satz_std, abzugsfaehig_pct, sortierung from ea_kategorien where tenant_id is null;

  select id into kat_honorar   from ea_kategorien where tenant_id = t and name = 'Beratungshonorare';
  select id into kat_saas      from ea_kategorien where tenant_id = t and name = 'Softwarelizenzen / SaaS';
  select id into kat_projekt   from ea_kategorien where tenant_id = t and name = 'Projekt- und Implementierungserlöse';
  select id into kat_schulung  from ea_kategorien where tenant_id = t and name = 'Schulungen & Workshops';
  select id into kat_sonst_e   from ea_kategorien where tenant_id = t and name = 'Sonstige Betriebseinnahmen';
  select id into kat_fremd     from ea_kategorien where tenant_id = t and name = 'Fremdleistungen / Subunternehmer';
  select id into kat_software  from ea_kategorien where tenant_id = t and name = 'Software & Cloud-Dienste';
  select id into kat_hardware  from ea_kategorien where tenant_id = t and name = 'Hardware & Büroausstattung';
  select id into kat_telefon   from ea_kategorien where tenant_id = t and name = 'Telefon & Internet';
  select id into kat_buero     from ea_kategorien where tenant_id = t and name = 'Büro & Verwaltung';
  select id into kat_miete     from ea_kategorien where tenant_id = t and name = 'Miete & Betriebskosten';
  select id into kat_fahrt     from ea_kategorien where tenant_id = t and name = 'Fahrzeug & Reisekosten';
  select id into kat_bewirt    from ea_kategorien where tenant_id = t and name = 'Bewirtung / Repräsentation';
  select id into kat_marketing from ea_kategorien where tenant_id = t and name = 'Marketing & Werbung';
  select id into kat_stb       from ea_kategorien where tenant_id = t and name = 'Steuer- & Rechtsberatung';
  select id into kat_vers      from ea_kategorien where tenant_id = t and name = 'Versicherungen';
  select id into kat_bank      from ea_kategorien where tenant_id = t and name = 'Bankspesen & Gebühren';
  select id into kat_weiterb   from ea_kategorien where tenant_id = t and name = 'Weiterbildung';

  -- ── Konten ────────────────────────────────────────────────────────────────
  insert into konten (tenant_id, name, iban, typ, eroeffnungsdatum, eroeffnungssaldo, sortierung)
  values (t, 'Geschäftskonto Raiffeisen', 'AT61 1904 3002 3457 3201', 'giro', date_trunc('year', heute)::date, 18450.00, 1)
  returning id into konto_giro;
  insert into konten (tenant_id, name, typ, eroeffnungsdatum, eroeffnungssaldo, sortierung)
  values (t, 'Handkassa', 'kassa', date_trunc('year', heute)::date, 350.00, 2)
  returning id into konto_kassa;
  insert into konten (tenant_id, name, typ, eroeffnungsdatum, eroeffnungssaldo, sortierung)
  values (t, 'Firmenkreditkarte', 'kreditkarte', date_trunc('year', heute)::date, 0, 3)
  returning id into konto_kk;

  -- ── Daueraufträge ─────────────────────────────────────────────────────────
  insert into ea_dauerauftraege (tenant_id, typ, beschreibung, kategorie_id, konto_id, betrag_netto, ust_satz, intervall, tag_im_monat, naechste_faelligkeit) values
    (t, 'ausgabe',  'Büromiete Krems',                    kat_miete,    konto_giro, 780.00,  0, 'monatlich', 1, (date_trunc('month', heute) + interval '1 month')::date),
    (t, 'ausgabe',  'CloudHost Europe – Hosting',         kat_software, konto_kk,   149.00,  0, 'monatlich', 5, (date_trunc('month', heute) + interval '1 month' + interval '4 days')::date),
    (t, 'ausgabe',  'Mobilfunk & Internet',               kat_telefon,  konto_giro,  89.90, 20, 'monatlich', 15, (date_trunc('month', heute) + interval '1 month' + interval '14 days')::date),
    (t, 'einnahme', 'software:112 Pro – Weingut Steinberg (Lizenz)', kat_saas, konto_giro, 195.00, 20, 'monatlich', 1, (date_trunc('month', heute) + interval '1 month')::date),
    (t, 'einnahme', 'software:112 Pro – Wachauer Terrassen (Lizenz)', kat_saas, konto_giro, 195.00, 20, 'monatlich', 1, (date_trunc('month', heute) + interval '1 month')::date);

  -- ── Buchungen der letzten 6 Monate ────────────────────────────────────────
  for m in reverse 5..0 loop
    d := (date_trunc('month', heute) - (m || ' months')::interval)::date;
    -- wiederkehrende Ausgaben
    insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, betrag_netto, ust_satz, abgeglichen, import_quelle, belegnummer) values
      (t, 'ausgabe', d,      'Büromiete Krems',                     kat_miete,    konto_giro, 780.00,  0, m > 0, 'dauerauftrag', null),
      (t, 'ausgabe', d + 4,  'CloudHost Europe – Hosting',          kat_software, konto_kk,   149.00,  0, m > 0, 'dauerauftrag', 'CH-' || to_char(d, 'YYYYMM')),
      (t, 'ausgabe', d + 14, 'Mobilfunk & Internet',                kat_telefon,  konto_giro,  89.90, 20, m > 0, 'dauerauftrag', null),
      (t, 'ausgabe', d + 9,  'Bankspesen',                          kat_bank,     konto_giro,  12.40,  0, m > 0, 'manuell', null),
      (t, 'ausgabe', d + 6,  'Software-Abos (Office, Design)',      kat_software, konto_kk,    64.00, 20, m > 0, 'manuell', null);
    -- wiederkehrende Einnahmen (Lizenzen)
    insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
      (t, 'einnahme', d + 2, 'software:112 Pro – Lizenz Weingut Steinberg', kat_saas, konto_giro, f_steinberg, 195.00, 20, m > 0, 'RE-' || to_char(d, 'YYYY') || '-' || lpad((100 + (5 - m) * 4)::text, 3, '0')),
      (t, 'einnahme', d + 2, 'software:112 Pro – Lizenz Wachauer Terrassen', kat_saas, konto_giro, f_wachau, 195.00, 20, m > 0, 'RE-' || to_char(d, 'YYYY') || '-' || lpad((101 + (5 - m) * 4)::text, 3, '0'));
    -- variable Posten je Monat
    if m = 5 then
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', d + 12, 'Beratung Digitalisierungsstrategie – Steinberg (3 Tage)', kat_honorar, konto_giro, f_steinberg, 3600.00, 20, true, 'RE-' || to_char(d, 'YYYY') || '-' || '102'),
        (t, 'ausgabe',  d + 18, 'Notebook Demo-Gerät',                      kat_hardware, konto_kk,   null, 1290.00, 20, true, null),
        (t, 'ausgabe',  d + 20, 'Fahrt Krems – Spitz – Krems (Kilometergeld)', kat_fahrt, konto_kassa, null, 58.80, 0, true, null);
    elsif m = 4 then
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', d + 8,  'Implementierung software:112 – Wachauer Terrassen (Onboarding)', kat_projekt, konto_giro, f_wachau, 4800.00, 20, true, 'RE-' || to_char(d, 'YYYY') || '-' || '106'),
        (t, 'ausgabe',  d + 11, 'Steuerberatung Jahresabschluss',           kat_stb,   konto_giro, f_stb,  950.00, 20, true, 'STB-2026-17'),
        (t, 'ausgabe',  d + 22, 'Betriebshaftpflicht (Jahresprämie)',       kat_vers,  konto_giro, null,   420.00,  0, true, null);
    elsif m = 3 then
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', d + 15, 'Schulung Kellerbuch – Weingut Steinberg',  kat_schulung, konto_giro, f_steinberg, 900.00, 20, true, 'RE-' || to_char(d, 'YYYY') || '-' || '110'),
        (t, 'ausgabe',  d + 3,  'Freelancer UI-Design Dashboard',           kat_fremd, konto_giro, null, 1800.00, 20, true, null),
        (t, 'ausgabe',  d + 19, 'Google Ads – Kampagne Weinbau',            kat_marketing, konto_kk, null, 240.00, 0, true, null),
        (t, 'ausgabe',  d + 25, 'Bewirtung Kundengespräch Vinothek Krems',  kat_bewirt, konto_kassa, f_krems, 86.40, 10, true, null);
    elsif m = 2 then
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', d + 10, 'Beratung Prozessanalyse Keller – Donauhof (1 Tag)', kat_honorar, konto_giro, f_donau, 1200.00, 20, true, 'RE-' || to_char(d, 'YYYY') || '-' || '114'),
        (t, 'ausgabe',  d + 7,  'Messestand Wieselburg – Standgebühr',      kat_marketing, konto_giro, null, 1450.00, 20, true, 'WB-88213'),
        (t, 'ausgabe',  d + 16, 'Fachseminar Weinrecht',                    kat_weiterb, konto_kk, null, 390.00, 20, true, null);
    elsif m = 1 then
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', d + 6,  'Workshop Digitalisierung – Weinbauverband NÖ', kat_schulung, konto_giro, f_partner, 1800.00, 20, true, 'RE-' || to_char(d, 'YYYY') || '-' || '118'),
        (t, 'ausgabe',  d + 13, 'Roll-up + Drucksorten Messe',              kat_marketing, konto_kk, null, 318.00, 20, false, null),
        (t, 'ausgabe',  d + 21, 'Tankbeleg Dienstfahrt Langenlois',         kat_fahrt, konto_kk, null, 71.50, 20, false, null),
        (t, 'ausgabe',  d + 24, 'Bewirtung Messe Wieselburg',               kat_bewirt, konto_kassa, null, 132.70, 10, false, null);
    else
      insert into ea_transaktionen (tenant_id, typ, datum, beschreibung, kategorie_id, konto_id, firma_id, betrag_netto, ust_satz, abgeglichen, belegnummer) values
        (t, 'einnahme', least(d + 5, heute), 'Beratung Onboarding Q3 – Wachauer Terrassen', kat_honorar, konto_giro, f_wachau, 2400.00, 20, false, 'RE-' || to_char(d, 'YYYY') || '-' || '122'),
        (t, 'ausgabe',  least(d + 8, heute), 'Büromaterial & Porto',                        kat_buero, konto_kassa, null, 47.90, 20, false, null);
    end if;
  end loop;

  -- Monatsabschlüsse: alle Monate außer den letzten beiden
  for m in reverse 5..2 loop
    d := (date_trunc('month', heute) - (m || ' months')::interval)::date;
    update ea_transaktionen set is_locked = true where tenant_id = t and datum >= d and datum < (d + interval '1 month')::date;
    insert into ea_monatsabschluss (tenant_id, jahr, monat, abgeschlossen_von)
    values (t, extract(year from d)::smallint, extract(month from d)::smallint, u[1])
    on conflict do nothing;
  end loop;

  -- UVA des letzten vollständig abgeschlossenen Quartals berechnen und als übermittelt markieren
  d := (date_trunc('quarter', heute) - interval '3 months')::date;
  if not exists (
    select 1 from generate_series(0, 2) g
    where not exists (select 1 from ea_monatsabschluss
                      where tenant_id = t and jahr = extract(year from d + (g || ' months')::interval)::smallint
                        and monat = extract(month from d + (g || ' months')::interval)::smallint)
  ) then
    insert into ea_uva (tenant_id, jahr, zeitraum, bmgl_ust_0, bmgl_ust_10, bmgl_ust_13, bmgl_ust_20, ust_10, ust_13, ust_20, vst_10, vst_13, vst_20, gesperrt, gesperrt_am)
    select t, extract(year from d)::smallint, 'Q' || extract(quarter from d)::int,
           r.bmgl_0, r.bmgl_10, r.bmgl_13, r.bmgl_20, r.ust_10, r.ust_13, r.ust_20, r.vst_10, r.vst_13, r.vst_20, true, now()
    from berechne_ea_uva(t, extract(year from d)::smallint, 'Q' || extract(quarter from d)::int) r;
  end if;

  -- Umbuchung Giro → Kassa
  insert into konto_umbuchungen (tenant_id, von_konto_id, nach_konto_id, betrag, datum, beschreibung, von_abgeglichen, nach_abgeglichen)
  values (t, konto_giro, konto_kassa, 300.00, heute - 18, 'Barbehebung für Handkassa', true, true);
end;
$$;
revoke execute on function demo_zuruecksetzen() from public, anon;
grant execute on function demo_zuruecksetzen() to authenticated, service_role;

-- Erstbefüllung der Demo-Umgebung
select demo_zuruecksetzen();
