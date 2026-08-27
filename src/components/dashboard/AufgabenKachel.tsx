// ── Dashboard-Kachel „Aufgaben": offen / in Arbeit / erledigt (7 Tage) ───────
// Server Component. Schnell-Statuswechsel über <form action> mit Server Action
// (statusFormAction), Klick auf die Aufgabe öffnet sie unter /aufgaben?id=….

import Link from 'next/link'
import { Plus, Play, Check, RotateCcw } from 'lucide-react'
import type { AufgabeRow, MitgliedOption } from '@/lib/aufgaben/types'
import { statusFormAction } from '@/app/(dashboard)/aufgaben/actions'
import { FaelligAm, PrioPunkt } from '@/components/aufgaben/AufgabePills'
import { Card, MehrLink } from './ui'

const SPALTEN: { status: AufgabeRow['status']; label: string; leer: string }[] = [
  { status: 'offen',     label: 'Offen',                    leer: 'Keine offenen Aufgaben.' },
  { status: 'in_arbeit', label: 'In Arbeit',                leer: 'Nichts in Arbeit.' },
  { status: 'erledigt',  label: 'Erledigt · letzte 7 Tage', leer: 'Zuletzt nichts erledigt.' },
]

function StatusButton({ id, status, title, icon: Icon }: { id: string; status: string; title: string; icon: typeof Play }) {
  return (
    <form action={statusFormAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" title={title} aria-label={title}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-hs-tertiary hover:text-hs-blue-700 hover:bg-hs-blue-50 transition-colors">
        <Icon size={14} strokeWidth={1.75} />
      </button>
    </form>
  )
}

export default function AufgabenKachel({ aufgaben, mitglieder, heute, darfSchreiben, maxJeSpalte = 6 }: {
  aufgaben: AufgabeRow[]
  mitglieder: MitgliedOption[]
  heute: string
  darfSchreiben: boolean
  maxJeSpalte?: number
}) {
  const namen = new Map(mitglieder.map(m => [m.id, m.name]))
  const offenGesamt = aufgaben.filter(a => a.status !== 'erledigt').length

  return (
    <Card
      title={<>Aufgaben <span className="font-mono text-[12px] font-normal text-hs-tertiary ml-1">{offenGesamt} offen</span></>}
      right={
        <div className="flex items-center gap-3">
          <MehrLink href="/aufgaben">alle Aufgaben</MehrLink>
          {darfSchreiben && (
            <Link href="/aufgaben?neu=1" className="btn-primary !px-3 !py-1.5 !text-[12.5px]"><Plus size={14} strokeWidth={2} /> Aufgabe</Link>
          )}
        </div>
      }>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {SPALTEN.map(sp => {
          const liste = aufgaben.filter(a => a.status === sp.status)
          const sichtbar = liste.slice(0, maxJeSpalte)
          return (
            <div key={sp.status} className="min-w-0">
              <div className="flex items-center justify-between mb-2">
                <p className="overline">{sp.label}</p>
                <span className="font-mono text-[11px] text-hs-tertiary tabular-nums">{liste.length}</span>
              </div>
              {sichtbar.length === 0 ? (
                <p className="text-[12.5px] text-hs-text-2 py-2">{sp.leer}</p>
              ) : (
                <ul className="divide-y divide-hs-line border-t border-hs-line">
                  {sichtbar.map(a => (
                    <li key={a.id} className="py-2 flex items-start gap-2 group">
                      <PrioPunkt prioritaet={a.prioritaet} className="mt-[7px]" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/aufgaben?id=${a.id}`}
                          className={`block text-[13px] font-medium truncate hover:text-hs-blue-700 ${a.status === 'erledigt' ? 'text-hs-text-2 line-through decoration-hs-line-str' : 'text-hs-text'}`}>
                          {a.titel}
                        </Link>
                        <p className="text-[11.5px] text-hs-text-2 truncate">
                          <span title="Verantwortlich">{a.verantwortlich_id ? (namen.get(a.verantwortlich_id) ?? 'Unbekannt') : 'Niemand zugewiesen'}</span>
                          <span className="text-hs-line-str mx-1.5">·</span>
                          <FaelligAm faelligAm={a.faellig_am} status={a.status} heuteIso={heute} />
                        </p>
                      </div>
                      {darfSchreiben && (
                        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                          {a.status === 'offen' && <StatusButton id={a.id} status="in_arbeit" title="In Arbeit nehmen" icon={Play} />}
                          {a.status !== 'erledigt' && <StatusButton id={a.id} status="erledigt" title="Als erledigt markieren" icon={Check} />}
                          {a.status === 'erledigt' && <StatusButton id={a.id} status="offen" title="Wieder öffnen" icon={RotateCcw} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {liste.length > sichtbar.length && (
                <Link href={`/aufgaben?status=${sp.status}`} className="inline-block mt-2 text-[11.5px] text-hs-blue-700 hover:underline">
                  +{liste.length - sichtbar.length} weitere →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
