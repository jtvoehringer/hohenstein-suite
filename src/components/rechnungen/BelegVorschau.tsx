import { fmtDatum, fmtEuroMitZeichen, fmtZahl } from '@/lib/format'
import { berechneSummen, positionNetto, effektiverSatz } from '@/lib/rechnungen/summen'
import { belegartLabel, empfaengerZeilen, ustModusHinweis, type Absender, type BelegRow, type PositionRow } from '@/lib/rechnungen/types'

/** HTML-Vorschau des Belegs in CD-Optik (entspricht dem PDF-Layout) */
export default function BelegVorschau({ beleg, positionen, absender, kundennummer }: {
  beleg: BelegRow
  positionen: PositionRow[]
  absender: Absender
  kundennummer: string | null
}) {
  const summen = berechneSummen(positionen, beleg.ust_modus)
  const hinweis = ustModusHinweis(beleg.ust_modus)
  const istRechnung = beleg.belegart === 'rechnung'
  const istAngebot = beleg.belegart === 'angebot'
  const titel = istRechnung && beleg.status === 'storniert' ? 'Rechnung (storniert)' : belegartLabel(beleg.belegart)
  const absenderZeile = [absender.name, absender.strasse, [absender.plz, absender.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  const zeitraum = beleg.leistung_von || beleg.leistung_bis
    ? (beleg.leistung_von && beleg.leistung_bis && beleg.leistung_von !== beleg.leistung_bis
        ? `${fmtDatum(beleg.leistung_von)} – ${fmtDatum(beleg.leistung_bis)}`
        : fmtDatum(beleg.leistung_von ?? beleg.leistung_bis))
    : null

  return (
    <div className="bg-white rounded-xl border border-hs-line shadow-1 px-8 py-8 sm:px-12 sm:py-10 text-[13px] text-hs-text leading-relaxed relative">
      {beleg.status === 'storniert' && (
        <div className="absolute top-6 right-6 rotate-[-8deg] border-2 border-hs-err text-hs-err font-display font-semibold text-xl px-3 py-1 rounded opacity-70">STORNIERT</div>
      )}
      {beleg.status === 'entwurf' && (
        <div className="absolute top-6 right-6 rotate-[-8deg] border-2 border-hs-tertiary text-hs-tertiary font-display font-semibold text-xl px-3 py-1 rounded opacity-60">ENTWURF</div>
      )}

      {/* Kopf */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          {absender.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={absender.logo_url} alt={absender.name} className="h-12 max-w-[180px] object-contain object-left" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src="/logos/hohenstein-farbe.png" alt={absender.name} className="h-12 max-w-[180px] object-contain object-left" />}
        </div>
        <div className="text-right text-[11px] text-hs-text-2">
          <p className="text-[13px] font-semibold text-hs-text">{absender.name}</p>
          {absender.strasse && <p>{absender.strasse}</p>}
          {(absender.plz || absender.ort) && <p>{[absender.plz, absender.ort].filter(Boolean).join(' ')}</p>}
          {absender.telefon && <p>{absender.telefon}</p>}
          {absender.email && <p>{absender.email}</p>}
          {absender.website && <p>{absender.website}</p>}
        </div>
      </div>

      {/* Empfänger + Meta */}
      <div className="flex flex-col sm:flex-row justify-between gap-6">
        <div className="min-h-[96px] sm:w-72">
          <p className="text-[10px] text-hs-tertiary underline mb-2">{absenderZeile}</p>
          {empfaengerZeilen(beleg).map((z, i) => <p key={i} className={i === 0 ? 'font-semibold text-[14px]' : ''}>{z}</p>)}
          {beleg.empf_uid && <p>UID: {beleg.empf_uid}</p>}
          {beleg.empf_email && <p className="text-[11px] text-hs-text-2 mt-1">{beleg.empf_email}</p>}
        </div>
        <dl className="sm:w-64 text-[12px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 self-start">
          <dt className="text-hs-text-2">{istAngebot ? 'Angebotsnummer' : istRechnung ? 'Rechnungsnummer' : 'Gutschriftsnummer'}</dt>
          <dd className="text-right font-semibold font-mono">{beleg.nummer ?? 'Entwurf'}</dd>
          <dt className="text-hs-text-2">Datum</dt>
          <dd className="text-right font-semibold">{fmtDatum(beleg.datum)}</dd>
          {zeitraum && <><dt className="text-hs-text-2">Leistungszeitraum</dt><dd className="text-right font-semibold">{zeitraum}</dd></>}
          {istRechnung && beleg.faellig_am && <><dt className="text-hs-text-2">Fällig am</dt><dd className="text-right font-semibold">{fmtDatum(beleg.faellig_am)}</dd></>}
          {istAngebot && beleg.faellig_am && <><dt className="text-hs-text-2">Gültig bis</dt><dd className="text-right font-semibold">{fmtDatum(beleg.faellig_am)}</dd></>}
          {kundennummer && <><dt className="text-hs-text-2">Kundennummer</dt><dd className="text-right font-semibold font-mono">{kundennummer}</dd></>}
          {absender.uid && <><dt className="text-hs-text-2">Unsere UID</dt><dd className="text-right font-semibold">{absender.uid}</dd></>}
        </dl>
      </div>

      <h2 className="text-2xl text-hs-blue-700 mt-8 mb-1">{titel}{beleg.nummer ? ` ${beleg.nummer}` : ''}</h2>
      {beleg.einleitung && <p className="mt-3 mb-4 whitespace-pre-line">{beleg.einleitung}</p>}

      {/* Positionen */}
      <table className="w-full mt-4 text-[12.5px]">
        <thead>
          <tr className="border-b-2 border-hs-teal text-[10px] uppercase tracking-[.08em] text-hs-text-2">
            <th className="py-1.5 text-left font-semibold w-8">Pos</th>
            <th className="py-1.5 text-left font-semibold">Bezeichnung</th>
            <th className="py-1.5 text-right font-semibold w-16">Menge</th>
            <th className="py-1.5 text-left font-semibold w-16 pl-2">Einheit</th>
            <th className="py-1.5 text-right font-semibold w-24">Einzelpreis</th>
            <th className="py-1.5 text-right font-semibold w-12">USt</th>
            <th className="py-1.5 text-right font-semibold w-28">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {positionen.map(p => (
            <tr key={p.id ?? p.pos} className="border-b border-hs-line align-top">
              <td className="py-2 text-hs-text-2">{p.pos}</td>
              <td className="py-2 pr-3">
                <p className="font-semibold">{p.bezeichnung}</p>
                {p.beschreibung && <p className="text-[11px] text-hs-text-2 whitespace-pre-line">{p.beschreibung}</p>}
                {p.rabatt_pct > 0 && <p className="text-[10.5px] text-hs-tertiary">Rabatt {fmtZahl(p.rabatt_pct)} %</p>}
              </td>
              <td className="py-2 betrag">{fmtZahl(p.menge)}</td>
              <td className="py-2 pl-2 text-hs-text-2">{p.einheit}</td>
              <td className="py-2 betrag">{fmtEuroMitZeichen(p.einzelpreis_netto)}</td>
              <td className="py-2 betrag text-hs-text-2">{effektiverSatz(p, beleg.ust_modus)} %</td>
              <td className="py-2 betrag font-semibold">{fmtEuroMitZeichen(positionNetto(p))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summen */}
      <div className="flex justify-end mt-4">
        <div className="w-full max-w-xs text-[12.5px] space-y-0.5">
          {summen.gruppen.length > 1 && summen.gruppen.map(g => (
            <div key={`n${g.satz}`} className="flex justify-between text-hs-text-2"><span>Netto {g.satz} %</span><span className="betrag">{fmtEuroMitZeichen(g.netto)}</span></div>
          ))}
          <div className="flex justify-between font-semibold"><span>Nettobetrag</span><span className="betrag">{fmtEuroMitZeichen(summen.netto)}</span></div>
          {beleg.ust_modus === 'normal'
            ? summen.gruppen.map(g => (
                <div key={`u${g.satz}`} className="flex justify-between text-hs-text-2"><span>USt {g.satz} %{summen.gruppen.length > 1 ? ` von ${fmtEuroMitZeichen(g.netto)}` : ''}</span><span className="betrag">{fmtEuroMitZeichen(g.ust)}</span></div>
              ))
            : <div className="flex justify-between text-hs-text-2"><span>USt 0 % ({beleg.ust_modus === 'reverse_charge' ? 'Reverse Charge' : 'Kleinunternehmer'})</span><span className="betrag">{fmtEuroMitZeichen(0)}</span></div>}
          <div className="flex justify-between border-y-2 border-hs-teal py-1.5 mt-2 text-[15px] font-semibold">
            <span>{istAngebot ? 'Angebotssumme' : beleg.belegart === 'gutschrift' ? 'Gutschriftsbetrag' : 'Rechnungsbetrag'}</span>
            <span className="betrag text-hs-blue-700">{fmtEuroMitZeichen(summen.brutto)}</span>
          </div>
        </div>
      </div>

      {hinweis && <p className="mt-5 text-[11.5px] text-hs-text-2 bg-hs-bg border-l-2 border-hs-teal px-3 py-2">{hinweis}</p>}

      {istRechnung && beleg.status !== 'storniert' && (
        <div className="mt-6">
          <p className="overline mb-1">Zahlungsbedingungen</p>
          <p>
            {beleg.zahlungsziel_tage <= 0
              ? 'Zahlbar sofort nach Erhalt ohne Abzug.'
              : `Zahlbar innerhalb von ${beleg.zahlungsziel_tage} Tagen ohne Abzug${beleg.faellig_am ? `, fällig am ${fmtDatum(beleg.faellig_am)}` : ''}.`}
          </p>
          {(absender.iban || absender.bic) && (
            <p className="text-hs-text-2">{absender.iban ? `IBAN: ${absender.iban}` : ''}{absender.iban && absender.bic ? '   ' : ''}{absender.bic ? `BIC: ${absender.bic}` : ''}</p>
          )}
          {beleg.nummer && <p className="text-hs-text-2">Verwendungszweck: {beleg.nummer}</p>}
        </div>
      )}
      {istAngebot && (
        <div className="mt-6">
          <p className="overline mb-1">Gültigkeit</p>
          <p>Dieses Angebot ist {beleg.faellig_am ? `bis ${fmtDatum(beleg.faellig_am)}` : `${beleg.zahlungsziel_tage} Tage`} gültig. Alle Preise verstehen sich in Euro{beleg.ust_modus === 'normal' ? ' zuzüglich der gesetzlichen Umsatzsteuer' : ''}.</p>
        </div>
      )}

      {beleg.schlusstext && <p className="mt-6 whitespace-pre-line">{beleg.schlusstext}</p>}
      {absender.fusstext && <p className="mt-4 text-[11px] text-hs-text-2 whitespace-pre-line">{absender.fusstext}</p>}

      {/* Fußzeile */}
      <div className="mt-10 pt-3 border-t border-hs-line-str grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] text-hs-text-2 leading-snug">
        <div>
          <p className="font-semibold text-hs-text">{absender.name}</p>
          {absender.strasse && <p>{absender.strasse}</p>}
          {(absender.plz || absender.ort) && <p>{[absender.plz, absender.ort].filter(Boolean).join(' ')}</p>}
        </div>
        <div>
          {absender.uid && <p>UID: {absender.uid}</p>}
          {absender.steuernummer && <p>Steuernummer: {absender.steuernummer}</p>}
          {absender.telefon && <p>Tel: {absender.telefon}</p>}
        </div>
        <div>
          {absender.iban && <p>IBAN: {absender.iban}</p>}
          {absender.bic && <p>BIC: {absender.bic}</p>}
        </div>
        <div>
          {absender.email && <p>{absender.email}</p>}
          {absender.website && <p>{absender.website}</p>}
        </div>
      </div>
    </div>
  )
}
