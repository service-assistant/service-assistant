$ErrorActionPreference = 'Stop'

$serverDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $serverDir '.env.test.windows'
$python = Join-Path $serverDir '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    throw 'Python virtual environment not found. Run "poetry install" in the server directory first.'
}

Push-Location $serverDir
try {
    Get-Content -LiteralPath $envFile |
        Where-Object { $_ -and -not $_.StartsWith('#') } |
        ForEach-Object {
            $name, $value = $_ -split '=', 2
            Set-Item -LiteralPath "Env:$name" -Value $value
        }

    & $python -c @'
import asyncio
import pytest

asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
raise SystemExit(pytest.main())
'@
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
