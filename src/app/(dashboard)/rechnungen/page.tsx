import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, FileText, BookOpen, ListChecks, Inbox } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtEuroMitZeichen, heuteIso } from '@/lib/format'
import { BELEGARTEN, STATUS_LABELS, istUeberfaellig, type BelegStatus } from '@/lib/rechnungen/types'
import BelegTabelle, { LISTE_SELECT, mapListe } from '@/components/rechnungen/BelegTabelle'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

type SP = { art?: string; status?: string; jahr?: string; q?: string }

export default async function RechnungenPage({ searchParams }: { searchParams: Promise<SP> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const sp = await searchParams
  const heute = heuteIso()
  const jahrAktuell = new Date().getFullYear()
  const art = BELEGARTEN.some(b => b.value === sp.art) ? sp.art! : ''
  const status = sp.status && (sp.status in STATUS_LABELS || sp.status === 'ueberfaellig') ? sp.status : ''
  const jahr = sp.jahr === 'alle' ? 0 : (parseInt(sp.jahr ?? '') || jahrAktuell)
  const q = (sp.q ?? '').trim()

  let query = (supabase.from('belege') as any)
    .select(LISTE_SELECT)
    .eq('tenant_id', tenantId)
    .order('datum', { ascending: false })
    .order('erstellt_am', { ascending: false })
  if (art) query = query.eq('belegart', art)
  if (status && status !== 'ueberfaellig') query = query.eq('status', status)
  if (status === 'ueberfaellig') query = query.eq('belegart', 'rechnung').in('status', ['gestellt', 'teilbezahlt']).lt('faellig_am', heute)
  if (jahr) query = query.gte('datum', `${jahr}-01-01`).lte('datum', `${jahr}-12-31`)
  if (q) {
    const safe = q.replace(/[,()"'\\%]/g, ' ').trim()
    if (safe) query = query.or(`nummer.ilike.%${safe}%,empf_name.ilike.%${safe}%,interne_notiz.ilike.%${safe}%`)
  }

  const [{ data: listeRaw }, { data: offeneRaw }, { data: umsatzRaw }] = await Promise.all([
    query.limit(500),
    (supabase.from('belege') as any)
      .select('summe_brutto, bezahlt_betrag, faellig_am, status, belegart')
      .eq('tenant_id', tenantId).eq('belegart', 'rechnung').in('status', ['gestellt', 'teilbezahlt']),
    (supabase.from('belege') as any)
      .select('summe_netto')
      .eq('tenant_id', tenantId).eq('belegart', 'rechnung').in('status', ['gestellt', 'teilbezahlt', 'bezahlt'])
      .gte('datum', `${jahrAktuell}-01-01`).lte('datum', `${jahrAktuell}-12-31`),
  ])

  const belege = mapListe((listeRaw ?? []) as R[])
  let offenGesamt = 0, ueberfaellig = 0, anzUeberfaellig = 0
  for (const b of (offeneRaw ?? []) as R[]) {
    const rest = Number(b.summe_brutto ?? 0) - Number(b.bezahlt_betrag ?? 0)
    offenGesamt += rest
    if (istUeberfaellig({ belegart: b.belegart, status: b.status, faellig_am: b.faellig_am ?? null }, heute)) { ueberfaellig += rest; anzUeberfaellig++ }
  }
  const umsatzJahr = ((umsatzRaw ?? []) as R[]).reduce((s, b) => s + Number(b.summe_netto ?? 0), 0)
  const jahre = Array.from({ length: 5 }, (_, i) => jahrAktuell - i)
  const statusOptionen = (art ? (Object.keys(STATUS_LABELS) as BelegStatus[]).filter(s => {
    if (art === 'angebot') return ['entwurf', 'gesendet', 'angenommen', 'abgelehnt'].includes(s)
    if (art === 'gutschrift') return ['entwurf', 'gestellt', 'verrechnet'].includes(s)
    return ['entwurf', 'gestellt', 'teilbezahlt', 'bezahlt', 'storniert'].includes(s)
  }) : (Object.keys(STATUS_LABELS) as BelegStatus[]))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Fakturierung</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">Angebote, Rechnungen und Gutschriften · § 11 UStG</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/rechnungen/offene-posten" className="btn-secondary"><ListChecks size={16} strokeWidth={1.75} /> Offene Posten</Link>
          <Link href="/rechnungen/verbindlichkeiten" className="btn-secondary"><Inbox size={16} strokeWidth={1.75} /> Verbindlichkeiten</Link>
          <Link href="/rechnungen/leistungen" className="btn-secondary"><BookOpen size={16} strokeWidth={1.75} /> Leistungen</Link>
          {writeOk && (
            <>
              <Link href="/rechnungen/neu?art=angebot" className="btn-secondary"><FileText size={16} strokeWidth={1.75} /> Angebot</Link>
              <Link href="/rechnungen/neu?art=rechnung" className="btn-primary"><Plus size={16} strokeWidth={2} /> Rechnung</Link>
            </>
          )}
        </div>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card !p-4">
          <p className="overline">Offen gesamt</p>
          <p className="kpi mt-1">{fmtEuroMitZeichen(offenGesamt)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{((offeneRaw ?? []) as R[]).length} offene Rechnung{((offeneRaw ?? []) as R[]).length === 1 ? '' : 'en'}</p>
        </div>
        <Link href="/rechnungen?status=ueberfaellig&jahr=alle" className="card !p-4 hover:border-hs-err/40 transition-colors">
          <p className="overline">Überfällig</p>
          <p className={`kpi mt-1 ${ueberfaellig > 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(ueberfaellig)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">{anzUeberfaellig} Rechnung{anzUeberfaellig === 1 ? '' : 'en'} über Fälligkeit</p>
        </Link>
        <div className="card !p-4">
          <p className="overline">Umsatz {jahrAktuell} (netto)</p>
          <p className="kpi text-hs-ok-fg mt-1">{fmtEuroMitZeichen(umsatzJahr)}</p>
          <p className="text-xs text-hs-text-2 mt-0.5">gestellte Rechnungen ohne Storni</p>
        </div>
      </div>

      {/* Filter */}
      <form method="GET" className="card !p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="form-label">Belegart</label>
          <select name="art" defaultValue={art} className="input">
            <option value="">Alle</option>
            {BELEGARTEN.map(b => <option key={b.value} value={b.value}>{b.plural}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select name="status" defaultValue={status} className="input">
            <option value="">Alle</option>
            {statusOptionen.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            <option value="ueberfaellig">Überfällig</option>
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
          {(art || status || q || sp.jahr) && <Link href="/rechnungen" className="btn-secondary">Zurücksetzen</Link>}
        </div>
      </form>

      <BelegTabelle
        belege={belege}
        heute={heute}
        leerText={<>Keine Belege gefunden.{writeOk && <> <Link href="/rechnungen/neu?art=rechnung" className="text-hs-blue-700 hover:underline">Erste Rechnung anlegen</Link></>}</>}
      />
    </div>
  )
}
