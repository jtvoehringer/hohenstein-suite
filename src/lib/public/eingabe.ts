// Eingabeprüfung für die öffentlichen Website-Endpunkte (/api/public/kontakt, /api/public/trial).
// Ziel: nur saubere, begrenzte Werte gelangen in Datenbank, Filter-Ausdrücke und E-Mails.

const STEUERZEICHEN = /[\u0000-\u001F\u007F\u2028\u2029]/g

/** Einzeiliger Wert: Steuerzeichen/Zeilenumbrüche entfernen (Schutz vor Header-Injection), kürzen. */
export function bereinige(wert: unknown, max: number): string {
  return String(wert ?? '').replace(STEUERZEICHEN, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Mehrzeiliger Text (Nachricht): Zeilenumbrüche behalten, übrige Steuerzeichen entfernen, kürzen. */
export function bereinigeText(wert: unknown, max: number): string {
  return String(wert ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max)
}

/** Telefonnummer: nur Ziffern und übliche Trennzeichen. */
export function bereinigeTelefon(wert: unknown): string | null {
  const t = String(wert ?? '').replace(/[^0-9+()\/\- ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return t || null
}

// Bewusst strenger als RFC 5322: keine Kommas, Klammern, Anführungszeichen –
// der Wert wird u. a. in einem PostgREST-Filter (.or(...)) verwendet.
const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/
export function istGueltigeEmail(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email)
}

/** Links/HTML in Namensfeldern verhindern Spam-/Phishing-Texte in unseren Bestätigungsmails. */
export function enthaeltLinkOderMarkup(s: string): boolean {
  return /(https?:|ftp:|\/\/|www\.|<|>|\[url)/i.test(s)
}

/** IP aus x-forwarded-for auf erlaubte Zeichen reduzieren (wird im Filter verwendet). */
export function bereinigeIp(ip: string | null | undefined): string {
  return String(ip ?? '').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unbekannt'
}
