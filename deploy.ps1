param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> Cleaning .publish/"
Remove-Item -Recurse -Force .publish -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path .publish | Out-Null

$configPath = Join-Path $root "deployment-config.json"
if (-not (Test-Path $configPath)) {
  throw "deployment-config.json not found at $configPath"
}

Write-Host "==> Reading deployment-config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$appName = $config.appName
$userName = $config.userName
$userPWD = $config.userPWD
$azureUrl = $config.azureUrl

if (-not $appName -or -not $userName -or -not $userPWD -or -not $azureUrl) {
  throw "deployment-config.json is missing appName, userName, userPWD, or azureUrl"
}

Write-Host "==> Setting VITE_PUBLIC_BASE_URL to $azureUrl"
$env:VITE_PUBLIC_BASE_URL = $azureUrl

Write-Host "==> Installing and building the Vite app"
Push-Location (Join-Path $root "app")
try {
  npm install
  npm run build
} finally {
  Pop-Location
}

Write-Host "==> Copying build output to .publish/"
Copy-Item -Recurse -Force (Join-Path $root "app\dist\*") (Join-Path $root ".publish")

Write-Host "==> Bundling the production Node server"
npx --yes esbuild "app/server/prodServer.ts" --bundle --platform=node --format=cjs --outfile=".publish/server.js"

Write-Host "==> Writing package.json for Azure"
@{
  name = "ai-studio"
  private = $true
  scripts = @{ start = "node server.js" }
} | ConvertTo-Json | Set-Content -Path (Join-Path $root ".publish\package.json") -Encoding ASCII

Write-Host "==> Creating .publish/publish.zip"
$zipPath = Join-Path $root ".publish\publish.zip"
python -c @"
import zipfile, pathlib
root = pathlib.Path(r'$root') / '.publish'
zip_path = root / 'publish.zip'
if zip_path.exists():
    zip_path.unlink()
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file() and p.name != 'publish.zip':
            z.write(p, p.relative_to(root).as_posix())
"@

Write-Host "==> Deploying via Kudu zipdeploy"
$pair = "${userName}:${userPWD}"
$deployUrl = "https://$appName.scm.azurewebsites.net/api/zipdeploy"
$code = ""
for ($i = 1; $i -le 6; $i++) {
  $code = curl.exe -sS -w "%{http_code}" -o "$env:TEMP\kudu-zipdeploy.out" -X POST -u $pair -T $zipPath -H "Content-Type: application/zip" $deployUrl
  if ($code -eq "200" -or $code -eq "202") { break }
  Write-Host "zipdeploy attempt $i returned HTTP '$code'; retrying in 15s..."
  Start-Sleep -Seconds 15
}
Write-Host (Get-Content "$env:TEMP\kudu-zipdeploy.out" -Raw -ErrorAction SilentlyContinue)
if ($code -ne "200" -and $code -ne "202") {
  throw "zipdeploy failed with HTTP $code"
}

Write-Host ""
Write-Host "Deployed. Site URL: $azureUrl"
Write-Host "It may take a few minutes for the changes to become visible on the website."
