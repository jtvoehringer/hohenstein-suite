import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen } from '@/lib/format'
import ExportClient, { type KategorieSumme } from './ExportClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const sp = await searchParams
  const jahr = new Date().getFullYear()
  const von = ISO.test(sp.von ?? '') ? sp.von! : `${jahr}-01-01`
  const bis = ISO.test(sp.bis ?? '') ? sp.bis! : `${jahr}-12-31`

  const [{ data: txRaw }, { data: einstRaw }] = await Promise.all([
    (supabase.from('ea_transaktionen') as any)
      .select('id, typ, datum, beschreibung, kategorie_id, betrag_netto, ust_satz, ust_betrag, betrag_brutto, abzugsfaehig_pct, betrag_abzugsfaehig, belegnummer, is_locked, abgeglichen, import_quelle, notizen, ea_kategorien(name, konto_nr), konten(name), firmen(name)')
      .eq('tenant_id', tenantId).gte('datum', von).lte('datum', bis)
      .order('datum').order('erstellt_am'),
    (supabase.from('tenant_einstellungen') as any)
      .select('betrieb_name, anzeigename').eq('tenant_id', tenantId).maybeSingle(),
  ])
  const buchungen = (txRaw ?? []) as R[]
  const betriebName = ((einstRaw as R | null)?.betrieb_name ?? (einstRaw as R | null)?.anzeigename ?? 'hohenstein') as string

  const map = new Map<string, KategorieSumme>()
  for (const b of buchungen) {
    const kat = b.ea_kategorien as R | null
    const key = `${b.typ}:${b.kategorie_id ?? 'ohne'}`
    const s = map.get(key) ?? { key, name: kat?.name ?? 'Ohne Kategorie', konto_nr: kat?.konto_nr ?? null, typ: b.typ, anzahl: 0, netto: 0, ust: 0, brutto: 0, abzugsfaehig: 0 }
    s.anzahl++
    s.netto  += Number(b.betrag_netto ?? 0)
    s.ust    += Number(b.ust_betrag ?? 0)
    s.brutto += Number(b.betrag_brutto ?? 0)
    s.abzugsfaehig += Number(b.betrag_abzugsfaehig ?? b.betrag_netto ?? 0)
    map.set(key, s)
  }
  const kategorien = Array.from(map.values()).sort((a, b) => (a.konto_nr ?? 9999) - (b.konto_nr ?? 9999) || a.name.localeCompare(b.name))
  const einnahmen = kategorien.filter(k => k.typ === 'einnahme').reduce((s, k) => s + k.netto, 0)
  const ausgaben  = kategorien.filter(k => k.typ === 'ausgabe').reduce((s, k) => s + k.abzugsfaehig, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Export & Auswertung</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">Zeitraum {fmtDatum(von)} – {fmtDatum(bis)} · {buchungen.length} Buchungen</p>
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="form-label">Von</label>
            <input type="date" name="von" defaultValue={von} className="input" />
          </div>
          <div>
            <label className="form-label">Bis</label>
            <input type="date" name="bis" defaultValue={bis} className="input" />
          </div>
          <button type="submit" className="btn-secondary">Anwenden</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-4"><p className="overline">Einnahmen (netto)</p><p className="kpi text-hs-ok-fg mt-1">{fmtEuroMitZeichen(einnahmen)}</p></div>
        <div className="card !p-4"><p className="overline">Ausgaben (abzugsfähig)</p><p className="kpi mt-1">{fmtEuroMitZeichen(ausgaben)}</p></div>
        <div className="card !p-4"><p className="overline">Vorläufiger Gewinn</p><p className={`kpi mt-1 ${einnahmen - ausgaben >= 0 ? 'text-hs-ok-fg' : 'text-hs-err-fg'}`}>{fmtEuroMitZeichen(einnahmen - ausgaben)}</p></div>
      </div>

      <ExportClient buchungen={buchungen} kategorien={kategorien} von={von} bis={bis} betriebName={betriebName} />
    </div>
  )
}
