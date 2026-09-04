'use client'

import { useState, type ReactNode } from 'react'
import { User, Users } from 'lucide-react'

/** Umschalter zwischen persönlichem Postfach und gemeinsamer Team-Mailbox */
export default function KontoTabs({
  persoenlich, gemeinsamForm, gemeinsameAdresse,
}: {
  persoenlich: ReactNode
  gemeinsamForm: ReactNode
  gemeinsameAdresse: string | null
}) {
  const [tab, setTab] = useState<'privat' | 'gemeinsam'>('privat')
  const seg = (aktiv: boolean) =>
    `px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${aktiv ? 'bg-hs-teal text-white' : 'bg-white text-hs-text-1 hover:bg-hs-bg'}`
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-hs-line overflow-hidden">
        <button type="button" onClick={() => setTab('privat')} className={seg(tab === 'privat')}>
          <User size={15} strokeWidth={1.75} /> Mein Postfach
        </button>
        <button type="button" onClick={() => setTab('gemeinsam')} className={seg(tab === 'gemeinsam')}>
          <Users size={15} strokeWidth={1.75} /> Gemeinsame Mailbox{gemeinsameAdresse ? ` (${gemeinsameAdresse})` : ''}
        </button>
      </div>
      {tab === 'privat' ? persoenlich : (
        <div className="space-y-4">
          <p className="text-[12.5px] text-hs-text-2 bg-hs-blue-50 border border-hs-blue-100 rounded-lg px-3 py-2">
            Die gemeinsame Mailbox (z. B. office@hohenstein-partner.at) wird einmal für das ganze Team eingerichtet
            und erscheint bei allen zusätzlich im Posteingang – umschaltbar neben der Adresszeile.
          </p>
          {gemeinsamForm}
        </div>
      )}
    </div>
  )
}
