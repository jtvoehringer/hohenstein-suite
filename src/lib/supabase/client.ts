import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database.types'

/** Supabase Browser Client – nur in Client Components ('use client') */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Anmeldung per Passkey (Fingerabdruck, Gesicht, Windows Hello) – bei Supabase noch experimentell;
    // im Projekt unter Authentication → Passkeys einzuschalten (wie software:112, KAN-287)
    { auth: { experimental: { passkey: true } } },
  )
}
