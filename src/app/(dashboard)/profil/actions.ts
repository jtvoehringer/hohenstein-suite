'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function profilSpeichernAction(input: { full_name: string; telefon: string }): Promise<{ fehler?: string }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { fehler: 'Nicht angemeldet' }
  const full_name = input.full_name.trim() || null
  const { error } = await (supabase.from('profiles') as any)
    .upsert({ id: user.id, full_name, display_name: full_name, telefon: input.telefon.trim() || null }, { onConflict: 'id' })
  if (error) return { fehler: error.message }
  return {}
}
