'use client'

import { useRouter } from 'next/navigation'

/** Jahresauswahl für Anlagenverzeichnis und Anlagenspiegel (?jahr=) */
export default function JahrWaehler({ jahre, jahr, basis }: { jahre: number[]; jahr: number; basis: string }) {
  const router = useRouter()
  return (
    <select value={jahr} onChange={e => router.push(`${basis}?jahr=${e.target.value}`)} className="input !w-auto !py-1.5 text-sm print:hidden" aria-label="Jahr">
      {jahre.map(j => <option key={j} value={j}>Jahr {j}</option>)}
    </select>
  )
}
