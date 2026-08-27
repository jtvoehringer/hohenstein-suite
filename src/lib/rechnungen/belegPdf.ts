// ── Beleg laden + PDF rendern (Server-only; für Route-Handler und E-Mail-Versand)
import { ladeBeleg, ladeAbsender, ladeKundennummer, pdfDateiname } from './server'
import { ladeLogo, renderBelegPdf } from './pdf'
import type { BelegRow } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export async function erzeugeBelegPdf(supabase: SB, tenantId: string, belegId: string): Promise<{ buffer: Buffer; dateiname: string; beleg: BelegRow } | null> {
  const geladen = await ladeBeleg(supabase, tenantId, belegId)
  if (!geladen) return null
  const { beleg, positionen } = geladen
  const [absender, kundennummer] = await Promise.all([
    ladeAbsender(supabase, tenantId),
    ladeKundennummer(supabase, tenantId, beleg.firma_id, beleg.kontakt_id),
  ])
  const logo = await ladeLogo(absender.logo_url)
  const buffer = await renderBelegPdf({ beleg, positionen, absender, kundennummer, logo })
  return { buffer, dateiname: pdfDateiname(beleg), beleg }
}
