// ── Beleg-PDF (Rechnung/Angebot/Gutschrift) mit @react-pdf/renderer ──────────
// Server-only (liest das Logo vom Dateisystem bzw. per fetch). Wird sowohl vom
// Download-Endpunkt (/api/rechnungen/[id]/pdf) als auch für den E-Mail-Anhang
// verwendet. Layout im hohenstein-CD: Standardfonts (Helvetica), Logo-Blau,
// Anthrazit-Text. Keine Font-Registrierung, kein Font-Download.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { Absender, BelegRow, PositionRow } from './types'
import { belegartLabel, empfaengerZeilen, ustModusHinweis } from './types'
import { berechneSummen, positionNetto, effektiverSatz } from './summen'

// ── Formatierung (de-AT) ──────────────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function eur(n: number): string { return `€ ${fmt(n)}` }
function fmtMenge(n: number): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
}
function datum(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (Number.isNaN(d.getTime())) return '–'
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Farben lt. CD ─────────────────────────────────────────────────────────────
const BLAU = '#4F86D6'
const BLAU_DUNKEL = '#2F63AC'
const TEXT = '#22252B'
const TEXT_2 = '#6E717A'
const TERTIAER = '#A0A3AB'
const LINIE = '#EDEEF1'
const LINIE_STARK = '#D6D8DD'
const HINTERGRUND = '#F7F8FA'

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 90, paddingHorizontal: 48, fontSize: 9.5, fontFamily: 'Helvetica', color: TEXT, lineHeight: 1.4 },
  kopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  logo: { width: 150, height: 48, objectFit: 'contain', objectPosition: 'left' },
  absenderName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: TEXT },
  absenderKlein: { fontSize: 8, color: TEXT_2, marginTop: 2 },
  absenderZeile: { fontSize: 7.5, color: TERTIAER, marginBottom: 6, textDecoration: 'underline' },
  empfaenger: { width: 250, minHeight: 80 },
  empfName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  empfZeile: { fontSize: 9.5 },
  empfEmail: { fontSize: 8, color: TEXT_2, marginTop: 3 },
  meta: { width: 210 },
  metaZeile: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 1.5 },
  metaLabel: { fontSize: 8, color: TEXT_2, width: 90, paddingRight: 6 },
  metaWert: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right', flex: 1 },
  titel: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BLAU_DUNKEL, marginBottom: 2, marginTop: 10 },
  untertitel: { fontSize: 9, color: TEXT_2, marginBottom: 14 },
  einleitung: { fontSize: 9.5, marginBottom: 12 },
  tabKopf: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: BLAU, paddingBottom: 5, marginBottom: 2 },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TEXT_2, textTransform: 'uppercase', letterSpacing: 0.6 },
  zeile: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.75, borderBottomColor: LINIE },
  cPos: { width: 26, fontSize: 8.5, color: TEXT_2 },
  cBez: { flex: 1, paddingRight: 8 },
  cMenge: { width: 44, textAlign: 'right' },
  cEinh: { width: 48, paddingLeft: 6, color: TEXT_2 },
  cPreis: { width: 68, textAlign: 'right' },
  cUst: { width: 36, textAlign: 'right', color: TEXT_2 },
  cBetrag: { width: 74, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  bez: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  beschr: { fontSize: 8, color: TEXT_2, marginTop: 1.5 },
  rabatt: { fontSize: 7.5, color: TERTIAER, marginTop: 1 },
  summen: { alignSelf: 'flex-end', width: 250, marginTop: 12 },
  sumZeile: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  sumLabel: { fontSize: 9, color: TEXT_2 },
  sumWert: { fontSize: 9, textAlign: 'right' },
  sumBrutto: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, paddingBottom: 6, borderTopWidth: 1.5, borderTopColor: BLAU, borderBottomWidth: 1.5, borderBottomColor: BLAU },
  sumBruttoLabel: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  sumBruttoWert: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: BLAU_DUNKEL },
  hinweisBox: { marginTop: 14, padding: 8, backgroundColor: HINTERGRUND, borderLeftWidth: 2, borderLeftColor: BLAU, fontSize: 8.5, color: TEXT_2 },
  block: { marginTop: 18 },
  blockTitel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TEXT_2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  blockText: { fontSize: 9.5 },
  bankZeile: { fontSize: 9, color: TEXT_2, marginTop: 1 },
  schluss: { marginTop: 18, fontSize: 9.5 },
  fuss: { position: 'absolute', bottom: 34, left: 48, right: 48, borderTopWidth: 0.75, borderTopColor: LINIE_STARK, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  fussSpalte: { flex: 1, paddingRight: 8 },
  fussText: { fontSize: 7, color: TEXT_2, lineHeight: 1.45 },
  fussTitel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: TEXT },
  seite: { position: 'absolute', bottom: 18, right: 48, fontSize: 7, color: TERTIAER },
})

export type BelegPdfProps = {
  beleg: BelegRow
  positionen: PositionRow[]
  absender: Absender
  kundennummer: string | null
  /** PNG/JPG-Rohdaten des Logos (oder null → Textname) */
  logo: { data: Buffer; format: 'png' | 'jpg' } | null
}

function titelFuer(beleg: BelegRow): string {
  if (beleg.belegart === 'rechnung' && beleg.status === 'storniert') return 'Rechnung (storniert)'
  return belegartLabel(beleg.belegart)
}

export function BelegDocument({ beleg, positionen, absender, kundennummer, logo }: BelegPdfProps) {
  const summen = berechneSummen(positionen, beleg.ust_modus)
  const hinweis = ustModusHinweis(beleg.ust_modus)
  const istRechnung = beleg.belegart === 'rechnung'
  const istAngebot = beleg.belegart === 'angebot'
  const absenderZeile = [absender.name, absender.strasse, [absender.plz, absender.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  const leistungszeitraum = beleg.leistung_von || beleg.leistung_bis
    ? (beleg.leistung_von && beleg.leistung_bis && beleg.leistung_von !== beleg.leistung_bis
        ? `${datum(beleg.leistung_von)} – ${datum(beleg.leistung_bis)}`
        : datum(beleg.leistung_von ?? beleg.leistung_bis))
    : null
  const nummerLabel = istAngebot ? 'Angebotsnummer' : istRechnung ? 'Rechnungsnummer' : 'Gutschriftsnummer'
  const titel = titelFuer(beleg)

  return (
    <Document title={`${titel} ${beleg.nummer ?? ''}`.trim()} author={absender.name} creator="Hohenstein Suite">
      <Page size="A4" style={s.page}>
        {/* Kopf: Logo links, Absenderdaten rechts */}
        <View style={s.kopf}>
          <View>
            {logo
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image src={{ data: logo.data, format: logo.format }} style={s.logo} />
              : <Text style={s.absenderName}>{absender.name}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.absenderName, { fontSize: 10 }]}>{absender.name}</Text>
            {absender.strasse && <Text style={s.absenderKlein}>{absender.strasse}</Text>}
            {(absender.plz || absender.ort) && <Text style={s.absenderKlein}>{[absender.plz, absender.ort].filter(Boolean).join(' ')}</Text>}
            {absender.telefon && <Text style={s.absenderKlein}>{absender.telefon}</Text>}
            {absender.email && <Text style={s.absenderKlein}>{absender.email}</Text>}
            {absender.website && <Text style={s.absenderKlein}>{absender.website}</Text>}
          </View>
        </View>

        {/* Empfänger + Metadaten */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={s.empfaenger}>
            <Text style={s.absenderZeile}>{absenderZeile}</Text>
            {empfaengerZeilen(beleg).map((z, i) => (
              <Text key={i} style={i === 0 ? s.empfName : s.empfZeile}>{z}</Text>
            ))}
            {beleg.empf_uid && <Text style={s.empfZeile}>UID: {beleg.empf_uid}</Text>}
            {beleg.empf_email && <Text style={s.empfEmail}>{beleg.empf_email}</Text>}
          </View>
          <View style={s.meta}>
            <View style={s.metaZeile}><Text style={s.metaLabel}>{nummerLabel}</Text><Text style={s.metaWert}>{beleg.nummer ?? 'Entwurf'}</Text></View>
            <View style={s.metaZeile}><Text style={s.metaLabel}>Datum</Text><Text style={s.metaWert}>{datum(beleg.datum)}</Text></View>
            {leistungszeitraum && (
              <View style={s.metaZeile}><Text style={s.metaLabel}>Leistungszeitraum</Text><Text style={s.metaWert}>{leistungszeitraum}</Text></View>
            )}
            {istRechnung && beleg.faellig_am && (
              <View style={s.metaZeile}><Text style={s.metaLabel}>Fällig am</Text><Text style={s.metaWert}>{datum(beleg.faellig_am)}</Text></View>
            )}
            {istAngebot && (
              <View style={s.metaZeile}><Text style={s.metaLabel}>Gültig bis</Text><Text style={s.metaWert}>{datum(beleg.faellig_am)}</Text></View>
            )}
            {kundennummer && (
              <View style={s.metaZeile}><Text style={s.metaLabel}>Kundennummer</Text><Text style={s.metaWert}>{kundennummer}</Text></View>
            )}
            {absender.uid && (
              <View style={s.metaZeile}><Text style={s.metaLabel}>Unsere UID</Text><Text style={s.metaWert}>{absender.uid}</Text></View>
            )}
          </View>
        </View>

        {/* Titel */}
        <Text style={s.titel}>{titel}{beleg.nummer ? ` ${beleg.nummer}` : ''}</Text>
        {beleg.belegart === 'gutschrift' && beleg.quelle_beleg_id && (
          <Text style={s.untertitel}>Gutschrift zu einer bereits gestellten Rechnung</Text>
        )}
        {!(beleg.belegart === 'gutschrift' && beleg.quelle_beleg_id) && <View style={{ marginBottom: 10 }} />}

        {beleg.einleitung && <Text style={s.einleitung}>{beleg.einleitung}</Text>}

        {/* Positionstabelle */}
        <View style={s.tabKopf} fixed>
          <Text style={[s.th, s.cPos]}>Pos</Text>
          <Text style={[s.th, s.cBez]}>Bezeichnung</Text>
          <Text style={[s.th, s.cMenge]}>Menge</Text>
          <Text style={[s.th, s.cEinh]}>Einheit</Text>
          <Text style={[s.th, s.cPreis]}>Einzelpreis</Text>
          <Text style={[s.th, s.cUst]}>USt</Text>
          <Text style={[s.th, s.cBetrag]}>Betrag</Text>
        </View>
        {positionen.map((p, i) => (
          <View key={p.id ?? i} style={s.zeile} wrap={false}>
            <Text style={s.cPos}>{p.pos}</Text>
            <View style={s.cBez}>
              <Text style={s.bez}>{p.bezeichnung}</Text>
              {p.beschreibung && <Text style={s.beschr}>{p.beschreibung}</Text>}
              {Number(p.rabatt_pct) > 0 && <Text style={s.rabatt}>Rabatt {fmtMenge(Number(p.rabatt_pct))} %</Text>}
            </View>
            <Text style={s.cMenge}>{fmtMenge(Number(p.menge))}</Text>
            <Text style={s.cEinh}>{p.einheit}</Text>
            <Text style={s.cPreis}>{fmt(Number(p.einzelpreis_netto))}</Text>
            <Text style={s.cUst}>{effektiverSatz(p, beleg.ust_modus)} %</Text>
            <Text style={s.cBetrag}>{fmt(positionNetto(p))}</Text>
          </View>
        ))}

        {/* Summenblock */}
        <View style={s.summen} wrap={false}>
          {summen.gruppen.length > 1
            ? summen.gruppen.map(g => (
                <View key={`n${g.satz}`} style={s.sumZeile}>
                  <Text style={s.sumLabel}>Netto {g.satz} %</Text>
                  <Text style={s.sumWert}>{eur(g.netto)}</Text>
                </View>
              ))
            : null}
          <View style={s.sumZeile}>
            <Text style={[s.sumLabel, { fontFamily: 'Helvetica-Bold', color: TEXT }]}>Nettobetrag</Text>
            <Text style={[s.sumWert, { fontFamily: 'Helvetica-Bold' }]}>{eur(summen.netto)}</Text>
          </View>
          {beleg.ust_modus === 'normal'
            ? summen.gruppen.map(g => (
                <View key={`u${g.satz}`} style={s.sumZeile}>
                  <Text style={s.sumLabel}>USt {g.satz} %{summen.gruppen.length > 1 ? ` von ${eur(g.netto)}` : ''}</Text>
                  <Text style={s.sumWert}>{eur(g.ust)}</Text>
                </View>
              ))
            : (
              <View style={s.sumZeile}>
                <Text style={s.sumLabel}>USt 0 % ({beleg.ust_modus === 'reverse_charge' ? 'Reverse Charge' : 'Kleinunternehmer'})</Text>
                <Text style={s.sumWert}>{eur(0)}</Text>
              </View>
            )}
          <View style={s.sumBrutto}>
            <Text style={s.sumBruttoLabel}>{istAngebot ? 'Angebotssumme' : beleg.belegart === 'gutschrift' ? 'Gutschriftsbetrag' : 'Rechnungsbetrag'}</Text>
            <Text style={s.sumBruttoWert}>{eur(summen.brutto)}</Text>
          </View>
        </View>

        {hinweis ? <Text style={s.hinweisBox}>{hinweis}</Text> : null}

        {/* Zahlungsbedingungen */}
        {istRechnung && beleg.status !== 'storniert' && (
          <View style={s.block} wrap={false}>
            <Text style={s.blockTitel}>Zahlungsbedingungen</Text>
            <Text style={s.blockText}>
              {beleg.zahlungsziel_tage <= 0
                ? 'Zahlbar sofort nach Erhalt ohne Abzug.'
                : `Zahlbar innerhalb von ${beleg.zahlungsziel_tage} Tagen ohne Abzug${beleg.faellig_am ? `, fällig am ${datum(beleg.faellig_am)}` : ''}.`}
            </Text>
            {(absender.iban || absender.bic) && (
              <Text style={s.bankZeile}>
                {absender.iban ? `IBAN: ${absender.iban}` : ''}{absender.iban && absender.bic ? '   ' : ''}{absender.bic ? `BIC: ${absender.bic}` : ''}
              </Text>
            )}
            {beleg.nummer && <Text style={s.bankZeile}>Verwendungszweck: {beleg.nummer}</Text>}
          </View>
        )}
        {istAngebot && (
          <View style={s.block} wrap={false}>
            <Text style={s.blockTitel}>Gültigkeit</Text>
            <Text style={s.blockText}>
              Dieses Angebot ist {beleg.faellig_am ? `bis ${datum(beleg.faellig_am)}` : `${beleg.zahlungsziel_tage} Tage`} gültig. Alle Preise verstehen sich in Euro{beleg.ust_modus === 'normal' ? ' zuzüglich der gesetzlichen Umsatzsteuer' : ''}.
            </Text>
          </View>
        )}
        {beleg.belegart === 'gutschrift' && (
          <View style={s.block} wrap={false}>
            <Text style={s.blockTitel}>Hinweis</Text>
            <Text style={s.blockText}>Der Gutschriftsbetrag wird mit offenen Forderungen verrechnet bzw. auf das uns bekannte Konto überwiesen.</Text>
          </View>
        )}

        {beleg.schlusstext && <Text style={s.schluss}>{beleg.schlusstext}</Text>}
        {absender.fusstext && <Text style={[s.schluss, { fontSize: 8, color: TEXT_2 }]}>{absender.fusstext}</Text>}

        {/* Fußzeile mit Firmendaten */}
        <View style={s.fuss} fixed>
          <View style={s.fussSpalte}>
            <Text style={s.fussTitel}>{absender.name}</Text>
            {absender.strasse && <Text style={s.fussText}>{absender.strasse}</Text>}
            {(absender.plz || absender.ort) && <Text style={s.fussText}>{[absender.plz, absender.ort].filter(Boolean).join(' ')}</Text>}
          </View>
          <View style={s.fussSpalte}>
            {absender.uid && <Text style={s.fussText}>UID: {absender.uid}</Text>}
            {absender.steuernummer && <Text style={s.fussText}>Steuernummer: {absender.steuernummer}</Text>}
            {absender.telefon && <Text style={s.fussText}>Tel: {absender.telefon}</Text>}
          </View>
          <View style={s.fussSpalte}>
            {absender.iban && <Text style={s.fussText}>IBAN: {absender.iban}</Text>}
            {absender.bic && <Text style={s.fussText}>BIC: {absender.bic}</Text>}
          </View>
          <View style={[s.fussSpalte, { paddingRight: 0 }]}>
            {absender.email && <Text style={s.fussText}>{absender.email}</Text>}
            {absender.website && <Text style={s.fussText}>{absender.website}</Text>}
          </View>
        </View>
        <Text style={s.seite} fixed render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  )
}

// ── Logo laden ────────────────────────────────────────────────────────────────

/** Mandanten-Logo (PNG/JPG per URL) bzw. Fallback public/logos/hohenstein-farbe.png */
export async function ladeLogo(logoUrl: string | null): Promise<BelegPdfProps['logo']> {
  if (logoUrl && !/\.svg(\?|$)/i.test(logoUrl)) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const typ = (res.headers.get('content-type') ?? '').toLowerCase()
        const data = Buffer.from(await res.arrayBuffer())
        if (data.length > 0 && !typ.includes('svg') && !typ.includes('webp')) {
          const format = typ.includes('jpeg') || typ.includes('jpg') || /\.jpe?g(\?|$)/i.test(logoUrl) ? 'jpg' : 'png'
          return { data, format }
        }
      }
    } catch { /* Fallback auf Standardlogo */ }
  }
  try {
    const data = await readFile(path.join(process.cwd(), 'public', 'logos', 'hohenstein-farbe.png'))
    return { data, format: 'png' }
  } catch {
    return null
  }
}

/** PDF als Buffer rendern (Download + E-Mail-Anhang) */
export async function renderBelegPdf(props: BelegPdfProps): Promise<Buffer> {
  return renderToBuffer(<BelegDocument {...props} />)
}
