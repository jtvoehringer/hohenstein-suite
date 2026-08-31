'use client'

// ── software:112 Mandanten: Tabelle + Verknüpfung + Zahlungs-Sync ─────────────
// Admin-only (siehe page.tsx). Verknüpfung ist bewusst lose (kein FK, anderes
// Supabase-Projekt) – s112_tenant_id auf firmen.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RefreshCw, Link2, Unlink, Plus } from 'lucide-react'
import { fmtDatum } from '@/lib/format'
import KundenSuche from '@/components/crm/KundenSuche'
import {
  verknuepfeFirmaAction, entknuepfeFirmaAction, firmaAusMandantAnlegenAction,
  synchronisiereZahlungenAction, type SyncErgebnis,
} from './actions'

export type FirmaOption = { id: string; name: string }
export type MandantRow = {
  id: string; name: string; aktiv: boolean; erstelltAm: string
  stripeStatus: string | null; stripePlan: string | null; stripePeriodenEnde: string | null
  firma: { id: string; name: string } | null
}

const PLAN_LABEL: Record<string, string> = {
  base: 'Starter', ki_basic: 'Professional', ki_standard: 'Professional+', ki_unlimited: 'Enterprise',
}
const STATUS_META: Record<string, { label: string; cls: string }> = {
  trialing:           { label: 'Testphase',          cls: 'bg-hs-blue-50 text-hs-blue-700' },
  active:             { label: 'Aktiv',               cls: 'bg-hs-ok-bg text-hs-ok-fg' },
  past_due:           { label: 'Zahlung offen',      cls: 'bg-hs-warn-bg text-hs-warn-fg' },
  unpaid:             { label: 'Unbezahlt',          cls: 'bg-hs-err-bg text-hs-err-fg' },
  canceled:           { label: 'Gekündigt',          cls: 'bg-gray-100 text-gray-600' },
  cancelled:          { label: 'Gekündigt',          cls: 'bg-gray-100 text-gray-600' },
  paused:             { label: 'Pausiert',            cls: 'bg-gray-100 text-gray-600' },
  incomplete:         { label: 'Zahlung ausstehend', cls: 'bg-hs-warn-bg text-hs-warn-fg' },
  incomplete_expired: { label: 'Abgelaufen',         cls: 'bg-gray-100 text-gray-500' },
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[12px] text-hs-tertiary">–</span>
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
}

function VerknuepfenZelle({ mandantId, unverknuepfteFirmen }: { mandantId: string; unverknuepfteFirmen: FirmaOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [modus, setModus] = useState<'waehlen' | 'neu'>(unverknuepfteFirmen.length > 0 ? 'waehlen' : 'neu')
  const [firmaId, setFirmaId] = useState('')
  const [neuerName, setNeuerName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  function verknuepfen() {
    setFehler(null)
    start(async () => {
      const res = modus === 'neu'
        ? await firmaAusMandantAnlegenAction(mandantId, neuerName)
        : await verknuepfeFirmaAction(mandantId, firmaId)
      if (!res.ok) setFehler(res.fehler); else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {modus === 'waehlen' && unverknuepfteFirmen.length > 0 ? (
        <>
          <div className="w-56">
            <KundenSuche
              items={unverknuepfteFirmen.map(f => ({ id: f.id, label: f.name }))}
              value={firmaId} onChange={setFirmaId} placeholder="Firma suchen …"
            />
          </div>
          <button type="button" disabled={!firmaId || pending} onClick={verknuepfen} className="btn-secondary !px-2 !py-1 text-[11.5px] shrink-0">
            <Link2 size={12} strokeWidth={1.75} /> Verknüpfen
          </button>
          <button type="button" onClick={() => setModus('neu')} className="text-[11.5px] text-hs-tertiary hover:text-hs-text underline shrink-0">oder neu anlegen</button>
        </>
      ) : (
        <>
          <input value={neuerName} onChange={e => setNeuerName(e.target.value)} placeholder="Name der neuen Firma"
            className="form-input !py-2 !text-[13px] w-56" />
          <button type="button" disabled={!neuerName.trim() || pending} onClick={verknuepfen} className="btn-secondary !px-2 !py-1 text-[11.5px] shrink-0">
            <Plus size={12} strokeWidth={1.75} /> Anlegen
          </button>
          {unverknuepfteFirmen.length > 0 && (
            <button type="button" onClick={() => setModus('waehlen')} className="text-[11.5px] text-hs-tertiary hover:text-hs-text underline shrink-0">oder verknüpfen</button>
          )}
        </>
      )}
      {fehler && <span className="text-[11.5px] text-hs-err-fg basis-full">{fehler}</span>}
    </div>
  )
}

function TrennenButton({ firmaId }: { firmaId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" title="Verknüpfung aufheben" disabled={pending} className="text-hs-tertiary hover:text-hs-err-fg"
      onClick={() => {
        if (!confirm('Verknüpfung mit dieser Firma aufheben?')) return
        start(async () => { await entknuepfeFirmaAction(firmaId); router.refresh() })
      }}>
      <Unlink size={13} strokeWidth={1.75} />
    </button>
  )
}

export function MandantenTabelle({ rows, unverknuepfteFirmen }: { rows: MandantRow[]; unverknuepfteFirmen: FirmaOption[] }) {
  if (rows.length === 0) return <p className="text-sm text-hs-text-2">Keine Mandanten gefunden.</p>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-hs-text-2 border-b border-hs-line">
            <th className="px-1 py-2 font-semibold">Mandant</th>
            <th className="px-1 py-2 font-semibold min-w-[280px]">CRM-Firma</th>
            <th className="px-1 py-2 font-semibold">Status</th>
            <th className="px-1 py-2 font-semibold">Plan</th>
            <th className="px-1 py-2 font-semibold">Nächste Abrechnung</th>
            <th className="px-1 py-2 font-semibold">Angelegt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-hs-line last:border-0">
              <td className="px-1 py-2.5">
                <span className="font-medium">{r.name}</span>
                {!r.aktiv && <span className="ml-1.5 text-[10.5px] text-hs-tertiary">(inaktiv)</span>}
              </td>
              <td className="px-1 py-2.5">
                {r.firma ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Link href={`/crm/firmen/${r.firma.id}`} className="text-hs-blue-700 hover:underline">{r.firma.name}</Link>
                    <TrennenButton firmaId={r.firma.id} />
                  </span>
                ) : (
                  <VerknuepfenZelle mandantId={r.id} unverknuepfteFirmen={unverknuepfteFirmen} />
                )}
              </td>
              <td className="px-1 py-2.5"><StatusBadge status={r.stripeStatus} /></td>
              <td className="px-1 py-2.5 text-hs-text-2">{r.stripePlan ? (PLAN_LABEL[r.stripePlan] ?? r.stripePlan) : '–'}</td>
              <td className="px-1 py-2.5 text-hs-text-2 tabular-nums">{r.stripePeriodenEnde ? fmtDatum(r.stripePeriodenEnde) : '–'}</td>
              <td className="px-1 py-2.5 text-hs-tertiary tabular-nums">{fmtDatum(r.erstelltAm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SyncLeiste({ neueAnzahl }: { neueAnzahl: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ergebnis, setErgebnis] = useState<SyncErgebnis | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" disabled={pending || neueAnzahl === 0} className="btn-primary" onClick={() => {
          setFehler(null); setErgebnis(null)
          start(async () => {
            const res = await synchronisiereZahlungenAction()
            if (!res.ok) setFehler(res.fehler); else { setErgebnis(res.data ?? null); router.refresh() }
          })
        }}>
          <RefreshCw size={14} strokeWidth={1.75} className={pending ? 'animate-spin' : ''} />
          {pending ? 'Wird synchronisiert …' : 'Zahlungen synchronisieren'}
        </button>
        <span className="text-[12.5px] text-hs-text-2">
          Bucht neue Stripe-Zahlungen als E&A-Einnahme auf die verknüpfte Firma.
        </span>
      </div>
      {fehler && <p className="text-[12.5px] text-hs-err-fg">{fehler}</p>}
      {ergebnis && (
        <p className="text-[12.5px] text-hs-text-2">
          {ergebnis.gebucht} gebucht
          {ergebnis.uebersprungen > 0 && <> · {ergebnis.uebersprungen} übersprungen (Zeitraum bereits abgeschlossen)</>}
          {ergebnis.nichtVerknuepft > 0 && <> · {ergebnis.nichtVerknuepft} ohne verknüpfte Firma (zuerst oben verknüpfen)</>}
          {ergebnis.fehlermeldungen.length > 0 && <> · Fehler: {ergebnis.fehlermeldungen.join('; ')}</>}
        </p>
      )}
    </div>
  )
}
