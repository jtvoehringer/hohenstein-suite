// POST /api/buchhaltung/belege – Beleg (PDF/Foto) hochladen + optionale KI-Erkennung
//
// Ablauf: Datei validieren → Bucket `ea-belege` unter `${tenantId}/…` ablegen →
// wenn ANTHROPIC_API_KEY gesetzt: Claude (Vision/PDF) extrahiert Datum, Betrag,
// USt-Satz, Kategorie und Geschäftspartner → Ergebnis in ea_belege (status
// 'erkannt'). Ohne API-Key: status 'erkannt' mit leeren Daten + Hinweis.
// Schlägt die Erkennung fehl: status 'fehler' + fehler_details. Der Upload
// selbst darf nie an der KI scheitern.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentMembership, canWrite } from '@/lib/auth/roles'
import { ladeKategorien } from '@/lib/ea/server'
import { GUELTIGE_UST_SAETZE, bruttoZuNetto } from '@/lib/ea/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

const MODEL = process.env.BELEG_MODEL || 'claude-sonnet-4-5-20250929'
const MAX_BYTES = 15 * 1024 * 1024
const ERLAUBTE_TYPEN: Record<string, true> = {
  'application/pdf': true, 'image/jpeg': true, 'image/png': true, 'image/webp': true,
}

const BELEG_TOOL: Anthropic.Tool = {
  name: 'beleg_erfassen',
  description: 'Trägt die aus dem Beleg (Foto/PDF eines Kassenbons, einer Rechnung o. ä.) erkannten Buchungsdaten ein.',
  input_schema: {
    type: 'object',
    properties: {
      typ: {
        type: 'string', enum: ['einnahme', 'ausgabe'],
        description: 'einnahme, wenn das Beratungsunternehmen selbst Rechnungssteller ist (Ausgangsrechnung/Honorarnote); sonst (Kassenbon, Eingangsrechnung, Tank-/Hotelbeleg, Software-Rechnung) ausgabe. Im Zweifel ausgabe.',
      },
      datum: { type: 'string', description: 'Belegdatum im Format YYYY-MM-DD. Falls nicht lesbar: null.' },
      beschreibung: { type: 'string', description: 'Kurze Bezeichnung: Firmenname + Art der Leistung, max. ca. 80 Zeichen.' },
      betrag_brutto: { type: 'number', description: 'Gesamtbetrag inkl. USt, wie auf dem Beleg aufgedruckt.' },
      ust_satz: {
        type: 'number', enum: GUELTIGE_UST_SAETZE,
        description: 'USt-Satz in Prozent. Bei mehreren Sätzen: den betragsmäßig größten Anteil wählen und im Feld hinweis darauf hinweisen. Reverse-Charge/steuerfrei = 0.',
      },
      belegnummer: { type: 'string', description: 'Rechnungs-/Belegnummer, falls aufgedruckt.' },
      kategorie_id: { type: 'string', description: 'ID der am besten passenden Kategorie aus der mitgelieferten Liste, oder null.' },
      konfidenz: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'], description: 'Wie sicher die Erkennung insgesamt ist.' },
      hinweis: { type: 'string', description: 'Optionaler Hinweis an den Nutzer (Unsicherheiten, unlesbare Stellen, mehrere USt-Sätze). Sonst weglassen.' },
      partner_name: {
        type: 'string',
        description: 'Name des Geschäftspartners (Rechnungssteller bei Ausgaben, Rechnungsempfänger bei Einnahmen), NUR wenn klar erkennbar. Bei anonymen Kassenbons weglassen.',
      },
    },
    required: ['typ', 'beschreibung', 'betrag_brutto', 'ust_satz', 'konfidenz'],
  },
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const membership = await getCurrentMembership()
  const tenantId = membership?.tenantId
  if (!tenantId) return NextResponse.json({ error: 'Kein aktiver Mandant' }, { status: 403 })
  if (!canWrite(membership.role)) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() } catch { return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 }) }
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'Die Datei ist leer' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Datei zu groß (max. 15 MB)' }, { status: 413 })
  const mimeType = file.type
  if (!ERLAUBTE_TYPEN[mimeType]) {
    return NextResponse.json({ error: 'Nicht unterstütztes Dateiformat – bitte PDF, JPEG, PNG oder WebP.' }, { status: 415 })
  }

  const sicherName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'beleg'
  const storagePfad = `${tenantId}/${Date.now()}-${sicherName}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadErr } = await supabase.storage
    .from('ea-belege')
    .upload(storagePfad, bytes, { contentType: mimeType, upsert: false })
  if (uploadErr) return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadErr.message}` }, { status: 500 })

  // ── KI-Erkennung (optional) ──────────────────────────────────────────────
  let erkannteDaten: R | null = null
  let fehlerDetails: string | null = null
  let status: 'erkannt' | 'fehler' = 'erkannt'

  if (!process.env.ANTHROPIC_API_KEY) {
    erkannteDaten = { hinweis: 'Erkennung nicht konfiguriert – bitte die Buchungsdaten manuell erfassen.', konfidenz: null }
  } else {
    try {
      const kategorien = await ladeKategorien(supabase, tenantId)
      const katListe = kategorien.map(k => ({ id: k.id, name: k.name, typ: k.typ }))

      const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam = mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: bytes.toString('base64') } }

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          'Du liest österreichische Geschäftsbelege (Kassenbons, Eingangs-/Ausgangsrechnungen, Honorarnoten, ' +
          'Reisebelege) für ein Beratungs- und Softwarevertriebs-Unternehmen aus und extrahierst die Buchungsdaten ' +
          'für dessen Einnahmen-Ausgaben-Rechnung (§ 4 Abs. 3 EStG). Verfügbare Buchungskategorien (id, name, typ):\n' +
          JSON.stringify(katListe) +
          '\nAntworte ausschließlich über das Tool beleg_erfassen.',
        tools: [BELEG_TOOL],
        tool_choice: { type: 'tool', name: 'beleg_erfassen' },
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: 'Bitte lies diesen Beleg aus und trage die Daten über das Tool ein.' }],
        }],
      })

      const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (!toolUse) throw new Error('Keine strukturierte Antwort von der Erkennung erhalten')
      const input = toolUse.input as R

      const betragBrutto = Number(input.betrag_brutto)
      const bruttoOk = Number.isFinite(betragBrutto) && betragBrutto >= 0 ? Math.round(betragBrutto * 100) / 100 : null
      const ustSatz = GUELTIGE_UST_SAETZE.includes(Number(input.ust_satz)) ? Number(input.ust_satz) : 20
      const kategorieOk = kategorien.some(k => k.id === input.kategorie_id)
      const partnerName = typeof input.partner_name === 'string' && input.partner_name.trim() ? input.partner_name.trim().slice(0, 120) : null

      erkannteDaten = {
        typ:           input.typ === 'einnahme' ? 'einnahme' : 'ausgabe',
        datum:         typeof input.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.datum) ? input.datum : null,
        beschreibung:  typeof input.beschreibung === 'string' ? input.beschreibung.slice(0, 200) : '',
        betrag_brutto: bruttoOk,
        betrag_netto:  bruttoOk != null ? bruttoZuNetto(bruttoOk, ustSatz) : null,
        ust_satz:      ustSatz,
        belegnummer:   typeof input.belegnummer === 'string' && input.belegnummer.trim() ? input.belegnummer.trim().slice(0, 60) : null,
        kategorie_id:  kategorieOk ? input.kategorie_id : null,
        konfidenz:     ['hoch', 'mittel', 'niedrig'].includes(input.konfidenz) ? input.konfidenz : 'niedrig',
        hinweis:       typeof input.hinweis === 'string' && input.hinweis.trim() ? input.hinweis.trim().slice(0, 500) : null,
        partner_name:  partnerName,
        firma_id_vorschlag: null as string | null,
      }

      // Geschäftspartner-Abgleich gegen die Firmen des Mandanten (Name)
      if (partnerName) {
        const { data: firmenRaw } = await (supabase.from('firmen') as any)
          .select('id, name').eq('tenant_id', tenantId).eq('aktiv', true)
        const firmen = (firmenRaw ?? []) as R[]
        const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
        const gesucht = norm(partnerName)
        const treffer = firmen.find(f => norm(f.name) === gesucht)
          ?? firmen.find(f => gesucht.length >= 4 && (norm(f.name).includes(gesucht) || gesucht.includes(norm(f.name))))
        erkannteDaten.firma_id_vorschlag = treffer?.id ?? null
      }
    } catch (e) {
      status = 'fehler'
      fehlerDetails = e instanceof Error ? e.message : 'Unbekannter Fehler bei der Beleg-Erkennung'
    }
  }

  const { data: beleg, error: dbErr } = await (supabase.from('ea_belege') as any)
    .insert({
      tenant_id:       tenantId,
      dateiname:       file.name.slice(0, 200),
      dateityp:        mimeType,
      groesse_bytes:   file.size,
      storage_pfad:    storagePfad,
      status,
      erkannte_daten:  erkannteDaten,
      fehler_details:  fehlerDetails,
      hochgeladen_von: user.id,
    })
    .select('id, dateiname, dateityp, status, erkannte_daten, fehler_details, hochgeladen_am')
    .single()

  if (dbErr) {
    await supabase.storage.from('ea-belege').remove([storagePfad])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json(beleg, { status: 201 })
}
