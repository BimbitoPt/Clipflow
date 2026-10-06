param([switch]$BundleOnly)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force -Path temp | Out-Null
Set-Content -LiteralPath temp/desktop-build-status.txt -Value 'running'
try {
    $clipflowBuildCommand = if ($BundleOnly) { 'npx tauri bundle --bundles nsis' } else { 'npm run desktop:build' }
    $clipflowBuildWorker = Start-Process -FilePath $env:ComSpec -ArgumentList '/d', '/c', $clipflowBuildCommand -WindowStyle Hidden -RedirectStandardOutput 'temp/desktop-build.log' -RedirectStandardError 'temp/desktop-build-errors.log' -PassThru
    $clipflowBuildWorker.WaitForExit()
    $clipflowBuildExit = $clipflowBuildWorker.ExitCode
    Set-Content -LiteralPath temp/desktop-build-status.txt -Value $clipflowBuildExit
    exit $clipflowBuildExit
} catch {
    $_ | Out-String | Add-Content -LiteralPath temp/desktop-build.log
    Set-Content -LiteralPath temp/desktop-build-status.txt -Value 1
    exit 1
}
