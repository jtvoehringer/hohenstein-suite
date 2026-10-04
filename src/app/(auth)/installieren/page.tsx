'use client'

// ── Installationsanleitung (PWA) ─────────────────────────────────────────────
// Öffentlich erreichbar (ohne Login), damit der Link /installieren per Mail
// oder Nachricht ans Team geschickt werden kann. Schwerpunkt iPhone (Safari),
// Hinweis für Android/Desktop darunter. Läuft die Seite bereits als
// installierte App, geht es direkt weiter zur Übersicht.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Share, SquarePlus, Smartphone, CircleCheck, Ellipsis } from 'lucide-react'

type Umgebung = 'unbekannt' | 'installiert' | 'ios-safari' | 'ios-anderer-browser' | 'sonstig'

function ermittleUmgebung(): Umgebung {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'installiert'
  const ua = nav.userAgent
  const istIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && nav.maxTouchPoints > 1)
  if (!istIos) return 'sonstig'
  // In-App-Browser (Mail-Vorschau, WhatsApp, Outlook …) und Chrome/Firefox auf iOS
  return /CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Outlook|WhatsApp/.test(ua) ? 'ios-anderer-browser' : 'ios-safari'
}

function Schritt({ nr, children }: { nr: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-hs-blue-500 text-white text-[12px] font-semibold flex items-center justify-center">{nr}</span>
      <div className="text-[13.5px] text-hs-text leading-relaxed pt-0.5">{children}</div>
    </li>
  )
}

export default function InstallierenPage() {
  const [umgebung, setUmgebung] = useState<Umgebung>('unbekannt')

  useEffect(() => { setUmgebung(ermittleUmgebung()) }, [])

  if (umgebung === 'installiert') {
    return (
      <div className="card text-center space-y-4">
        <CircleCheck className="w-10 h-10 mx-auto text-hs-ok" />
        <p className="text-[14px] text-hs-text">Die Hohenstein Suite ist auf diesem Gerät bereits als App installiert.</p>
        <Link href="/dashboard" className="btn-primary w-full">Zur Übersicht</Link>
      </div>
    )
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2.5">
        <Smartphone className="w-5 h-5 text-hs-blue-700" />
        <h2 className="text-lg">Als App aufs iPhone</h2>
      </div>

      {umgebung === 'ios-anderer-browser' && (
        <p className="text-[12.5px] text-hs-warn-fg bg-hs-warn-bg rounded-lg px-3 py-2">
          Bitte diese Seite in <strong>Safari</strong> öffnen – z. B. über das Kompass- bzw. „In Safari öffnen“-Symbol
          oder den Link kopieren und in Safari einfügen.
        </p>
      )}

      <ol className="space-y-4">
        <Schritt nr={1}>Diese Seite in <strong>Safari</strong> öffnen.</Schritt>
        <Schritt nr={2}>
          Auf <strong>Teilen</strong> <Share className="inline w-4 h-4 -mt-1 text-hs-blue-700" aria-label="Teilen-Symbol" /> tippen
          (unten in der Leiste; bei iOS 26 zuerst auf <Ellipsis className="inline w-4 h-4 -mt-0.5 text-hs-blue-700" aria-label="Mehr" /> und dann „Teilen“).
        </Schritt>
        <Schritt nr={3}>
          Nach unten scrollen und <strong>„Zum Home-Bildschirm“</strong> <SquarePlus className="inline w-4 h-4 -mt-1 text-hs-blue-700" aria-hidden /> wählen.
          „Als Web-App öffnen“ eingeschaltet lassen.
        </Schritt>
        <Schritt nr={4}>Rechts oben auf <strong>„Hinzufügen“</strong> tippen.</Schritt>
        <Schritt nr={5}>
          Die App <strong>„Hohenstein“</strong> am Home-Bildschirm öffnen und einmal mit der gewohnten E-Mail-Adresse und
          dem Passwort anmelden – danach bleibt man angemeldet.
        </Schritt>
      </ol>

      {umgebung === 'sonstig' && (
        <p className="text-[12px] text-hs-text-2 border-t border-hs-line pt-4">
          Android / Chrome: Menü <Ellipsis className="inline w-4 h-4 -mt-0.5 rotate-90" aria-hidden /> → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
          Am Computer (Chrome/Edge): Installations-Symbol rechts in der Adressleiste.
        </p>
      )}

      <Link href="/login" className="btn-secondary w-full">Ohne Installation anmelden</Link>
    </div>
  )
}
