[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $PytestArguments = @()
)

$ErrorActionPreference = 'Stop'

$apiDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $apiDir '.env.test.windows'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Windows test environment file not found: $envFile"
}

$poetryCommand = Get-Command poetry.exe -ErrorAction SilentlyContinue
if ($null -eq $poetryCommand) {
    $poetryCommand = Get-Command poetry -ErrorAction SilentlyContinue
}
if ($null -eq $poetryCommand) {
    throw 'Poetry was not found in PATH. Install Poetry and run "poetry install" in the api directory.'
}
$poetry = $poetryCommand.Source

Get-Content -LiteralPath $envFile |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') } |
    ForEach-Object {
        $name, $value = $_ -split '=', 2
        if (-not $value) {
            $value = ''
        }
        Set-Item -LiteralPath "Env:$($name.Trim())" -Value $value.Trim()
    }

Write-Host (
    'Running API tests against PostgreSQL at {0}:{1}/{2}' -f `
        $env:POSTGRES_HOST,
        $env:POSTGRES_PORT,
        $env:POSTGRES_DB
) -ForegroundColor Cyan

Push-Location $apiDir
try {
    & $poetry run pytest @PytestArguments
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exitCode
