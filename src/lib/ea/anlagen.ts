// ── Anlagenverzeichnis: Typen und AfA-Berechnung (Migration 017) ─────────────
// Lineare AfA, österreichische Halbjahresregel: Anschaffung im 1. Halbjahr →
// volle Jahres-AfA im Anschaffungsjahr, im 2. Halbjahr → halbe. Sofort-
// abschreibung (GWG) → im Anschaffungsjahr voll abgeschrieben. Nach dem Abgang
// ist der Buchwert 0; die Rest-AfA wird im Abgangsjahr nicht mehr fortgeführt.
// Frei von Server-Imports – auch in Client-Komponenten verwendbar.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type AnlageGruppe = 'edv' | 'bueroausstattung' | 'fahrzeug' | 'maschinen' | 'immateriell' | 'sonstiges'

export const ANLAGE_GRUPPEN: { value: AnlageGruppe; label: string; nutzungsdauer: number }[] = [
  { value: 'edv',              label: 'EDV & Hardware',            nutzungsdauer: 3 },
  { value: 'bueroausstattung', label: 'Büroausstattung',            nutzungsdauer: 10 },
  { value: 'fahrzeug',         label: 'Fahrzeug',                   nutzungsdauer: 8 },
  { value: 'maschinen',        label: 'Maschinen & Geräte',         nutzungsdauer: 5 },
  { value: 'immateriell',      label: 'Immaterielle Wirtschaftsgüter (Software, Lizenzen)', nutzungsdauer: 3 },
  { value: 'sonstiges',        label: 'Sonstiges',                  nutzungsdauer: 5 },
]

export function gruppeLabel(g: string): string {
  return ANLAGE_GRUPPEN.find(x => x.value === g)?.label ?? g
}

export type AnlageRow = {
  id: string
  bezeichnung: string
  gruppe: AnlageGruppe
  anschaffungsdatum: string
  anschaffungskosten: number
  nutzungsdauer_jahre: number
  sofortabschreibung: boolean
  restwert: number
  abgang_datum: string | null
  abgang_erloes: number | null
  lieferant: string | null
  belegnummer: string | null
  notizen: string | null
}

export type AnlageInput = Omit<AnlageRow, 'id'>

export type AfaErgebnis = {
  /** AfA-Betrag, der auf das angefragte Jahr entfällt */
  afaJahr: number
  /** kumulierte AfA bis einschließlich Stichtag */
  afaKumuliert: number
  /** Buchwert zum Stichtag */
  buchwert: number
  /** Anlage zum Stichtag im Bestand (angeschafft und nicht abgegangen) */
  imBestand: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * AfA-Verteilung je Kalenderjahr ab Anschaffung. Ergebnis: Map jahr → AfA.
 * Basis ist (Anschaffungskosten − Restwert).
 */
export function afaPlan(a: Pick<AnlageRow, 'anschaffungsdatum' | 'anschaffungskosten' | 'nutzungsdauer_jahre' | 'sofortabschreibung' | 'restwert'>): Map<number, number> {
  const plan = new Map<number, number>()
  const basis = Math.max(0, a.anschaffungskosten - (a.restwert || 0))
  const jahr0 = Number(a.anschaffungsdatum.slice(0, 4))
  const monat0 = Number(a.anschaffungsdatum.slice(5, 7))
  if (basis <= 0) return plan
  if (a.sofortabschreibung || a.nutzungsdauer_jahre <= 0) { plan.set(jahr0, r2(basis)); return plan }

  const jahresAfa = basis / a.nutzungsdauer_jahre
  const ersterAnteil = monat0 <= 6 ? 1 : 0.5
  let rest = basis
  let jahr = jahr0
  let anteil = ersterAnteil
  while (rest > 0.005) {
    const betrag = Math.min(rest, jahresAfa * anteil)
    plan.set(jahr, r2(betrag))
    rest = r2(rest - betrag)
    jahr++
    anteil = 1
  }
  return plan
}

/** AfA/Buchwert zu einem Stichtag (YYYY-MM-DD); afaJahr bezieht sich auf das Jahr des Stichtags. */
export function afaZumStichtag(a: AnlageRow, stichtag: string): AfaErgebnis {
  const jahrS = Number(stichtag.slice(0, 4))
  const plan = afaPlan(a)
  if (a.anschaffungsdatum > stichtag) return { afaJahr: 0, afaKumuliert: 0, buchwert: 0, imBestand: false }
  const abgegangen = !!a.abgang_datum && a.abgang_datum <= stichtag
  let kum = 0
  for (const [j, betrag] of plan) if (j <= jahrS) kum += betrag
  kum = Math.min(kum, a.anschaffungskosten)
  const afaJahr = plan.get(jahrS) ?? 0
  if (abgegangen) return { afaJahr: 0, afaKumuliert: r2(kum), buchwert: 0, imBestand: false }
  return { afaJahr: r2(afaJahr), afaKumuliert: r2(kum), buchwert: r2(Math.max(0, a.anschaffungskosten - kum)), imBestand: true }
}

export function mapAnlage(r: R): AnlageRow {
  return {
    id: r.id, bezeichnung: r.bezeichnung, gruppe: r.gruppe ?? 'sonstiges',
    anschaffungsdatum: r.anschaffungsdatum, anschaffungskosten: Number(r.anschaffungskosten ?? 0),
    nutzungsdauer_jahre: Number(r.nutzungsdauer_jahre ?? 0), sofortabschreibung: !!r.sofortabschreibung,
    restwert: Number(r.restwert ?? 0), abgang_datum: r.abgang_datum ?? null,
    abgang_erloes: r.abgang_erloes == null ? null : Number(r.abgang_erloes),
    lieferant: r.lieferant ?? null, belegnummer: r.belegnummer ?? null, notizen: r.notizen ?? null,
  }
}

export async function ladeAnlagen(supabase: SB, tenantId: string): Promise<AnlageRow[]> {
  const { data } = await (supabase.from('anlagen') as SB)
    .select('id, bezeichnung, gruppe, anschaffungsdatum, anschaffungskosten, nutzungsdauer_jahre, sofortabschreibung, restwert, abgang_datum, abgang_erloes, lieferant, belegnummer, notizen')
    .eq('tenant_id', tenantId)
    .order('anschaffungsdatum', { ascending: false })
  return ((data ?? []) as R[]).map(mapAnlage)
}
