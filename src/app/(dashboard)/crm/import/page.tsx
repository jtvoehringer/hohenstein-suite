import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import ImportClient from '@/components/crm/ImportClient'

export const metadata: Metadata = { title: 'Datenimport – Hohenstein Suite' }
export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const membership = await getCurrentMembership()
  if (!membership) redirect('/mandant-waehlen')

  if (!canWrite(membership.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl mb-4">Datenimport</h1>
        <div className="card flex items-start gap-3">
          <ShieldAlert size={18} strokeWidth={1.75} className="text-hs-warn-fg mt-0.5 shrink-0" />
          <p className="text-sm text-hs-text-2">Der CSV-Import steht nur Admins und Mitarbeitern zur Verfügung.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/crm" className="text-sm text-hs-text-2 hover:text-hs-text inline-flex items-center gap-1"><ArrowLeft size={14} strokeWidth={1.75} /> CRM</Link>
        <h1 className="text-2xl mt-1">Datenimport (CSV)</h1>
        <p className="text-sm text-hs-text-2 mt-0.5 max-w-[80ch]">
          Kontakte und Firmen aus einer CSV-Datei hochladen – z.B. aus Excel („Speichern unter" → CSV) oder einem Export des Vorsystems.
          Trennzeichen (Strichpunkt/Komma) und Umlaut-Kodierung werden automatisch erkannt, die Spalten lassen sich vor dem Import zuordnen.
        </p>
      </div>
      <ImportClient />
    </div>
  )
}
