# Downloads a private copy of Node 22 into .tools\node (used by "Start Epic Racer.bat").
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'https://nodejs.org/dist/latest-v22.x'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
New-Item -ItemType Directory -Force -Path .tools | Out-Null
$sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
$line = $sums | Where-Object { $_ -match "node-v22[^ ]*-win-$arch\.zip$" } | Select-Object -First 1
if (-not $line) { throw "No Node download found for win-$arch" }
$sum, $file = $line.Trim() -split '\s+'
Invoke-WebRequest "$base/$file" -OutFile .tools\node.zip -UseBasicParsing
if ((Get-FileHash .tools\node.zip -Algorithm SHA256).Hash -ne $sum.ToUpper()) {
  Remove-Item .tools\node.zip
  throw 'The download did not check out (checksum mismatch). Try again.'
}
if (Test-Path .tools\node) { Remove-Item -Recurse -Force .tools\node }
Expand-Archive .tools\node.zip -DestinationPath .tools -Force
Rename-Item (Join-Path .tools ($file -replace '\.zip$', '')) node
Remove-Item .tools\node.zip
