// ── Anlagenverzeichnis: Typen und AfA-Rechenlogik (Migrationen 017/018) ───────
// Übernommen aus KPS Smart Buchhaltung (Wellen 7/8), an die Suite angepasst.
//
// Regeln (Österreich, EStG):
// - Lineare AfA: (Anschaffungskosten − Restwert) gleichmäßig über die
//   Nutzungsdauer (§ 7 Abs. 1).
// - Halbjahresregel (§ 7 Abs. 2): Inbetriebnahme im 2. Halbjahr → im ersten
//   Jahr nur die halbe Jahres-AfA (verlängert um ein Jahr); Abgang im
//   1. Halbjahr → ebenfalls nur halbe Jahres-AfA.
// - Degressive AfA (§ 7 Abs. 1a): fester Satz (max. 30 %) vom Restbuchwert,
//   automatischer Wechsel auf linear, sobald das günstiger ist.
// - GWG (§ 13): Sofortabschreibung im Anschaffungsjahr.
// - Buchwert zum Stichtag: AfA wird jährlich per 31.12. gebucht – innerhalb
//   eines Jahres bleibt der Buchwert konstant (= Buchwert 31.12. Vorjahr).
//
// Reine Funktionen ohne Server-Imports – auch in Client-Komponenten nutzbar.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type AnlageGruppe = 'edv' | 'bueroausstattung' | 'fahrzeug' | 'maschinen' | 'immateriell' | 'sonstiges'
export type AfaMethode = 'linear' | 'degressiv' | 'gwg'

export const ANLAGE_GRUPPEN: { value: AnlageGruppe; label: string; nutzungsdauer: number; konto: string }[] = [
  { value: 'edv',              label: 'EDV & Hardware',            nutzungsdauer: 3,  konto: '0620' },
  { value: 'bueroausstattung', label: 'Büroausstattung',            nutzungsdauer: 10, konto: '0660' },
  { value: 'fahrzeug',         label: 'Fahrzeug',                   nutzungsdauer: 8,  konto: '0640' },
  { value: 'maschinen',        label: 'Maschinen & Geräte',         nutzungsdauer: 5,  konto: '0400' },
  { value: 'immateriell',      label: 'Immaterielle Wirtschaftsgüter (Software, Lizenzen)', nutzungsdauer: 3, konto: '0100' },
  { value: 'sonstiges',        label: 'Sonstiges',                  nutzungsdauer: 5,  konto: '0690' },
]
export const AFA_METHODEN: { value: AfaMethode; label: string }[] = [
  { value: 'linear',    label: 'Linear' },
  { value: 'degressiv', label: 'Degressiv (max. 30 %)' },
  { value: 'gwg',       label: 'GWG – Sofortabschreibung' },
]

export function gruppeLabel(g: string): string {
  return ANLAGE_GRUPPEN.find(x => x.value === g)?.label ?? g
}
export function methodeLabel(m: string): string {
  return m === 'gwg' ? 'GWG' : m === 'degressiv' ? 'degressiv' : 'linear'
}

export type AnlageRow = {
  id: string
  bezeichnung: string
  gruppe: AnlageGruppe
  konto_nr: string | null
  anschaffungsdatum: string
  anschaffungskosten: number
  nutzungsdauer_jahre: number
  methode: AfaMethode
  degressiv_satz: number | null
  /** abgeleitet aus methode === 'gwg' (Altfeld, Migration 017) */
  sofortabschreibung: boolean
  restwert: number
  abgang_datum: string | null
  abgang_erloes: number | null
  /** verknüpfte Anschaffungsbuchung (ea_transaktionen.id) */
  transaktion_id: string | null
  lieferant: string | null
  belegnummer: string | null
  notizen: string | null
}

export type AnlageInput = Omit<AnlageRow, 'id' | 'sofortabschreibung'>

export type AfaZeile = {
  jahr: number
  buchwertAnfang: number
  afa: number
  buchwertEnde: number
  /** halbe Jahres-AfA (Halbjahresregel) */
  halb: boolean
  /** Jahr des Abgangs – buchwertEnde ist der Restbuchwert beim Abgang */
  abgang: boolean
}

const rund = (n: number) => Math.round(n * 100) / 100
const jahrVon = (iso: string) => Number(iso.slice(0, 4))
const zweitesHalbjahr = (iso: string) => Number(iso.slice(5, 7)) >= 7

/** Jahres-AfA-Satz in Prozent, z. B. 33,33 bei 3 Jahren linear */
export function afaSatzProzent(a: Pick<AnlageRow, 'nutzungsdauer_jahre' | 'methode' | 'degressiv_satz'>): number {
  if (a.methode === 'gwg') return 100
  if (a.methode === 'degressiv') return Number(a.degressiv_satz ?? 30)
  return rund(100 / Math.max(1, a.nutzungsdauer_jahre))
}

/** Vollständiger AfA-Plan vom Zugangsjahr bis zum letzten AfA-Jahr (oder Abgang). */
export function afaPlan(a: AnlageRow): AfaZeile[] {
  const zeilen: AfaZeile[] = []
  const kosten = Number(a.anschaffungskosten)
  const rest = Math.min(Number(a.restwert ?? 0), kosten)
  const basis = rund(kosten - rest)
  if (basis <= 0) return zeilen

  const start = jahrVon(a.anschaffungsdatum)
  const abgangJahr = a.abgang_datum ? jahrVon(a.abgang_datum) : null
  const nd = Math.max(1, a.nutzungsdauer_jahre)
  const jahresAfa = rund(basis / nd)
  const halbErstesJahr = a.methode !== 'gwg' && zweitesHalbjahr(a.anschaffungsdatum)

  let buchwert = kosten
  for (let jahr = start; jahr <= start + nd + 2; jahr++) {
    const verbleibend = rund(buchwert - rest)
    if (verbleibend <= 0) break

    let afa: number
    let halb = false
    if (a.methode === 'gwg') {
      afa = verbleibend
    } else if (a.methode === 'degressiv') {
      const satz = Number(a.degressiv_satz ?? 30) / 100
      const degressiv = rund(buchwert * satz)
      const gelaufen = jahr - start
      const restJahre = Math.max(1, nd + (halbErstesJahr ? 1 : 0) - gelaufen)
      const linearRest = rund(verbleibend / restJahre)
      afa = Math.max(degressiv, linearRest)
      if (jahr === start && halbErstesJahr) { afa = rund(afa / 2); halb = true }
    } else {
      afa = jahresAfa
      if (jahr === start && halbErstesJahr) { afa = rund(jahresAfa / 2); halb = true }
    }

    let abgang = false
    if (abgangJahr !== null && jahr >= abgangJahr) {
      abgang = true
      if (jahr === abgangJahr && a.abgang_datum && !zweitesHalbjahr(a.abgang_datum) && a.methode !== 'gwg') {
        afa = rund(afa / 2); halb = true
      }
    }

    afa = rund(Math.min(afa, verbleibend))
    zeilen.push({ jahr, buchwertAnfang: rund(buchwert), afa, buchwertEnde: rund(buchwert - afa), halb, abgang })
    buchwert = rund(buchwert - afa)
    if (abgang) break
  }
  return zeilen
}

/** AfA eines Jahres (0 außerhalb des Plans) */
export function afaImJahr(a: AnlageRow, jahr: number): number {
  return afaPlan(a).find(z => z.jahr === jahr)?.afa ?? 0
}

/** Buchwert zum Stichtag: AK abzüglich AfA bis einschließlich Vorjahr (AfA wird jährlich gebucht). Nach Abgang 0. */
export function buchwertAm(a: AnlageRow, stichtag: string): number {
  if (a.abgang_datum && a.abgang_datum <= stichtag) return 0
  if (a.anschaffungsdatum > stichtag) return 0
  const jahr = jahrVon(stichtag)
  const bisVorjahr = afaPlan(a).filter(z => z.jahr < jahr)
  const letzte = bisVorjahr[bisVorjahr.length - 1]
  return letzte ? letzte.buchwertEnde : rund(Number(a.anschaffungskosten))
}

/** Buchwert am 31.12. eines Jahres */
export function buchwertEndeJahr(a: AnlageRow, jahr: number): number {
  if (a.abgang_datum && jahrVon(a.abgang_datum) <= jahr) return 0
  if (jahrVon(a.anschaffungsdatum) > jahr) return 0
  const bis = afaPlan(a).filter(z => z.jahr <= jahr)
  const letzte = bis[bis.length - 1]
  return letzte ? letzte.buchwertEnde : rund(Number(a.anschaffungskosten))
}

export type AfaErgebnis = { afaJahr: number; afaKumuliert: number; buchwert: number; imBestand: boolean }

/**
 * Kompaktsicht zum Stichtag (Reporting): afaJahr = AfA des Stichtagsjahres,
 * buchwert = Buchwert 31.12. bei Jahresende-Stichtag, sonst Buchwert 1.1. (laufendes Jahr).
 */
export function afaZumStichtag(a: AnlageRow, stichtag: string): AfaErgebnis {
  const jahr = jahrVon(stichtag)
  if (a.anschaffungsdatum > stichtag) return { afaJahr: 0, afaKumuliert: 0, buchwert: 0, imBestand: false }
  const abgegangen = !!a.abgang_datum && a.abgang_datum <= stichtag
  const jahresende = stichtag.endsWith('-12-31')
  const buchwert = abgegangen ? 0 : jahresende ? buchwertEndeJahr(a, jahr) : buchwertAm(a, stichtag)
  return {
    afaJahr: afaImJahr(a, jahr),
    afaKumuliert: rund(Number(a.anschaffungskosten) - buchwert),
    buchwert,
    imBestand: !abgegangen,
  }
}

export type Anlagenspiegel = {
  jahr: number
  anzahlAktiv: number
  anschaffungskosten: number
  zugaenge: number
  abgaenge: number
  afaJahr: number
  kumulierteAfa: number
  buchwertEnde: number
  restbuchwertAbgaenge: number
  veraeusserungserloese: number
}

export function anlagenspiegel(anlagen: AnlageRow[], jahr: number): Anlagenspiegel {
  const s: Anlagenspiegel = { jahr, anzahlAktiv: 0, anschaffungskosten: 0, zugaenge: 0, abgaenge: 0, afaJahr: 0, kumulierteAfa: 0, buchwertEnde: 0, restbuchwertAbgaenge: 0, veraeusserungserloese: 0 }
  for (const a of anlagen) {
    const zugang = jahrVon(a.anschaffungsdatum)
    const abgang = a.abgang_datum ? jahrVon(a.abgang_datum) : null
    if (zugang > jahr) continue
    const kosten = Number(a.anschaffungskosten)
    s.afaJahr += afaImJahr(a, jahr)
    if (zugang === jahr) s.zugaenge += kosten
    if (abgang === jahr) {
      s.abgaenge += kosten
      const plan = afaPlan(a)
      s.restbuchwertAbgaenge += plan[plan.length - 1]?.buchwertEnde ?? 0
      s.veraeusserungserloese += Number(a.abgang_erloes ?? 0)
    }
    if (abgang === null || abgang > jahr) {
      s.anzahlAktiv += 1
      s.anschaffungskosten += kosten
      const bw = buchwertEndeJahr(a, jahr)
      s.buchwertEnde += bw
      s.kumulierteAfa += kosten - bw
    }
  }
  for (const k of Object.keys(s) as (keyof Anlagenspiegel)[]) {
    if (k !== 'jahr' && k !== 'anzahlAktiv') (s[k] as number) = rund(s[k] as number)
  }
  return s
}

// ── AfA-Buchung am Jahresende ────────────────────────────────────────────────

export type AfaBuchungRoh = { id: string; anlage_id: string | null; betrag_netto: number; datum: string; is_locked: boolean }
export type AfaBuchungsZeile = {
  anlage: AnlageRow
  soll: number
  ist: number
  buchungId: string | null
  gesperrt: boolean
  status: 'gebucht' | 'offen' | 'abweichend' | 'ueberfluessig'
}
export type AfaBuchungsStatus = { jahr: number; zeilen: AfaBuchungsZeile[]; soll: number; ist: number; offen: number; gesperrt: number; komplett: boolean }

/** AfA laut Verzeichnis vs. gebuchte AfA-Buchungen (ea_transaktionen mit anlage_id) eines Jahres */
export function afaBuchungsStatus(anlagen: AnlageRow[], jahr: number, buchungen: AfaBuchungRoh[]): AfaBuchungsStatus {
  const gebucht = new Map<string, AfaBuchungRoh>()
  for (const b of buchungen) if (b.anlage_id && jahrVon(b.datum) === jahr) gebucht.set(b.anlage_id, b)
  const zeilen: AfaBuchungsZeile[] = []
  for (const a of anlagen) {
    const soll = afaImJahr(a, jahr)
    const b = gebucht.get(a.id)
    const ist = b ? rund(Number(b.betrag_netto)) : 0
    if (soll <= 0 && !b) continue
    const status: AfaBuchungsZeile['status'] = !b ? 'offen' : soll <= 0 ? 'ueberfluessig' : Math.abs(ist - soll) < 0.005 ? 'gebucht' : 'abweichend'
    zeilen.push({ anlage: a, soll, ist, buchungId: b?.id ?? null, gesperrt: !!b?.is_locked, status })
  }
  zeilen.sort((x, y) => x.anlage.anschaffungsdatum.localeCompare(y.anlage.anschaffungsdatum) || x.anlage.bezeichnung.localeCompare(y.anlage.bezeichnung, 'de'))
  const soll = rund(zeilen.reduce((s, z) => s + z.soll, 0))
  const ist = rund(zeilen.reduce((s, z) => s + z.ist, 0))
  const offen = zeilen.filter(z => z.status !== 'gebucht').length
  return { jahr, zeilen, soll, ist, offen, gesperrt: zeilen.filter(z => z.gesperrt).length, komplett: zeilen.length > 0 && offen === 0 }
}

// ── Anlagenspiegel je Zeile (Druckseite) ─────────────────────────────────────

export type SpiegelZeile = {
  anlage: AnlageRow
  buchwertAnfang: number
  zugang: number
  abgang: number
  afa: number
  halb: boolean
  kumulierteAfa: number
  buchwertEnde: number
  restbuchwertAbgang: number
  erloes: number
  abgegangen: boolean
}

export function anlagenspiegelZeilen(anlagen: AnlageRow[], jahr: number): { zeilen: SpiegelZeile[]; summe: Anlagenspiegel } {
  const zeilen: SpiegelZeile[] = []
  for (const a of anlagen) {
    const zugangJahr = jahrVon(a.anschaffungsdatum)
    const abgangJahr = a.abgang_datum ? jahrVon(a.abgang_datum) : null
    if (zugangJahr > jahr) continue
    if (abgangJahr !== null && abgangJahr < jahr) continue
    const kosten = rund(Number(a.anschaffungskosten))
    const plan = afaPlan(a)
    const zeile = plan.find(z => z.jahr === jahr)
    const abgegangen = abgangJahr === jahr
    const buchwertAnfang = zugangJahr === jahr ? 0 : buchwertEndeJahr(a, jahr - 1)
    const buchwertEnde = abgegangen ? 0 : buchwertEndeJahr(a, jahr)
    const restbuchwertAbgang = abgegangen ? (plan[plan.length - 1]?.buchwertEnde ?? kosten) : 0
    zeilen.push({
      anlage: a, buchwertAnfang,
      zugang: zugangJahr === jahr ? kosten : 0,
      abgang: abgegangen ? kosten : 0,
      afa: zeile?.afa ?? 0, halb: zeile?.halb ?? false,
      kumulierteAfa: rund(kosten - (abgegangen ? restbuchwertAbgang : buchwertEnde)),
      buchwertEnde, restbuchwertAbgang,
      erloes: abgegangen ? rund(Number(a.abgang_erloes ?? 0)) : 0,
      abgegangen,
    })
  }
  zeilen.sort((x, y) => gruppeLabel(x.anlage.gruppe).localeCompare(gruppeLabel(y.anlage.gruppe), 'de') || x.anlage.anschaffungsdatum.localeCompare(y.anlage.anschaffungsdatum) || x.anlage.bezeichnung.localeCompare(y.anlage.bezeichnung, 'de'))
  return { zeilen, summe: anlagenspiegel(anlagen, jahr) }
}

// ── Datenzugriff ─────────────────────────────────────────────────────────────

export const ANLAGE_SELECT = 'id, bezeichnung, gruppe, konto_nr, anschaffungsdatum, anschaffungskosten, nutzungsdauer_jahre, methode, degressiv_satz, sofortabschreibung, restwert, abgang_datum, abgang_erloes, transaktion_id, lieferant, belegnummer, notizen'

export function mapAnlage(r: R): AnlageRow {
  const methode: AfaMethode = r.methode === 'degressiv' ? 'degressiv' : r.methode === 'gwg' || r.sofortabschreibung ? 'gwg' : 'linear'
  return {
    id: r.id, bezeichnung: r.bezeichnung, gruppe: r.gruppe ?? 'sonstiges', konto_nr: r.konto_nr ?? null,
    anschaffungsdatum: r.anschaffungsdatum, anschaffungskosten: Number(r.anschaffungskosten ?? 0),
    nutzungsdauer_jahre: Number(r.nutzungsdauer_jahre ?? 0), methode,
    degressiv_satz: r.degressiv_satz == null ? null : Number(r.degressiv_satz),
    sofortabschreibung: methode === 'gwg',
    restwert: Number(r.restwert ?? 0), abgang_datum: r.abgang_datum ?? null,
    abgang_erloes: r.abgang_erloes == null ? null : Number(r.abgang_erloes),
    transaktion_id: r.transaktion_id ?? null,
    lieferant: r.lieferant ?? null, belegnummer: r.belegnummer ?? null, notizen: r.notizen ?? null,
  }
}

export async function ladeAnlagen(supabase: SB, tenantId: string): Promise<AnlageRow[]> {
  const { data } = await (supabase.from('anlagen') as SB)
    .select(ANLAGE_SELECT).eq('tenant_id', tenantId)
    .order('anschaffungsdatum', { ascending: false })
  return ((data ?? []) as R[]).map(mapAnlage)
}

/** Kandidaten für die Anschaffungsbuchung: Ausgaben in Kategorien der Kontenklasse 0, noch keiner (anderen) Anlage zugeordnet */
export type BuchungsKandidat = { id: string; datum: string; beschreibung: string; betrag_netto: number; kategorie: string; belegnummer: string | null }
export async function ladeBuchungsKandidaten(supabase: SB, tenantId: string, eigeneTransaktionId: string | null = null): Promise<BuchungsKandidat[]> {
  const [{ data: buchungen }, { data: belegt }] = await Promise.all([
    (supabase.from('ea_transaktionen') as SB)
      .select('id, datum, beschreibung, betrag_netto, belegnummer, ea_kategorien!inner(name, konto_nr)')
      .eq('tenant_id', tenantId).eq('typ', 'ausgabe')
      .gte('ea_kategorien.konto_nr', 1).lt('ea_kategorien.konto_nr', 1000)
      .order('datum', { ascending: false }).limit(200),
    (supabase.from('anlagen') as SB).select('transaktion_id').eq('tenant_id', tenantId).not('transaktion_id', 'is', null),
  ])
  const vergeben = new Set(((belegt ?? []) as R[]).map(a => a.transaktion_id as string))
  if (eigeneTransaktionId) vergeben.delete(eigeneTransaktionId)
  return ((buchungen ?? []) as R[])
    .filter(b => !vergeben.has(b.id))
    .map(b => ({ id: b.id, datum: b.datum, beschreibung: b.beschreibung, betrag_netto: Number(b.betrag_netto), kategorie: (b.ea_kategorien as R | null)?.name ?? '', belegnummer: b.belegnummer ?? null }))
}
