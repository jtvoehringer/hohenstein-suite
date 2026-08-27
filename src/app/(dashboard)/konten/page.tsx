import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Landmark, CreditCard, Wallet, Circle, Plus, type LucideIcon } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { fmtDatum, fmtEuroMitZeichen } from '@/lib/format'
import { kontoTypLabel } from '@/lib/ea/types'
import { ladeKontenMitSaldo } from '@/lib/ea/konten'
import UmbuchungForm from '@/components/ea/UmbuchungForm'

export const dynamic = 'force-dynamic'

const TYP_ICON: Record<string, LucideIcon> = { giro: Landmark, kreditkarte: CreditCard, kassa: Wallet, sonstiges: Circle }

export default async function KontenPage() {
  const supabase   = await createSupabaseServerClient()
  const membership = await getCurrentMembership()
  if (!membership?.tenantId) redirect('/login')
  const tenantId = membership.tenantId
  const writeOk  = canWrite(membership.role)

  const konten = await ladeKontenMitSaldo(supabase, tenantId, false)
  const aktive = konten.filter(k => k.aktiv)
  const inaktive = konten.filter(k => !k.aktiv)
  const gesamt = aktive.reduce((s, k) => s + k.saldo, 0)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Konten</h1>
          <p className="text-sm text-hs-text-2 mt-0.5">Bankkonten und Kassa · Salden aus Buchungen und Umbuchungen · Kontoabstimmung</p>
        </div>
        <div className="flex items-center gap-2">
          {writeOk && <Link href="/konten/neu" className="btn-primary"><Plus size={16} strokeWidth={2} /> Konto</Link>}
        </div>
      </div>

      {aktive.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm text-hs-text-2">Noch keine Konten angelegt.</p>
          {writeOk && <Link href="/konten/neu" className="btn-primary mt-3"><Plus size={16} strokeWidth={2} /> Erstes Konto anlegen</Link>}
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {aktive.map(k => {
            const Icon = TYP_ICON[k.typ] ?? Circle
            return (
              <Link key={k.id} href={`/konten/${k.id}/abstimmung`}
                className="flex items-center justify-between gap-4 px-5 py-4 border-b border-hs-line last:border-0 hover:bg-hs-bg/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={20} strokeWidth={1.5} className="text-hs-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{k.name}</p>
                    <p className="text-xs text-hs-text-2 truncate">
                      {kontoTypLabel(k.typ)}{k.iban ? ` · ${k.iban}` : ''} · eröffnet {fmtDatum(k.eroeffnungsdatum)}
                      {k.anzahlOffen > 0 ? ` · ${k.anzahlOffen} nicht abgeglichen` : k.anzahlBewegungen > 0 ? ' · abgestimmt' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`kpi text-xl ${k.saldo < 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(k.saldo)}</p>
                  {k.anzahlOffen > 0 && <p className="text-xs text-hs-text-2 font-mono tabular-nums">abgeglichen {fmtEuroMitZeichen(k.saldoAbgeglichen)}</p>}
                </div>
              </Link>
            )
          })}
          {aktive.length > 1 && (
            <div className="flex items-center justify-between px-5 py-3 bg-hs-bg/60 border-t border-hs-line-str">
              <span className="text-sm font-semibold">Gesamt</span>
              <span className={`betrag font-semibold ${gesamt < 0 ? 'text-hs-err-fg' : ''}`}>{fmtEuroMitZeichen(gesamt)}</span>
            </div>
          )}
        </div>
      )}

      {writeOk && aktive.length >= 2 && (
        <UmbuchungForm konten={aktive.map(k => ({ id: k.id, name: k.name }))} kompakt />
      )}

      {inaktive.length > 0 && (
        <div className="card !p-0 overflow-hidden opacity-70">
          <div className="px-4 py-2.5 border-b border-hs-line"><h2 className="text-sm font-semibold text-hs-text-2">Inaktive Konten</h2></div>
          {inaktive.map(k => (
            <Link key={k.id} href={`/konten/${k.id}/abstimmung`} className="flex items-center justify-between px-5 py-3 border-b border-hs-line last:border-0 hover:bg-hs-bg/60 text-sm">
              <span>{k.name} <span className="text-hs-text-2">· {kontoTypLabel(k.typ)}</span></span>
              <span className="betrag">{fmtEuroMitZeichen(k.saldo)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
