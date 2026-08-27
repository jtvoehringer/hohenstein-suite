// Minimaler Datenbank-Typ. Die Suite arbeitet – wie software:112 – bewusst mit
// `(supabase.from('tabelle') as any)`, damit Schemaänderungen keine Typ-
// Generierung erfordern. Bei Bedarf: `supabase gen types typescript` und hier
// einsetzen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
