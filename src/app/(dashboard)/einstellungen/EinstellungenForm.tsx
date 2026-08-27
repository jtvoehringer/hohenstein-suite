'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Upload, Trash2, ImageIcon } from 'lucide-react'
import { fmtDatumZeit } from '@/lib/format'
import { einstellungenSpeichernAction, logoHochladenAction, logoEntfernenAction } from './actions'

export type Einstellungen = {
  anzeigename: string
  logo_url: string | null
  betrieb_name: string
  betrieb_strasse: string
  betrieb_plz: string
  betrieb_ort: string
  betrieb_telefon: string
  betrieb_email: string
  betrieb_website: string
  betrieb_uid: string
  betrieb_steuernummer: string
  betrieb_iban: string
  betrieb_bic: string
  kunden_prefix: string
  kunden_zaehler: number
  kunden_stellen: number
  ust_satz_standard: number
  ea_buchung_modus: string
  ea_kleinunternehmer: boolean
  ea_uva_zeitraum: string
  ea_betriebsbeginn: string
  session_timeout_minuten: number | null
  fristen_vorwarnung_tage: number
  aktualisiert_am: string | null
}

function Feld({ label, name, defaultValue, type = 'text', placeholder, hint, className = '', ...rest }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; hint?: string; className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'type' | 'name' | 'placeholder' | 'className'>) {
  return (
    <div className={className}>
      <label className="form-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="input" {...rest} />
      {hint && <p className="text-[11.5px] text-hs-tertiary mt-1">{hint}</p>}
    </div>
  )
}

export default function EinstellungenForm({ daten }: { daten: Einstellungen }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(daten.logo_url)
  const [logoBusy, setLogoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function speichern(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true); setMeldung(null)
    const res = await einstellungenSpeichernAction(new FormData(e.currentTarget))
    setSaving(false)
    if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
    else { setMeldung({ art: 'ok', text: 'Einstellungen gespeichert.' }); router.refresh() }
  }

  async function logoHochladen(file: File) {
    setLogoBusy(true); setMeldung(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await logoHochladenAction(fd)
    setLogoBusy(false)
    if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
    else { setLogoUrl(res.logo_url ?? null); setMeldung({ art: 'ok', text: 'Logo hochgeladen.' }); router.refresh() }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function logoEntfernen() {
    if (!confirm('Logo wirklich entfernen?')) return
    setLogoBusy(true); setMeldung(null)
    const res = await logoEntfernenAction()
    setLogoBusy(false)
    if (res.fehler) setMeldung({ art: 'fehler', text: res.fehler })
    else { setLogoUrl(null); setMeldung({ art: 'ok', text: 'Logo entfernt.' }); router.refresh() }
  }

  const beispielKundennummer = `${daten.kunden_prefix || 'K'}-${String(daten.kunden_zaehler).padStart(daten.kunden_stellen, '0')}`

  return (
    <div className="space-y-5">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-base mb-1">Logo</h2>
        <p className="text-[12.5px] text-hs-text-2 mb-4">Erscheint in der Kopfleiste und auf Ausdrucken. PNG, JPG, WebP oder SVG, max. 2 MB.</p>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-40 h-20 rounded-lg border border-hs-line bg-hs-bg flex items-center justify-center overflow-hidden">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
              : <ImageIcon size={22} strokeWidth={1.5} className="text-hs-tertiary" />}
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void logoHochladen(f) }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={logoBusy} className="btn-secondary">
              <Upload size={15} strokeWidth={1.75} /> {logoBusy ? 'Wird verarbeitet …' : logoUrl ? 'Logo ersetzen' : 'Logo hochladen'}
            </button>
            {logoUrl && (
              <button type="button" onClick={logoEntfernen} disabled={logoBusy} className="btn-danger">
                <Trash2 size={15} strokeWidth={1.75} /> Entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={speichern} className="space-y-5">
        {/* ── Firmendaten ──────────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base mb-1">Firmendaten</h2>
          <p className="text-[12.5px] text-hs-text-2 mb-4">Anzeigename in der Kopfleiste sowie Briefkopf-/UVA-Daten des Unternehmens.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feld label="Anzeigename (Kopfleiste)" name="anzeigename" defaultValue={daten.anzeigename} placeholder="Hohenstein Consulting" />
            <Feld label="Firmenname (rechtlich)" name="betrieb_name" defaultValue={daten.betrieb_name} placeholder="Hohenstein Consulting OG" />
            <Feld label="Straße" name="betrieb_strasse" defaultValue={daten.betrieb_strasse} className="sm:col-span-2" />
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Feld label="PLZ" name="betrieb_plz" defaultValue={daten.betrieb_plz} />
              <Feld label="Ort" name="betrieb_ort" defaultValue={daten.betrieb_ort} />
            </div>
            <Feld label="Telefon" name="betrieb_telefon" defaultValue={daten.betrieb_telefon} placeholder="+43 …" />
            <Feld label="E-Mail" name="betrieb_email" type="email" defaultValue={daten.betrieb_email} />
            <Feld label="Website" name="betrieb_website" defaultValue={daten.betrieb_website} placeholder="hohenstein-partner.at" />
            <Feld label="UID-Nummer" name="betrieb_uid" defaultValue={daten.betrieb_uid} placeholder="ATU12345678" />
            <Feld label="Steuernummer" name="betrieb_steuernummer" defaultValue={daten.betrieb_steuernummer} />
            <Feld label="IBAN" name="betrieb_iban" defaultValue={daten.betrieb_iban} placeholder="AT.. .... .... .... ...." className="font-mono" />
            <Feld label="BIC" name="betrieb_bic" defaultValue={daten.betrieb_bic} />
          </div>
        </div>

        {/* ── Nummernkreis ─────────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base mb-1">Kundennummern</h2>
          <p className="text-[12.5px] text-hs-text-2 mb-4">Werden beim Anlegen von Firmen und Kontakten fortlaufend vergeben. Nächste Nummer: <span className="font-mono text-hs-text">{beispielKundennummer}</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Feld label="Präfix" name="kunden_prefix" defaultValue={daten.kunden_prefix} maxLength={5} />
            <Feld label="Stellen" name="kunden_stellen" type="number" defaultValue={daten.kunden_stellen} min={1} max={10} hint="Anzahl der Ziffern (mit führenden Nullen)" />
          </div>
        </div>

        {/* ── E&A ──────────────────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base mb-1">E&A-Rechnung</h2>
          <p className="text-[12.5px] text-hs-text-2 mb-4">Standard-Umsatzsteuer, Erfassungsmodus und UVA-Zeitraum für Buchungen und Meldungen.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label" htmlFor="ust_satz_standard">Standard-USt-Satz</label>
              <select id="ust_satz_standard" name="ust_satz_standard" defaultValue={String(daten.ust_satz_standard)} className="input">
                <option value="20">20 %</option>
                <option value="13">13 %</option>
                <option value="10">10 %</option>
                <option value="0">0 %</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="ea_buchung_modus">Beträge erfassen als</label>
              <select id="ea_buchung_modus" name="ea_buchung_modus" defaultValue={daten.ea_buchung_modus} className="input">
                <option value="brutto">Brutto (inkl. USt)</option>
                <option value="netto">Netto (exkl. USt)</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="ea_uva_zeitraum">UVA-Zeitraum</label>
              <select id="ea_uva_zeitraum" name="ea_uva_zeitraum" defaultValue={daten.ea_uva_zeitraum} className="input">
                <option value="quartalsweise">Quartalsweise</option>
                <option value="monatlich">Monatlich</option>
              </select>
            </div>
            <Feld label="Betriebsbeginn (E&A)" name="ea_betriebsbeginn" type="date" defaultValue={daten.ea_betriebsbeginn}
              hint="Monate davor gelten nicht als offen" />
            <label className="flex items-center gap-2 text-sm text-hs-text sm:col-span-2 sm:pt-6 cursor-pointer">
              <input type="checkbox" name="ea_kleinunternehmer" defaultChecked={daten.ea_kleinunternehmer} className="accent-hs-teal" />
              Kleinunternehmerregelung (§ 6 Abs. 1 Z 27 UStG) – keine USt ausweisen
            </label>
          </div>
        </div>

        {/* ── Sitzung / Hinweise ───────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-base mb-1">Sitzung und Hinweise</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Feld label="Automatische Abmeldung (Minuten)" name="session_timeout_minuten" type="number" min={5} max={1440}
              defaultValue={daten.session_timeout_minuten ?? ''} placeholder="leer = keine" hint="Abmeldung nach Inaktivität; leer lassen für keine" />
            <Feld label="Vorwarnung für Fristen (Tage)" name="fristen_vorwarnung_tage" type="number" min={1} max={365}
              defaultValue={daten.fristen_vorwarnung_tage} hint="Wie viele Tage vorher Termine/Fristen als fällig gelten" />
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Speichern …' : 'Einstellungen speichern'}</button>
          {meldung && (
            <p className={`text-sm inline-flex items-center gap-1 ${meldung.art === 'ok' ? 'text-hs-ok-fg' : 'text-hs-err-fg'}`}>
              {meldung.art === 'ok' ? <Check size={14} strokeWidth={2.25} /> : <X size={14} strokeWidth={2.25} />}{meldung.text}
            </p>
          )}
          {daten.aktualisiert_am && <span className="text-[11.5px] text-hs-tertiary ml-auto">Zuletzt geändert {fmtDatumZeit(daten.aktualisiert_am)}</span>}
        </div>
      </form>
    </div>
  )
}
