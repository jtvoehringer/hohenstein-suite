import type { Config } from 'tailwindcss'

// Farb- und Typo-Tokens lt. hohenstein Corporate Design Manual v1.0 (August 2026)
// bzw. tokens.css aus Designs/HC CD. Präfix "hs" (Hohenstein Suite).
const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hs: {
          teal:       '#4F86D6', // Aktion (Buttons, aktive Zustände) – historischer Name aus software:112
          yellow:     '#FFFFFF', // Text auf Aktion-Fläche
          navy:       '#22252B', // Anthrazit – Kopfleiste (Negativ-Logo lt. CD)
          'blue-50':  '#EEF4FD',
          'blue-100': '#DCE8FA',
          'blue-300': '#77A6E7', // Logo-Blau: Marke, Diagramm-Highlight
          'blue-500': '#4F86D6',
          'blue-700': '#2F63AC', // blauer Text/Icon auf Hell (AA)
          bg:         '#F7F8FA',
          surface:    '#FFFFFF',
          line:       '#EDEEF1',
          'line-str': '#D6D8DD',
          grey:       '#99999D', // Logo-Grau
          muted:      '#6E717A',
          'text-1':   '#5A5D66',
          'text-2':   '#6E717A',
          text:       '#22252B',
          tertiary:   '#A0A3AB',
          border:     '#EDEEF1',
          ok:   '#3E9B79', 'ok-bg':   '#EAF5F0', 'ok-fg':   '#2C6B55',
          warn: '#D9A441', 'warn-bg': '#FBF3E3', 'warn-fg': '#8A6415',
          err:  '#C9564E', 'err-bg':  '#FBEEED', 'err-fg':  '#8E3A34',
        },
        icp: {
          navy:   '#14355C', // ICP Solutions (Auftragnehmer-Hinweis „powered by")
          signal: '#47A6CC',
        },
      },
      fontFamily: {
        sans:    ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl:  '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        1: '0 1px 2px rgba(29,31,36,.05)',
      },
    },
  },
  plugins: [],
}

export default config
