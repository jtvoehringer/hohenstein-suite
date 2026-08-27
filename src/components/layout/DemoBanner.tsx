'use client'

// Hinweisleiste, solange die Demo-Umgebung aktiv ist.
import Link from 'next/link'
import { FlaskConical, ArrowLeftRight } from 'lucide-react'
import { wechsleMandantAction } from '@/lib/auth/mandantActions'
import type { MandantOption } from '@/app/(dashboard)/layout'

export default function DemoBanner({ mandanten }: { mandanten: MandantOption[]; darfSchreiben: boolean }) {
  const echt = mandanten.find(m => !m.istDemo)
  return (
    <div className="bg-hs-warn-bg border-b border-hs-warn/40 text-hs-warn-fg shrink-0" data-print="hide">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 font-semibold"><FlaskConical size={14} strokeWidth={1.75} /> Demo-Umgebung</span>
        <span className="text-hs-warn-fg/80">Alle Daten sind Beispieldaten und können jederzeit zurückgesetzt werden.</span>
        <span className="ml-auto flex items-center gap-3">
          <Link href="/demo" className="underline underline-offset-2 hover:no-underline">Demo verwalten</Link>
          {echt && (
            <form action={wechsleMandantAction}>
              <input type="hidden" name="tenant_id" value={echt.tenantId} />
              <button type="submit" className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline">
                <ArrowLeftRight size={12} /> zu {echt.name}
              </button>
            </form>
          )}
        </span>
      </div>
    </div>
  )
}
