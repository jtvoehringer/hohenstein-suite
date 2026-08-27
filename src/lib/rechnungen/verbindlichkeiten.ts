// ── Verbindlichkeiten (Eingangsrechnungen): Typen + reine Hilfsfunktionen ─────
// Bewusst ohne Server-Imports – wird von Client- und Server-Code verwendet.

import type { ZahlungArt } from './types'

export type EingangsrechnungStatus = 'offen' | 'bezahlt' | 'storniert'

export type EingangsrechnungRow = {
  id: string
  firma_id: string | null
  lieferant: string
  rechnungsnummer: string | null
  beschreibung: string
  datum: string
  faellig_am: string
  betrag_netto: number
  ust_satz: number
  ust_betrag: number
  betrag_brutto: number
  abzugsfaehig_pct: number
  kategorie_id: string | null
  status: EingangsrechnungStatus
  bezahlt_am: string | null
  zahlungsart: ZahlungArt | null
  konto_id: string | null
  ea_transaktion_id: string | null
  notizen: string | null
  erstellt_am: string
}

export type EingangsrechnungInput = {
  firma_id: string | null
  lieferant: string
  rechnungsnummer: string | null
  beschreibung: string
  datum: string
  faellig_am: string
  betrag_netto: number
  ust_satz: number
  abzugsfaehig_pct: number
  kategorie_id: string | null
  notizen: string | null
}

export type EingangsrechnungZahlung = {
  datum: string
  art: ZahlungArt
  konto_id: string | null
}

export const ER_STATUS_LABEL: Record<EingangsrechnungStatus, string> = {
  offen: 'Offen', bezahlt: 'Bezahlt', storniert: 'Storniert',
}

export function erStatusKlasse(status: string, ueberfaellig = false): string {
  if (status === 'bezahlt') return 'pill bg-hs-ok-bg text-hs-ok-fg'
  if (status === 'storniert') return 'pill bg-hs-bg text-hs-tertiary line-through'
  return ueberfaellig ? 'pill bg-hs-err-bg text-hs-err-fg' : 'pill bg-hs-warn-bg text-hs-warn-fg'
}

/** Brutto aus Netto + Satz – identisch zur generierten DB-Spalte */
export function erBrutto(netto: number, satz: number): number {
  const ust = Math.round(netto * satz) / 100
  return Math.round((netto + ust) * 100) / 100
}

/** Netto aus Brutto zurückrechnen (Lieferantenrechnungen weisen meist Brutto aus) */
export function erNettoAusBrutto(brutto: number, satz: number): number {
  return Math.round((brutto / (1 + satz / 100)) * 100) / 100
}
