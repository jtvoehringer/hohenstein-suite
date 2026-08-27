'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Check } from 'lucide-react'
import { demoZuruecksetzenAction } from './actions'

export default function DemoResetButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)

  const zuruecksetzen = () => {
    if (!confirm('Alle Daten der Demo-Umgebung werden gelöscht und durch frische Beispieldaten ersetzt. Fortfahren?')) return
    setMeldung(null)
    startTransition(async () => {
      const res = await demoZuruecksetzenAction()
      if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
      else { setMeldung({ art: 'ok', text: 'Demo-Daten wurden zurückgesetzt.' }); router.refresh() }
    })
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={zuruecksetzen} disabled={disabled || isPending} className="btn-danger">
        <RotateCcw size={15} strokeWidth={1.75} /> {isPending ? 'Wird zurückgesetzt …' : 'Demo-Daten zurücksetzen'}
      </button>
      {meldung && (
        <p className={`text-sm inline-flex items-center gap-1 ${meldung.art === 'ok' ? 'text-hs-ok-fg' : 'text-hs-err-fg'}`}>
          {meldung.art === 'ok' && <Check size={14} strokeWidth={2.25} />}{meldung.text}
        </p>
      )}
    </div>
  )
}
