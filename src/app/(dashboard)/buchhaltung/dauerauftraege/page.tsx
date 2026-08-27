import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite, canAdmin } from '@/lib/auth/roles'
import { ladeKategorien, ladeKonten } from '@/lib/ea/server'
import DauerauftraegeClient from './DauerauftraegeClient'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export default async function DauerauftraegePage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId

  const [{ data: daRaw }, { data: logRaw }, kategorien, konten] = await Promise.all([
    (supabase.from('ea_dauerauftraege') as any)
      .select('id, typ, beschreibung, kategorie_id, konto_id, betrag_netto, ust_satz, intervall, tag_im_monat, naechste_faelligkeit, aktiv, notizen, erstellt_am, ea_kategorien(name), konten(name)')
      .eq('tenant_id', tenantId)
      .order('aktiv', { ascending: false })
      .order('naechste_faelligkeit'),
    (supabase.from('ea_dauerauftrag_log') as any)
      .select('id, status, ea_transaktion_id, fehler_details, erstellt_am, ea_dauerauftraege(beschreibung), ea_transaktionen(datum)')
      .eq('tenant_id', tenantId)
      .order('erstellt_am', { ascending: false })
      .limit(25),
    ladeKategorien(supabase, tenantId),
    ladeKonten(supabase, tenantId),
  ])

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl">Daueraufträge</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Wiederkehrende Einnahmen und Ausgaben (Miete, Abos, Wartungspauschalen) – werden zur Fälligkeit automatisch gebucht.</p>
      </div>
      <DauerauftraegeClient
        dauerauftraege={(daRaw ?? []) as R[]}
        log={(logRaw ?? []) as R[]}
        kategorien={kategorien}
        konten={konten}
        writeOk={canWrite(membership.role)}
        adminOk={canAdmin(membership.role)}
      />
    </div>
  )
}
