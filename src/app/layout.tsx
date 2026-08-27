import type { Metadata, Viewport } from 'next'

// Schriften lt. hohenstein-CD: Poppins (Überschriften), IBM Plex Sans (UI),
// IBM Plex Mono (Zahlen). Selbst gehostet über @fontsource – kein Live-Fetch
// von Google Fonts beim Build.
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Hohenstein Suite',
    template: '%s | Hohenstein Suite',
  },
  description: 'CRM, E&A-Rechnung und Aufgaben von Hohenstein Consulting OG',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/favicon-180.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#4F86D6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
