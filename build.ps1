# build.ps1 - Package Cat Gatekeeper Extension for production
# Excludes development / preview files from the final zip archive.

$ErrorActionPreference = "Stop"

$distDir = "dist"
$zipName = "cat-gatekeeper-extension.zip"

Write-Host "Cleaning up old build files..."
if (Test-Path -Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}
if (Test-Path -Path $zipName) {
    Remove-Item -Force $zipName
}

Write-Host "Creating structure..."
New-Item -ItemType Directory -Path $distDir | Out-Null
New-Item -ItemType Directory -Path "$distDir/src" | Out-Null
New-Item -ItemType Directory -Path "$distDir/icons" | Out-Null
New-Item -ItemType Directory -Path "$distDir/fonts" | Out-Null

Write-Host "Copying core extension files..."
Copy-Item "manifest.json" "$distDir/"
Copy-Item "break.html" "$distDir/"
Copy-Item "popup.html" "$distDir/"

Copy-Item "src/background.js" "$distDir/src/"
Copy-Item "src/content.js" "$distDir/src/"
Copy-Item "src/popup.js" "$distDir/src/"
Copy-Item "src/break.js" "$distDir/src/"

Copy-Item "icons/*" "$distDir/icons/"
Copy-Item "fonts/*" "$distDir/fonts/"

Write-Host "Compressing to $zipName..."
Compress-Archive -Path "$distDir/*" -DestinationPath $zipName -Force

Write-Host "Cleaning up temporary directory..."
Remove-Item -Recurse -Force $distDir

Write-Host "Extension successfully packaged into $zipName!" -ForegroundColor Green
