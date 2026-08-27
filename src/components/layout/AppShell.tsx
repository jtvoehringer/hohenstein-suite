'use client'

// ── App-Rahmen aller Dashboard-Seiten ────────────────────────────────────────
// Anthrazit-Kopfleiste (Topbar) mit Negativ-Logo lt. hohenstein-CD, darunter
// die zweizeilige Tab-Navigation (TabNav), ggf. der Demo-Hinweis, darunter der
// scrollende Inhalt mit Fußzeile (Dachmarke hohenstein + „powered by ICP").

import { useMemo } from 'react'
import Image from 'next/image'
import Topbar from './Topbar'
import TabNav from './TabNav'
import DemoBanner from './DemoBanner'
import CommandPalette from '@/components/CommandPalette'
import { buildNav } from '@/lib/navigation'
import type { UserRole } from '@/lib/auth/roles'
import type { MandantKontext, MandantOption } from '@/app/(dashboard)/layout'

interface Props {
  children: React.ReactNode
  userEmail: string
  userName?: string
  role: UserRole
  roleLabel: string
  mandant: MandantKontext
  mandanten: MandantOption[]
  darfSchreiben: boolean
  istAdmin: boolean
}

export const APP_VERSION = 'v0.1.0 · August 2026'

export default function AppShell({ children, userEmail, userName, role, roleLabel, mandant, mandanten, darfSchreiben }: Props) {
  const groups = useMemo(() => buildNav({ role }), [role])
  const buildSha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-hs-bg">
      <Topbar userEmail={userEmail} userName={userName} roleLabel={roleLabel} mandant={mandant} mandanten={mandanten} />
      <CommandPalette groups={groups} darfSchreiben={darfSchreiben} mandanten={mandanten} mandant={mandant} />
      <TabNav groups={groups} />
      {mandant.istDemo && <DemoBanner mandanten={mandanten} darfSchreiben={darfSchreiben} />}

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>

        <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2">
          <div className="border-t border-hs-line pt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex items-center gap-4">
              <Image src="/logos/hohenstein-farbe.png" alt="hohenstein consulting solutions" width={480} height={165}
                className="h-7 w-auto object-contain" />
              <span className="hidden sm:inline text-[11px] text-hs-tertiary">Hohenstein Suite · internes Werkzeug der Hohenstein Consulting OG</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10.5px] text-hs-tertiary">
              <span className="flex items-center gap-1.5">
                powered by
                <Image src="/logos/icp-lockup-inline-navy.svg" alt="ICP Solutions" width={2000} height={432} className="h-[20px] w-auto object-contain" />
              </span>
              <span className="text-hs-line-str">·</span>
              <span title={buildSha ? `Build ${buildSha}` : undefined}>
                {APP_VERSION}{buildSha ? ` · ${buildSha.slice(0, 7)}` : ''}
              </span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
