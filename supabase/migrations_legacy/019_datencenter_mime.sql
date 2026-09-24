-- 019: Datencenter – MIME-Allowlist des Buckets aufheben
-- Der Upload läuft jetzt direkt aus dem Browser über signierte Upload-URLs (Vercel-Body-Limit 4,5 MB umgangen).
-- Die Typprüfung übernimmt die API (ausführbare Dateien gesperrt); die Bucket-Allowlist blockierte
-- sonst legitime Bürodateien wie .potx/.dotx/.msg/.vsdx. 50-MB-Limit bleibt.
update storage.buckets set allowed_mime_types = null, file_size_limit = 52428800 where id = 'datencenter';
