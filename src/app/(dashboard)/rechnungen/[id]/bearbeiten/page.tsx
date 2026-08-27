import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien } from '@/lib/ea/server'
import { ladeBeleg, ladeEmpfaengerAuswahl, ladeFaktEinstellungen, ladeLeistungen } from '@/lib/rechnungen/server'
import { belegartLabel, type BelegInput } from '@/lib/rechnungen/types'
import BelegForm from '@/components/rechnungen/BelegForm'

export const dynamic = 'force-dynamic'

export default async function BelegBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  if (!canWrite(membership.role)) redirect(`/rechnungen/${id}`)
  const tenantId = membership.tenantId

  const geladen = await ladeBeleg(supabase, tenantId, id)
  if (!geladen) notFound()
  const { beleg, positionen } = geladen
  // Gestellte Belege sind unveränderlich
  if (beleg.status !== 'entwurf') redirect(`/rechnungen/${id}`)

  const [einst, auswahl, leistungen, kategorien] = await Promise.all([
    ladeFaktEinstellungen(supabase, tenantId),
    ladeEmpfaengerAuswahl(supabase, tenantId),
    ladeLeistungen(supabase, tenantId),
    ladeKategorien(supabase, tenantId),
  ])
  const einnahmeKategorien = kategorien.filter(k => k.typ === 'einnahme' || k.typ === 'beides').map(k => ({ id: k.id, name: k.name }))

  const initial: BelegInput = {
    belegart: beleg.belegart, firma_id: beleg.firma_id, kontakt_id: beleg.kontakt_id,
    empf_name: beleg.empf_name, empf_zusatz: beleg.empf_zusatz, empf_strasse: beleg.empf_strasse, empf_plz: beleg.empf_plz,
    empf_ort: beleg.empf_ort, empf_land: beleg.empf_land, empf_uid: beleg.empf_uid, empf_email: beleg.empf_email,
    datum: beleg.datum, leistung_von: beleg.leistung_von, leistung_bis: beleg.leistung_bis,
    zahlungsziel_tage: beleg.zahlungsziel_tage, ust_modus: beleg.ust_modus,
    einleitung: beleg.einleitung, schlusstext: beleg.schlusstext, interne_notiz: beleg.interne_notiz,
    ea_kategorie_id: beleg.ea_kategorie_id, quelle_beleg_id: beleg.quelle_beleg_id, positionen,
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/rechnungen/${id}`} className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1">
          <ArrowLeft size={14} strokeWidth={1.75} /> Zurück zum Beleg
        </Link>
        <h1 className="text-2xl mt-1">{belegartLabel(beleg.belegart)} bearbeiten</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">Entwurf – Änderungen sind bis zum Stellen möglich.</p>
      </div>
      <BelegForm
        belegart={beleg.belegart}
        belegId={id}
        initial={initial}
        firmen={auswahl.firmen}
        kontakte={auswahl.kontakte}
        leistungen={leistungen}
        kategorien={einnahmeKategorien}
        ustSatzStandard={einst.ust_satz_standard}
      />
    </div>
  )
}
