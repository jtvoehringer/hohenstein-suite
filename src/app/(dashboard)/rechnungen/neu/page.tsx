import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien } from '@/lib/ea/server'
import { heuteIso } from '@/lib/format'
import { ladeBeleg, ladeEmpfaengerAuswahl, ladeFaktEinstellungen, ladeLeistungen } from '@/lib/rechnungen/server'
import { belegartLabel, type BelegInput, type Belegart } from '@/lib/rechnungen/types'
import BelegForm from '@/components/rechnungen/BelegForm'

export const dynamic = 'force-dynamic'

type SP = { art?: string; von?: string; firma?: string; kontakt?: string }

export default async function BelegNeuPage({ searchParams }: { searchParams: Promise<SP> }) {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  if (!canWrite(membership.role)) redirect('/rechnungen')
  const tenantId = membership.tenantId

  const sp = await searchParams
  const belegart: Belegart = sp.art === 'angebot' ? 'angebot' : sp.art === 'gutschrift' ? 'gutschrift' : 'rechnung'

  const [einst, auswahl, leistungen, kategorien, quelle] = await Promise.all([
    ladeFaktEinstellungen(supabase, tenantId),
    ladeEmpfaengerAuswahl(supabase, tenantId),
    ladeLeistungen(supabase, tenantId),
    ladeKategorien(supabase, tenantId),
    sp.von ? ladeBeleg(supabase, tenantId, sp.von) : Promise.resolve(null),
  ])
  const einnahmeKategorien = kategorien.filter(k => k.typ === 'einnahme' || k.typ === 'beides').map(k => ({ id: k.id, name: k.name }))
  const ustModus = einst.ea_kleinunternehmer ? 'kleinunternehmer' : 'normal'

  let initial: BelegInput = {
    belegart, firma_id: null, kontakt_id: null,
    empf_name: '', empf_zusatz: null, empf_strasse: null, empf_plz: null, empf_ort: null, empf_land: 'AT', empf_uid: null, empf_email: null,
    datum: heuteIso(), leistung_von: null, leistung_bis: null,
    zahlungsziel_tage: belegart === 'angebot' ? 30 : einst.rechnung_zahlungsziel,
    ust_modus: ustModus,
    einleitung: belegart === 'rechnung' ? einst.rechnung_einleitung_std : belegart === 'angebot' ? 'Vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:' : null,
    schlusstext: belegart === 'rechnung' ? einst.rechnung_schluss_std : belegart === 'angebot' ? 'Wir freuen uns auf die Zusammenarbeit.' : null,
    interne_notiz: null, ea_kategorie_id: null, quelle_beleg_id: null, positionen: [],
  }

  // Vorbelegung aus Quelle (Angebot → Rechnung / Gutschrift zu Rechnung)
  if (quelle) {
    const b = quelle.beleg
    initial = {
      ...initial,
      firma_id: b.firma_id, kontakt_id: b.kontakt_id,
      empf_name: b.empf_name, empf_zusatz: b.empf_zusatz, empf_strasse: b.empf_strasse, empf_plz: b.empf_plz, empf_ort: b.empf_ort,
      empf_land: b.empf_land, empf_uid: b.empf_uid, empf_email: b.empf_email,
      leistung_von: b.leistung_von, leistung_bis: b.leistung_bis, ust_modus: b.ust_modus,
      interne_notiz: b.interne_notiz, ea_kategorie_id: b.ea_kategorie_id, quelle_beleg_id: b.id,
      positionen: quelle.positionen.map(p => ({ ...p, id: undefined })),
    }
  } else if (sp.firma || sp.kontakt) {
    // Vorbelegung aus CRM-Link (?firma=… / ?kontakt=…)
    const kontakt = sp.kontakt ? auswahl.kontakte.find(k => k.id === sp.kontakt) : null
    const firma = auswahl.firmen.find(f => f.id === (sp.firma || kontakt?.firma_id))
    if (firma) {
      initial = {
        ...initial, firma_id: firma.id, kontakt_id: kontakt?.id ?? null,
        empf_name: firma.name, empf_zusatz: kontakt ? `z.H. ${kontakt.name}` : null,
        empf_strasse: firma.strasse, empf_plz: firma.plz, empf_ort: firma.ort, empf_land: firma.land, empf_uid: firma.uid_nummer,
        empf_email: kontakt?.email || firma.email, zahlungsziel_tage: belegart === 'rechnung' ? firma.zahlungsziel_tage : initial.zahlungsziel_tage,
      }
    } else if (kontakt) {
      initial = {
        ...initial, kontakt_id: kontakt.id, empf_name: kontakt.name,
        empf_strasse: kontakt.strasse, empf_plz: kontakt.plz, empf_ort: kontakt.ort, empf_land: kontakt.land, empf_email: kontakt.email,
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={belegart === 'angebot' ? '/rechnungen/angebote' : '/rechnungen'} className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1">
          <ArrowLeft size={14} strokeWidth={1.75} /> Zurück
        </Link>
        <h1 className="text-2xl mt-1">{belegartLabel(belegart)} anlegen</h1>
        <p className="text-sm text-hs-text-2 mt-0.5">
          {quelle ? `Vorbelegt aus ${belegartLabel(quelle.beleg.belegart)} ${quelle.beleg.nummer ?? '(Entwurf)'}. ` : ''}
          Der Beleg wird als Entwurf gespeichert – die Nummer wird beim Stellen vergeben.
        </p>
      </div>
      <BelegForm
        belegart={belegart}
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
