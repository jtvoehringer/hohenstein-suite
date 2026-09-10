// ── Reporting: Unternehmens-Cockpit (server-only) ────────────────────────────
// Kennzahlen zum Stichtag aus E&A (ea_transaktionen), Fakturierung (belege),
// Verbindlichkeiten (eingangsrechnungen), Konten (Salden), Anlagenverzeichnis
// (anlagen, Migration 017) und UVA (ea_uva). Alle Abfragen mandantengescopt.
//
// Hinweis zur Systematik: Die Suite führt eine Einnahmen-Ausgaben-Rechnung.
// „Vermögen" ist daher eine Nebenrechnung: Anlagevermögen = Buchwerte laut
// Anlagenverzeichnis, Umlaufvermögen = Kontensalden + offene Forderungen,
// Verbindlichkeiten = offene Eingangsrechnungen + USt-Saldo (Schätzung).
//
// AfA (Migration 018): AfA-Buchungen (ea_transaktionen.anlage_id) sind nicht
// zahlungswirksam. Einnahmen/Aufwendungen/Kategorien/Monate zeigen die
// zahlungswirksame Sicht OHNE diese Buchungen; die AfA kommt einmal – aus dem
// Anlagenverzeichnis – als eigene Zeile dazu (sonst zählte sie doppelt).
// Anlagenkäufe (Ausgaben in Kontenklasse 0) sind aktivierungspflichtig und
// werden für das „Ergebnis nach AfA" wieder herausgerechnet.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { heuteIso, MONATE_KURZ } from '@/lib/format'
import { ladeKontenMitSaldo, type KontoMitSaldo } from '@/lib/ea/konten'
import { ladeEaEinstellungen } from '@/lib/ea/server'
import { ladeAnlagen, afaZumStichtag, gruppeLabel, type AnlageRow } from '@/lib/ea/anlagen'
import { alleZeilen } from '@/lib/supabase/alleZeilen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export type KategorieSumme = { name: string; konto_nr: number | null; netto: number; anteil: number; vorjahr: number }
export type MonatsZeile = { monat: number; label: string; einnahmen: number; ausgaben: number; ergebnis: number; kumuliert: number; vorBeginn: boolean; abgeschlossen: boolean }
export type ForderungZeile = { id: string; nummer: string | null; empfaenger: string; datum: string; faellig_am: string | null; brutto: number; offen: number; ueberfaellig: boolean; tageUeberfaellig: number }
export type VerbindlichkeitZeile = { id: string; lieferant: string; rechnungsnummer: string | null; beschreibung: string; datum: string; faellig_am: string; brutto: number; ueberfaellig: boolean; tageUeberfaellig: number }
export type AnlageZeile = { id: string; bezeichnung: string; gruppe: string; anschaffungsdatum: string; anschaffungskosten: number; afaJahr: number; buchwert: number }
export type UvaZeile = { zeitraum: string; zahllast: number; gesperrt: boolean }

export type ReportDaten = {
  mandant: string
  jahr: number
  stichtag: string
  istLaufendesJahr: boolean
  betriebsbeginn: string | null
  verfuegbareJahre: number[]
  kpi: {
    einnahmenNetto: number
    ausgabenNetto: number
    ausgabenAbzugsfaehig: number
    ergebnis: number
    einnahmenVorjahr: number
    ausgabenVorjahr: number
    ergebnisVorjahr: number
    liquiditaet: number
    forderungenOffen: number
    forderungenUeberfaellig: number
    verbindlichkeitenOffen: number
    verbindlichkeitenUeberfaellig: number
    /** Ausgaben in Kontenklasse 0 (aktivierungspflichtig) im Jahr */
    anlagenkaeufe: number
    /** AfA des Jahres laut Anlagenverzeichnis */
    afaJahr: number
    /** davon bereits als AfA-Buchung erfasst (per 31.12.) */
    afaGebucht: number
    /** Ergebnis + Anlagenkäufe − AfA (steuerlich, vereinfacht) */
    ergebnisNachAfa: number
    ergebnisNachAfaVorjahr: number
    anlagenImVerzeichnis: number
  }
  vermoegen: {
    anlagevermoegen: number
    afaJahr: number
    kontenSumme: number
    forderungen: number
    umlaufvermoegen: number
    verbindlichkeiten: number
    ustSaldoOffen: number
    nettoVermoegen: number
  }
  einnahmenKategorien: KategorieSumme[]
  ausgabenKategorien: KategorieSumme[]
  monate: MonatsZeile[]
  forderungen: ForderungZeile[]
  verbindlichkeiten: VerbindlichkeitZeile[]
  konten: KontoMitSaldo[]
  anlagen: AnlageZeile[]
  ust: { ustJahr: number; vstJahr: number; saldoJahr: number; uebermittelt: number; offen: number; uvas: UvaZeile[]; zeitraum: 'monatlich' | 'quartalsweise'; kleinunternehmer: boolean }
  monatsabschluesse: number[]
  anzahlBuchungen: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const tage = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export async function ladeReport(tenantId: string, jahrParam?: number): Promise<ReportDaten> {
  const supabase = await createSupabaseServerClient()
  const q = (t: string) => (supabase.from(t) as any)
  const heute = heuteIso()
  const aktuellesJahr = Number(heute.slice(0, 4))
  const jahr = jahrParam && jahrParam >= 2000 && jahrParam <= aktuellesJahr + 1 ? jahrParam : aktuellesJahr
  const istLaufendesJahr = jahr === aktuellesJahr
  // Stichtag: heute im laufenden Jahr, sonst Jahresende (bzw. Jahresanfang für ein künftiges Jahr)
  const stichtag = istLaufendesJahr ? heute : jahr < aktuellesJahr ? `${jahr}-12-31` : `${jahr}-01-01`
  const von = `${jahr}-01-01`, bis = `${jahr}-12-31`
  const vjVon = `${jahr - 1}-01-01`, vjBis = `${jahr - 1}-12-31`

  const [
    { data: tenant }, einst, konten, anlagenRoh,
    txRaw, vjRaw, { data: katRaw }, belegeRaw, erRaw, { data: uvaRaw }, { data: maRaw }, { data: jahreRaw },
  ] = await Promise.all([
    q('tenants').select('name').eq('id', tenantId).maybeSingle(),
    ladeEaEinstellungen(supabase, tenantId),
    ladeKontenMitSaldo(supabase, tenantId, true),
    ladeAnlagen(supabase, tenantId),
    alleZeilen(() => q('ea_transaktionen')
      .select('id, typ, datum, betrag_netto, ust_betrag, betrag_brutto, betrag_abzugsfaehig, abzugsfaehig_pct, kategorie_id, anlage_id')
      .eq('tenant_id', tenantId).gte('datum', von).lte('datum', bis).order('datum').order('id')),
    alleZeilen(() => q('ea_transaktionen')
      .select('id, typ, betrag_netto, kategorie_id, anlage_id')
      .eq('tenant_id', tenantId).gte('datum', vjVon).lte('datum', vjBis).order('id')),
    q('ea_kategorien').select('id, name, konto_nr, typ, sortierung').eq('tenant_id', tenantId),
    alleZeilen(() => q('belege')
      .select('id, nummer, empf_name, datum, faellig_am, summe_brutto, bezahlt_betrag, status')
      .eq('tenant_id', tenantId).eq('belegart', 'rechnung').in('status', ['gestellt', 'teilbezahlt'])
      .order('faellig_am').order('id')),
    alleZeilen(() => q('eingangsrechnungen')
      .select('id, lieferant, rechnungsnummer, beschreibung, datum, faellig_am, betrag_brutto')
      .eq('tenant_id', tenantId).eq('status', 'offen').order('faellig_am').order('id')),
    q('ea_uva').select('zeitraum, zahllast, gesperrt').eq('tenant_id', tenantId).eq('jahr', jahr),
    q('ea_monatsabschluss').select('monat').eq('tenant_id', tenantId).eq('jahr', jahr),
    q('ea_transaktionen').select('datum').eq('tenant_id', tenantId).order('datum', { ascending: true }).limit(1),
  ])

  const kategorien = new Map<string, { name: string; konto_nr: number | null; sortierung: number }>()
  for (const k of (katRaw ?? []) as R[]) kategorien.set(k.id, { name: k.name, konto_nr: k.konto_nr ?? null, sortierung: Number(k.sortierung ?? 0) })

  // AfA-Buchungen (anlage_id) getrennt halten – zahlungswirksame Sicht ohne sie
  const txAlle = (txRaw ?? []) as R[]
  const vjAlle = (vjRaw ?? []) as R[]
  const tx = txAlle.filter(t => !t.anlage_id)
  const vj = vjAlle.filter(t => !t.anlage_id)
  const afaGebucht = r2(txAlle.filter(t => t.anlage_id && t.typ === 'ausgabe').reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))
  const istAnlagenkauf = (t: R) => {
    if (t.typ !== 'ausgabe' || !t.kategorie_id) return false
    const k = kategorien.get(t.kategorie_id)?.konto_nr
    return k != null && k >= 1 && k < 1000
  }
  const anlagenkaeufe = r2(tx.filter(istAnlagenkauf).reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))
  const anlagenkaeufeVorjahr = r2(vj.filter(istAnlagenkauf).reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))

  // ── Einnahmen / Ausgaben nach Kategorie ────────────────────────────────────
  function nachKategorie(typ: 'einnahme' | 'ausgabe'): KategorieSumme[] {
    const map = new Map<string | null, { netto: number; vorjahr: number }>()
    for (const t of tx) if (t.typ === typ) {
      const key = (t.kategorie_id as string | null) ?? null
      const e = map.get(key) ?? { netto: 0, vorjahr: 0 }
      e.netto += Number(t.betrag_netto ?? 0); map.set(key, e)
    }
    for (const t of vj) if (t.typ === typ) {
      const key = (t.kategorie_id as string | null) ?? null
      const e = map.get(key) ?? { netto: 0, vorjahr: 0 }
      e.vorjahr += Number(t.betrag_netto ?? 0); map.set(key, e)
    }
    const gesamt = [...map.values()].reduce((s, e) => s + e.netto, 0)
    return [...map.entries()]
      .map(([id, e]) => {
        const k = id ? kategorien.get(id) : null
        return { name: k?.name ?? 'Ohne Kategorie', konto_nr: k?.konto_nr ?? null, netto: r2(e.netto), vorjahr: r2(e.vorjahr), anteil: gesamt > 0 ? e.netto / gesamt : 0, sort: k?.sortierung ?? 999 }
      })
      .filter(z => z.netto !== 0 || z.vorjahr !== 0)
      .sort((a, b) => b.netto - a.netto || a.sort - b.sort)
      .map(({ sort: _s, ...z }) => z)
  }
  const einnahmenKategorien = nachKategorie('einnahme')
  const ausgabenKategorien  = nachKategorie('ausgabe')

  const einnahmenNetto = r2(tx.filter(t => t.typ === 'einnahme').reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))
  const ausgabenNetto  = r2(tx.filter(t => t.typ === 'ausgabe').reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))
  const ausgabenAbzugsfaehig = r2(tx.filter(t => t.typ === 'ausgabe').reduce((s, t) => s + Number(t.betrag_abzugsfaehig ?? t.betrag_netto ?? 0), 0))
  const einnahmenVorjahr = r2(vj.filter(t => t.typ === 'einnahme').reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))
  const ausgabenVorjahr  = r2(vj.filter(t => t.typ === 'ausgabe').reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0))

  // ── Monatsverlauf ──────────────────────────────────────────────────────────
  const abgeschlossen = new Set(((maRaw ?? []) as R[]).map(m => Number(m.monat)))
  const monate: MonatsZeile[] = []
  let kum = 0
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    const ein = tx.filter(t => t.typ === 'einnahme' && t.datum.slice(5, 7) === mm).reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0)
    const aus = tx.filter(t => t.typ === 'ausgabe'  && t.datum.slice(5, 7) === mm).reduce((s, t) => s + Number(t.betrag_netto ?? 0), 0)
    kum += ein - aus
    const vorBeginn = !!einst.ea_betriebsbeginn && `${jahr}-${mm}-01` < einst.ea_betriebsbeginn.slice(0, 7) + '-01'
    monate.push({ monat: m, label: MONATE_KURZ[m - 1], einnahmen: r2(ein), ausgaben: r2(aus), ergebnis: r2(ein - aus), kumuliert: r2(kum), vorBeginn, abgeschlossen: abgeschlossen.has(m) })
  }

  // ── Forderungen (offene Ausgangsrechnungen) ───────────────────────────────
  const forderungen: ForderungZeile[] = ((belegeRaw ?? []) as R[]).map(b => {
    const offen = r2(Number(b.summe_brutto ?? 0) - Number(b.bezahlt_betrag ?? 0))
    const ueberfaellig = !!b.faellig_am && b.faellig_am < heute
    return { id: b.id, nummer: b.nummer ?? null, empfaenger: b.empf_name || '–', datum: b.datum, faellig_am: b.faellig_am ?? null,
      brutto: r2(Number(b.summe_brutto ?? 0)), offen, ueberfaellig, tageUeberfaellig: ueberfaellig ? tage(b.faellig_am, heute) : 0 }
  }).filter(f => f.offen > 0)
  const forderungenOffen = r2(forderungen.reduce((s, f) => s + f.offen, 0))
  const forderungenUeberfaellig = r2(forderungen.filter(f => f.ueberfaellig).reduce((s, f) => s + f.offen, 0))

  // ── Verbindlichkeiten (offene Eingangsrechnungen) ─────────────────────────
  const verbindlichkeiten: VerbindlichkeitZeile[] = ((erRaw ?? []) as R[]).map(e => {
    const ueberfaellig = e.faellig_am < heute
    return { id: e.id, lieferant: e.lieferant, rechnungsnummer: e.rechnungsnummer ?? null, beschreibung: e.beschreibung, datum: e.datum, faellig_am: e.faellig_am,
      brutto: r2(Number(e.betrag_brutto ?? 0)), ueberfaellig, tageUeberfaellig: ueberfaellig ? tage(e.faellig_am, heute) : 0 }
  })
  const verbindlichkeitenOffen = r2(verbindlichkeiten.reduce((s, v) => s + v.brutto, 0))
  const verbindlichkeitenUeberfaellig = r2(verbindlichkeiten.filter(v => v.ueberfaellig).reduce((s, v) => s + v.brutto, 0))

  // ── Umsatzsteuer ───────────────────────────────────────────────────────────
  const ustJahr = r2(tx.filter(t => t.typ === 'einnahme').reduce((s, t) => s + Number(t.ust_betrag ?? 0), 0))
  const vstJahr = r2(tx.filter(t => t.typ === 'ausgabe').reduce((s, t) => s + Number(t.ust_betrag ?? 0) * (Number(t.abzugsfaehig_pct ?? 100) / 100), 0))
  const uvas: UvaZeile[] = ((uvaRaw ?? []) as R[]).map(u => ({ zeitraum: u.zeitraum, zahllast: r2(Number(u.zahllast ?? 0)), gesperrt: !!u.gesperrt }))
    .sort((a, b) => a.zeitraum.localeCompare(b.zeitraum))
  const uebermittelt = r2(uvas.filter(u => u.gesperrt).reduce((s, u) => s + u.zahllast, 0))
  const saldoJahr = r2(ustJahr - vstJahr)
  const ustSaldoOffen = einst.ea_kleinunternehmer ? 0 : r2(saldoJahr - uebermittelt)

  // ── Anlagevermögen ─────────────────────────────────────────────────────────
  const anlagenZeilen: AnlageZeile[] = (anlagenRoh as AnlageRow[])
    .map(a => ({ a, afa: afaZumStichtag(a, stichtag) }))
    .filter(x => x.afa.imBestand)
    .map(({ a, afa }) => ({ id: a.id, bezeichnung: a.bezeichnung, gruppe: gruppeLabel(a.gruppe), anschaffungsdatum: a.anschaffungsdatum,
      anschaffungskosten: a.anschaffungskosten, afaJahr: afa.afaJahr, buchwert: afa.buchwert }))
    .sort((a, b) => b.buchwert - a.buchwert)
  const anlagevermoegen = r2(anlagenZeilen.reduce((s, a) => s + a.buchwert, 0))
  const afaJahr = r2((anlagenRoh as AnlageRow[]).reduce((s, a) => s + afaZumStichtag(a, `${jahr}-12-31`).afaJahr, 0))
  const afaVorjahr = r2((anlagenRoh as AnlageRow[]).reduce((s, a) => s + afaZumStichtag(a, `${jahr - 1}-12-31`).afaJahr, 0))

  // ── Vermögensübersicht ─────────────────────────────────────────────────────
  const kontenSumme = r2(konten.reduce((s, k) => s + k.saldo, 0))
  const umlaufvermoegen = r2(kontenSumme + forderungenOffen)
  const verbindlichkeitenGesamt = r2(verbindlichkeitenOffen + Math.max(0, ustSaldoOffen))
  const nettoVermoegen = r2(anlagevermoegen + umlaufvermoegen - verbindlichkeitenGesamt + Math.max(0, -ustSaldoOffen))

  // ── verfügbare Jahre (ab erster Buchung bzw. Betriebsbeginn) ──────────────
  const erstesDatum = ((jahreRaw ?? []) as R[])[0]?.datum as string | undefined
  const startJahr = Math.min(
    aktuellesJahr,
    erstesDatum ? Number(erstesDatum.slice(0, 4)) : aktuellesJahr,
    einst.ea_betriebsbeginn ? Number(einst.ea_betriebsbeginn.slice(0, 4)) : aktuellesJahr,
  )
  const verfuegbareJahre: number[] = []
  for (let j = aktuellesJahr; j >= startJahr; j--) verfuegbareJahre.push(j)
  if (!verfuegbareJahre.includes(jahr)) verfuegbareJahre.push(jahr)

  return {
    mandant: (tenant as R | null)?.name ?? 'Hohenstein Consulting OG',
    jahr, stichtag, istLaufendesJahr, betriebsbeginn: einst.ea_betriebsbeginn, verfuegbareJahre,
    kpi: {
      einnahmenNetto, ausgabenNetto, ausgabenAbzugsfaehig, ergebnis: r2(einnahmenNetto - ausgabenNetto),
      einnahmenVorjahr, ausgabenVorjahr, ergebnisVorjahr: r2(einnahmenVorjahr - ausgabenVorjahr),
      liquiditaet: kontenSumme, forderungenOffen, forderungenUeberfaellig, verbindlichkeitenOffen, verbindlichkeitenUeberfaellig,
      anlagenkaeufe, afaJahr, afaGebucht,
      ergebnisNachAfa: r2(einnahmenNetto - ausgabenNetto + anlagenkaeufe - afaJahr),
      ergebnisNachAfaVorjahr: r2(einnahmenVorjahr - ausgabenVorjahr + anlagenkaeufeVorjahr - afaVorjahr),
      anlagenImVerzeichnis: (anlagenRoh as AnlageRow[]).length,
    },
    vermoegen: { anlagevermoegen, afaJahr, kontenSumme, forderungen: forderungenOffen, umlaufvermoegen, verbindlichkeiten: verbindlichkeitenOffen, ustSaldoOffen, nettoVermoegen },
    einnahmenKategorien, ausgabenKategorien, monate, forderungen, verbindlichkeiten, konten, anlagen: anlagenZeilen,
    ust: { ustJahr, vstJahr, saldoJahr, uebermittelt, offen: ustSaldoOffen, uvas, zeitraum: einst.ea_uva_zeitraum, kleinunternehmer: einst.ea_kleinunternehmer },
    monatsabschluesse: [...abgeschlossen].sort((a, b) => a - b),
    anzahlBuchungen: txAlle.length,
  }
}
