# Einmalig: Git-Repository anlegen und auf GitHub (jtvoehringer/hohenstein-suite) pushen.
# Voraussetzung: leeres Repo "hohenstein-suite" auf GitHub angelegt (ohne README).
Set-Location -Path $PSScriptRoot
if (-not (Test-Path ".git")) { git init -b main }
git add -A
git commit -m "Hohenstein Suite – Erstversion (CRM, E-Mail, E&A, Aufgaben, Demo-Umgebung)"
if (-not (git remote | Select-String -Quiet "origin")) {
  git remote add origin https://github.com/jtvoehringer/hohenstein-suite.git
}
git push -u origin main
Write-Host "Repository gepusht – jetzt in Vercel importieren (oder mir Bescheid geben)." -ForegroundColor Green
