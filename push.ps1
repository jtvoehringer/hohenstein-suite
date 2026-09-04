# Änderungen committen und auf GitHub pushen (löst das Vercel-Deployment aus).
# Doppelklick bzw. im Terminal: .\push.ps1 "Kurze Beschreibung"
param([string]$Nachricht = "Update Hohenstein Suite")
Set-Location -Path $PSScriptRoot
git add -A
git commit -m $Nachricht
git push origin main
Write-Host "Push abgeschlossen – Vercel deployt jetzt." -ForegroundColor Green
