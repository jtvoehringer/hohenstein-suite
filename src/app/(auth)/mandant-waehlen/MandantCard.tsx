'use client'

import { useFormStatus } from 'react-dom'
import { FlaskConical, Building2 } from 'lucide-react'

export default function MandantCard({ displayName, roleLabel, istDemo }: { displayName: string; roleLabel: string; istDemo: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full text-left bg-white border border-hs-line rounded-xl px-5 py-4 hover:border-hs-blue-300 transition-colors group disabled:opacity-60 disabled:cursor-wait flex items-center gap-4">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${istDemo ? 'bg-hs-warn-bg text-hs-warn-fg' : 'bg-hs-blue-50 text-hs-blue-700'}`}>
        {istDemo ? <FlaskConical size={18} strokeWidth={1.75} /> : <Building2 size={18} strokeWidth={1.75} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-hs-text group-hover:text-hs-blue-700 transition-colors truncate">{displayName}</span>
        <span className="block text-xs text-hs-text-2 mt-0.5">{istDemo ? 'Beispieldaten · ' : ''}{roleLabel}</span>
      </span>
      <span className="text-hs-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">{pending ? '…' : '→'}</span>
    </button>
  )
}
