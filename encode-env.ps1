# PowerShell script to encode .env file to base64 for GitHub Actions
# Run this script to generate the VPS_ENV secret value

$envPath = "d:\pg-mobile-app\IPMS-ADMIN-web\IPMS-ADMIN-web-api\.env"

if (-not (Test-Path $envPath)) {
    Write-Host "❌ Error: .env file not found at $envPath" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Reading .env file..." -ForegroundColor Blue
$content = Get-Content $envPath -Raw

Write-Host "🔐 Encoding to base64..." -ForegroundColor Blue
$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))

Write-Host ""
Write-Host "✅ Base64 encoded successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Copy this value and add it as VPS_ENV secret in GitHub:" -ForegroundColor Yellow
Write-Host ""
Write-Host $base64 -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Steps:" -ForegroundColor Blue
Write-Host "1. Go to GitHub → Settings → Secrets and variables → Actions"
Write-Host "2. Click 'New repository secret'"
Write-Host "3. Name: VPS_ENV"
Write-Host "4. Value: Paste the base64 string above"
Write-Host "5. Click 'Add secret'"
Write-Host ""

# Also copy to clipboard if possible
try {
    Set-Clipboard -Value $base64
    Write-Host "✅ Also copied to clipboard!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not copy to clipboard automatically" -ForegroundColor Yellow
}
