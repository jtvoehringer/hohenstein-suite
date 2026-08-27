'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Schlichtes Overlay-Modal (weiße Karte, 1px Rahmen). Schließt bei Klick auf den Hintergrund oder Escape. */
export default function Modal({
  open, onClose, title, subtitle, children, width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-hs-navy/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-xl border border-hs-line shadow-lg w-full ${width} my-4`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-hs-line">
          <div className="min-w-0">
            <h2 className="text-base leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-hs-text-2 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen"
            className="text-hs-text-2 hover:text-hs-text rounded-lg p-1 -m-1 transition-colors">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
