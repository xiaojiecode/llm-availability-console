$ErrorActionPreference = 'Stop'

Push-Location "$PSScriptRoot\web"
try {
    npm install
    npm run typecheck
    npm run build
}
finally {
    Pop-Location
}

go test ./...
go build -o "$PSScriptRoot\monitor.exe" ./cmd/monitor

Write-Host "Build complete: $PSScriptRoot\monitor.exe"
