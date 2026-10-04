import type { MetadataRoute } from 'next'

// ── Web-App-Manifest (PWA) ───────────────────────────────────────────────────
// Ermöglicht „Zum Home-Bildschirm" auf iPhone/iPad (Safari) und die Installation
// in Chrome/Edge. Start direkt auf der Übersicht; ohne Login leitet der Proxy
// wie gewohnt auf /login um. Anleitung für das Team: /installieren.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Hohenstein Suite',
    short_name: 'Hohenstein',
    description: 'CRM, E&A-Rechnung und Aufgaben von Hohenstein Consulting OG',
    lang: 'de-AT',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F8FA',
    theme_color: '#22252B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
