import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/rechnungen/types'
import BelegTabelle, { LISTE_SELECT, mapListe } from '@/components/rechnungen/BelegTabelle'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

type SP = { status?: string; jahr?: string; q?: string }
const ANGEBOT_STATUS = ['entwurf', 'gesendet', 'angenommen', 'abgelehnt'] as const

export default async function AngebotePage({ searchParams }: { searchParams: Promise<SP> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const sp = await searchParams
  const jahrAktuell = new Date().getFullYear()
  const status = (ANGEBOT_STATUS as readonly string[]).includes(sp.status ?? '') ? sp.status! : ''
  const jahr = sp.jahr === 'alle' ? 0 : (parseInt(sp.jahr ?? '') || jahrAktuell)
  const q = (sp.q ?? '').trim()

  let query = (supabase.from('belege') as any)
    .select(LISTE_SELECT).eq('tenant_id', tenantId).eq('belegart', 'angebot')
    .order('datum', { ascending: false }).order('erstellt_am', { ascending: false })
  if (status) query = query.eq('status', status)
  if (jahr) query = query.gte('datum', `${jahr}-01-01`).lte('datum', `${jahr}-12-31`)
  if (q) {
    const safe = q.replace(/[,()"'\\%]/g, ' ').trim()
    if (safe) query = query.or(`nummer.ilike.%${safe}%,empf_name.ilike.%${safe}%`)
  }
  const { data } = await query.limit(500)
  const belege = mapListe((data ?? []) as R[])

  const offen = belege.filter(b => b.status === 'gesendet')
  const angenommen = belege.filter(b => b.status === 'angenommen')
  const summe = (l: typeof belege) => l.reduce((s, b) => s + b.summe_netto, 0)
  const jahre = Array.from({ length: 5 }, (_, i) => jahrAktuell - i)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/rechnungen" className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> Fakturierung</Link>
          <h1 className="text-2xl mt-1">Angebote</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">Angebote erstellen, versenden und in Rechnungen umwandeln.</p>
        </div>
        {writeOk && <Link href="/rechnungen/neu?art=angebot" className="btn-primary"><Plus size={16} strokeWidth={2} /> Angebot</Link>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="overline">Offen (gesendet)</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(summe(offen))}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{offen.length} Angebot{offen.length === 1 ? '' : 'e'} netto</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Angenommen</p>
          <p className="kpi text-hs-ok-fg mt-1">{fmtEuroMitZeichen(summe(angenommen))}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{angenommen.length} Angebot{angenommen.length === 1 ? '' : 'e'} netto</p>
        </div>
        <div className="card !p-4">
          <p className="overline">Abschlussquote</p>
          <p className="kpi mt-1">{(() => { const e = belege.filter(b => b.status === 'angenommen' || b.status === 'abgelehnt').length; return e ? Math.round(angenommen.length / e * 100) + ' %' : '–' })()}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">angenommen ÷ (angenommen + abgelehnt)</p>
        </div>
      </div>

      <form method="GET" className="card !p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="form-label">Status</label>
          <select name="status" defaultValue={status} className="input">
            <option value="">Alle</option>
            {ANGEBOT_STATUS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Jahr</label>
          <select name="jahr" defaultValue={jahr ? String(jahr) : 'alle'} className="input">
            {jahre.map(j => <option key={j} value={j}>{j}</option>)}
            <option value="alle">Alle Jahre</option>
          </select>
        </div>
        <div>
          <label className="form-label">Suche</label>
          <input name="q" defaultValue={q} className="input" placeholder="Nummer, Empfänger …" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">Filtern</button>
          {(status || q || sp.jahr) && <Link href="/rechnungen/angebote" className="btn-secondary">Zurücksetzen</Link>}
        </div>
      </form>

      <BelegTabelle
        belege={belege}
        heute={heuteIso()}
        zeigeArt={false}
        leerText={<>Keine Angebote gefunden.{writeOk && <> <Link href="/rechnungen/neu?art=angebot" className="text-hs-blue-700 hover:underline">Erstes Angebot anlegen</Link></>}</>}
      />
    </div>
  )
}
