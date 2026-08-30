// ── Alle Zeilen einer Abfrage laden ───────────────────────────────────────────
// PostgREST liefert pro Request maximal 1.000 Zeilen. Für Listen, die darüber
// hinauswachsen können (Firmen, Kontakte …), wird hier in 1000er-Seiten
// nachgeladen. bau() muss eine FRISCHE Query inkl. stabiler order() liefern –
// range() ergänzt diese Funktion selbst.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>

export async function alleZeilen<T = R>(bau: () => R): Promise<T[]> {
  const SEITE = 1000
  const out: T[] = []
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await bau().range(von, von + SEITE - 1)
    if (error) break // Teilergebnis ist besser als gar keines; Fehler zeigt die Seite ohnehin
    const zeilen = (data ?? []) as T[]
    out.push(...zeilen)
    if (zeilen.length < SEITE) break
  }
  return out
}
