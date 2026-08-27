// ── Summenberechnung für Belege (client- und servertauglich, keine Imports) ──
// Spiegelt die GENERATED-Spalte beleg_positionen.summe_netto:
//   round(menge * einzelpreis_netto * (1 - rabatt_pct/100), 2)

import type { PositionRow, UstModus } from './types'

export function rund2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Nettosumme einer Position (wie die DB-Spalte) */
export function positionNetto(p: Pick<PositionRow, 'menge' | 'einzelpreis_netto' | 'rabatt_pct'>): number {
  const menge = Number(p.menge) || 0
  const preis = Number(p.einzelpreis_netto) || 0
  const rabatt = Number(p.rabatt_pct) || 0
  return rund2(menge * preis * (1 - rabatt / 100))
}

export type SteuerGruppe = { satz: number; netto: number; ust: number }

export type BelegSummen = {
  netto: number
  ust: number
  brutto: number
  /** Netto/USt je Steuersatz, absteigend nach Satz */
  gruppen: SteuerGruppe[]
}

/**
 * Summen je Steuersatz + Gesamt. Bei reverse_charge/kleinunternehmer wird
 * keine USt berechnet (alle Positionen mit 0 % zusammengefasst).
 */
export function berechneSummen(positionen: PositionRow[], ustModus: UstModus = 'normal'): BelegSummen {
  const map = new Map<number, number>()
  for (const p of positionen) {
    const satz = ustModus === 'normal' ? (Number(p.ust_satz) || 0) : 0
    map.set(satz, rund2((map.get(satz) ?? 0) + positionNetto(p)))
  }
  const gruppen: SteuerGruppe[] = Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([satz, netto]) => ({ satz, netto, ust: rund2(netto * satz / 100) }))
  const netto = rund2(gruppen.reduce((s, g) => s + g.netto, 0))
  const ust = rund2(gruppen.reduce((s, g) => s + g.ust, 0))
  return { netto, ust, brutto: rund2(netto + ust), gruppen }
}

/** Effektiver Steuersatz einer Position je nach USt-Modus */
export function effektiverSatz(p: Pick<PositionRow, 'ust_satz'>, ustModus: UstModus): number {
  return ustModus === 'normal' ? (Number(p.ust_satz) || 0) : 0
}
