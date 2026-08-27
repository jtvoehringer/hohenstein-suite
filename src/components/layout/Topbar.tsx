'use client'

// ── Kopfleiste (Anthrazit, Negativ-Logo lt. hohenstein-CD) ───────────────────
// Links: Logo + „Suite", daneben der aktive Mandant mit Umschalter
// (Hohenstein Consulting ↔ Demo-Umgebung). Rechts: Befehlspalette (Strg K),
// Hinweise (fällige Aufgaben/Termine aus /api/dashboard/hinweise), Benutzermenü.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Bell, LogOut, User, ChevronDown, FlaskConical, Building2, Check } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { wechsleMandantAction } from '@/lib/auth/mandantActions'
import type { MandantKontext, MandantOption } from '@/app/(dashboard)/layout'

const HINWEISE_INTERVALL_MS = 5 * 60 * 1000

export const PALETTE_EVENT  = 'hs:palette'
/** Fordert die Topbar auf, die Hinweise neu zu laden */
export const HINWEISE_EVENT = 'hs:hinweise'

export type Hinweis = { key: string; titel: string; detail: string; href: string; tone: 'warn' | 'err' }

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Topbar({ userEmail, userName, roleLabel, mandant, mandanten }: {
  userEmail: string
  userName?: string
  roleLabel: string
  mandant: MandantKontext
  mandanten: MandantOption[]
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen]       = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const [mandantOpen, setMandantOpen] = useState(false)
  const menuRef    = useRef<HTMLDivElement>(null)
  const notifRef   = useRef<HTMLDivElement>(null)
  const mandantRef = useRef<HTMLDivElement>(null)
  const displayName = userName || userEmail
  const [hinweise, setHinweise] = useState<Hinweis[] | null>(null)

  useEffect(() => {
    let aktiv = true
    const laden = async () => {
      try {
        const res = await fetch('/api/dashboard/hinweise', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (aktiv) setHinweise(Array.isArray(json.hinweise) ? json.hinweise : [])
      } catch { /* Netzfehler: alten Stand behalten */ }
    }
    void laden()
    const t = setInterval(laden, HINWEISE_INTERVALL_MS)
    window.addEventListener(HINWEISE_EVENT, laden)
    return () => { aktiv = false; clearInterval(t); window.removeEventListener(HINWEISE_EVENT, laden) }
  }, [])
  const anzahl = hinweise?.length ?? 0
  const anzahlErr = hinweise?.filter(h => h.tone === 'err').length ?? 0

  useEffect(() => {
    if (!menuOpen && !notifOpen && !mandantOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (mandantRef.current && !mandantRef.current.contains(e.target as Node)) setMandantOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen, notifOpen, mandantOpen])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-hs-navy text-white shrink-0 z-40">
      <div className="h-14 max-w-[1280px] mx-auto px-4 lg:px-6 flex items-center gap-3 lg:gap-5">

        {/* Logo (Negativ-Variante) + Produktname */}
        <Link href="/dashboard" className="shrink-0 flex items-center gap-2.5 hover:opacity-90 transition-opacity" title="Zur Übersicht">
          <Image src="/logos/hohenstein-negativ.png" alt="hohenstein consulting solutions" width={480} height={165} priority
            className="h-[26px] w-auto object-contain" />
          <span className="hidden sm:inline font-display text-[15px] font-semibold tracking-[.01em] text-white/90 border-l border-white/25 pl-2.5 leading-none">Suite</span>
        </Link>

        {/* Mandant + Umschalter */}
        <div className="min-w-0 flex-1 flex items-center h-8" ref={mandantRef}>
          <div className="relative">
            <button type="button" onClick={() => setMandantOpen(o => !o)}
              className={`inline-flex items-center gap-2 h-8 pl-2 pr-2.5 rounded-md text-[13px] transition-colors ${
                mandant.istDemo ? 'bg-hs-warn/20 text-hs-warn hover:bg-hs-warn/30' : 'text-white/85 hover:bg-white/10'
              }`}
              title="Mandant wechseln">
              {mandant.istDemo ? <FlaskConical size={15} strokeWidth={1.75} /> : <Building2 size={15} strokeWidth={1.75} className="text-white/60" />}
              <span className="truncate max-w-[260px]">{mandant.anzeigename}</span>
              {mandanten.length > 1 && <ChevronDown size={13} strokeWidth={1.75} className={`opacity-70 transition-transform ${mandantOpen ? 'rotate-180' : ''}`} />}
            </button>
            {mandantOpen && mandanten.length > 1 && (
              <div className="absolute left-0 top-10 z-50 w-64 bg-white rounded-xl border border-hs-line shadow-lg p-1.5 text-hs-text">
                <p className="overline px-2.5 pt-1.5 pb-1">Mandant</p>
                {mandanten.map(m => (
                  <form key={m.tenantId} action={wechsleMandantAction}>
                    <input type="hidden" name="tenant_id" value={m.tenantId} />
                    <button type="submit"
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left hover:bg-hs-bg ${m.tenantId === mandant.tenantId ? 'font-semibold' : ''}`}>
                      {m.istDemo ? <FlaskConical size={15} strokeWidth={1.75} className="text-hs-warn-fg" /> : <Building2 size={15} strokeWidth={1.75} className="text-hs-text-2" />}
                      <span className="flex-1 truncate">{m.name}</span>
                      {m.tenantId === mandant.tenantId && <Check size={14} className="text-hs-blue-700" />}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:gap-2.5 shrink-0">
          <button type="button" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
            className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-[13px] transition-colors"
            title="Suchen oder Befehl (Strg K)">
            <Search size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">Suchen oder Befehl …</span>
            <kbd className="hidden md:inline font-mono text-[10.5px] text-white/60 border border-white/25 rounded-sm px-1.5 py-px">Strg K</kbd>
          </button>

          {/* Hinweise */}
          <div className="relative" ref={notifRef}>
            <button type="button" onClick={() => setNotifOpen(o => !o)}
              className="relative w-8 h-8 flex items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={anzahl ? `${anzahl} Hinweise` : 'Hinweise'} title={anzahl ? `${anzahl} offene Hinweise` : 'Hinweise'}>
              <Bell size={17} strokeWidth={1.5} />
              {anzahl > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full font-mono text-[10px] font-semibold leading-[17px] text-center text-white ${anzahlErr > 0 ? 'bg-hs-err' : 'bg-hs-warn'}`}>
                  {anzahl > 99 ? '99+' : anzahl}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-10 z-50 w-80 bg-white rounded-xl border border-hs-line shadow-lg text-hs-text overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hs-line">
                  <p className="text-xs font-semibold">Hinweise</p>
                  <Link href="/aufgaben" onClick={() => setNotifOpen(false)} className="text-[11.5px] text-hs-blue-700 hover:underline">alle Aufgaben →</Link>
                </div>
                {hinweise === null ? (
                  <p className="px-3.5 py-4 text-xs text-hs-tertiary">Wird geladen …</p>
                ) : hinweise.length === 0 ? (
                  <p className="px-3.5 py-4 text-xs text-hs-tertiary">Nichts Dringendes – keine fälligen Aufgaben oder Termine.</p>
                ) : (
                  <ul className="max-h-[60vh] overflow-y-auto py-1">
                    {hinweise.map(h => (
                      <li key={h.key}>
                        <Link href={h.href} onClick={() => setNotifOpen(false)} className="flex items-start gap-2.5 px-3.5 py-2 hover:bg-hs-bg">
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${h.tone === 'err' ? 'bg-hs-err' : 'bg-hs-warn'}`} />
                          <span className="min-w-0">
                            <span className="block text-[12.5px] font-medium truncate">{h.titel}</span>
                            <span className="block text-[11px] text-hs-text-2 truncate">{h.detail}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Benutzermenü */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}
              className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-md hover:bg-white/10 transition-colors" title={displayName}>
              <span className="w-[26px] h-[26px] rounded-full bg-hs-grey text-white flex items-center justify-center text-[10.5px] font-semibold">
                {initials(displayName)}
              </span>
              <span className="hidden md:inline font-mono text-[11px] tracking-[.08em] uppercase text-white/60">{roleLabel}</span>
              <ChevronDown size={13} strokeWidth={1.75} className={`text-white/60 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-60 bg-white rounded-xl border border-hs-line shadow-lg p-1.5 text-hs-text">
                <div className="px-2.5 py-2 border-b border-hs-line mb-1">
                  <p className="text-[12.5px] font-semibold truncate">{displayName}</p>
                  <p className="text-[11px] text-hs-tertiary truncate">{userEmail}</p>
                  <p className="text-[11px] text-hs-tertiary">{roleLabel}</p>
                </div>
                <Link href="/profil" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] hover:bg-hs-bg">
                  <User size={15} strokeWidth={1.75} className="text-hs-text-2" /> Profil bearbeiten
                </Link>
                <button type="button" onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] text-left hover:bg-hs-err-bg hover:text-hs-err-fg">
                  <LogOut size={15} strokeWidth={1.75} /> Abmelden
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
