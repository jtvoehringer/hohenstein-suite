'use client'

import { useRouter } from 'next/navigation'
import { Printer, RefreshCw } from 'lucide-react'

/** Jahresauswahl + Drucken/PDF für den Unternehmens-Report */
export default function ReportSteuerung({ jahr, jahre }: { jahr: number; jahre: number[] }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 print:hidden">
      <select value={jahr} onChange={e => router.push(`/reporting?jahr=${e.target.value}`)} className="input !w-auto !py-1.5 text-sm" aria-label="Geschäftsjahr">
        {jahre.map(j => <option key={j} value={j}>Geschäftsjahr {j}</option>)}
      </select>
      <button onClick={() => router.refresh()} className="btn-secondary" title="Neu laden"><RefreshCw size={15} strokeWidth={1.75} /></button>
      <button onClick={() => window.print()} className="btn-primary" title="Als PDF drucken"><Printer size={15} strokeWidth={1.75} /> Drucken / PDF</button>
    </div>
  )
}
