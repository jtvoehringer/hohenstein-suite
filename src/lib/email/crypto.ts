// Symmetrische Verschlüsselung für IMAP-/SMTP-Passwörter (AES-256-CBC).
// EMAIL_CRYPT_SECRET muss in Vercel gesetzt sein – ohne Secret schlägt das
// Speichern von Zugangsdaten bewusst fehl, statt mit einem bekannten Fallback-
// Schlüssel zu verschlüsseln.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

function key(): Buffer {
  const secret = process.env.EMAIL_CRYPT_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('EMAIL_CRYPT_SECRET fehlt oder ist zu kurz (mind. 16 Zeichen) – in den Umgebungsvariablen setzen.')
  }
  return scryptSync(secret, 'hohenstein-suite', 32)
}

export function encryptPass(plain: string): string {
  const iv   = randomBytes(16)
  const ciph = createCipheriv('aes-256-cbc', key(), iv)
  const enc  = Buffer.concat([ciph.update(plain, 'utf8'), ciph.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

export function decryptPass(enc: string): string {
  const [ivHex, dataHex] = enc.split(':')
  const iv     = Buffer.from(ivHex, 'hex')
  const data   = Buffer.from(dataHex, 'hex')
  const deciph = createDecipheriv('aes-256-cbc', key(), iv)
  return Buffer.concat([deciph.update(data), deciph.final()]).toString('utf8')
}
