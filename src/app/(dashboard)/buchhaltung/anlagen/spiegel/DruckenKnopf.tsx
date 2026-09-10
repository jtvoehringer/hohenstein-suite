'use client'

import { Printer } from 'lucide-react'

export default function DruckenKnopf() {
  return (
    <button onClick={() => window.print()} className="btn-primary print:hidden" title="Als PDF drucken (A4 quer)">
      <Printer size={15} strokeWidth={1.75} /> Drucken / PDF
    </button>
  )
}
