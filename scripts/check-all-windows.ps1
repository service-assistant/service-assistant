$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'api'
$appDir = Join-Path $repoRoot 'app'
$adminDir = Join-Path $repoRoot 'admin'
$apiRuff = Join-Path $apiDir '.venv\Scripts\ruff.exe'
$apiPyrightEntry = Join-Path $apiDir '.venv\Lib\site-packages\pyright\dist\index.js'
$apiTestScript = Join-Path $apiDir 'scripts\test-windows.ps1'
$appTsc = Join-Path $appDir 'node_modules\.bin\tsc.cmd'
$adminTsc = Join-Path $adminDir 'node_modules\.bin\tsc.cmd'
$adminOxlint = Join-Path $adminDir 'node_modules\.bin\oxlint.cmd'
$powerShell = (Get-Process -Id $PID).Path

function Assert-FileExists {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $MissingMessage
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw $MissingMessage
    }
}

function Invoke-NativeStep {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [string] $WorkingDirectory,

        [Parameter(Mandatory)]
        [string] $Executable,

        [string[]] $CommandArguments = @()
    )

    Write-Host ''
    Write-Host "==> $Name" -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        & $Executable @CommandArguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode."
    }

    Write-Host "<== $Name passed" -ForegroundColor Green
}

Assert-FileExists `
    -Path $apiRuff `
    -MissingMessage 'API virtual environment not found. Run "poetry install" in the api directory first.'
Assert-FileExists `
    -Path $apiTestScript `
    -MissingMessage "API Windows test script not found: $apiTestScript"
Assert-FileExists `
    -Path $apiPyrightEntry `
    -MissingMessage 'API Pyright not found. Run "poetry install" in the api directory first.'
Assert-FileExists `
    -Path $appTsc `
    -MissingMessage 'App dependencies not found. Run "npm install" in the app directory first.'
Assert-FileExists `
    -Path $adminTsc `
    -MissingMessage 'Admin dependencies not found. Run "npm install" in the admin directory first.'
Assert-FileExists `
    -Path $adminOxlint `
    -MissingMessage 'Admin dependencies not found. Run "npm install" in the admin directory first.'

$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$npm = $npmCommand.Source
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$node = $nodeCommand.Source

Invoke-NativeStep `
    -Name 'Format api (Ruff)' `
    -WorkingDirectory $apiDir `
    -Executable $apiRuff `
    -CommandArguments @('format', 'app', 'tests', '--no-cache')

Invoke-NativeStep `
    -Name 'Format app (Prettier)' `
    -WorkingDirectory $appDir `
    -Executable $npm `
    -CommandArguments @('run', 'format')

Invoke-NativeStep `
    -Name 'Lint api (Ruff)' `
    -WorkingDirectory $apiDir `
    -Executable $apiRuff `
    -CommandArguments @('check', 'app', 'tests', 'alembic', '--no-cache')

Invoke-NativeStep `
    -Name 'Type-check api (Pyright)' `
    -WorkingDirectory $apiDir `
    -Executable $node `
    -CommandArguments @($apiPyrightEntry)

Invoke-NativeStep `
    -Name 'Lint app (Expo ESLint)' `
    -WorkingDirectory $appDir `
    -Executable $npm `
    -CommandArguments @('run', 'lint', '--', '--no-cache')

Invoke-NativeStep `
    -Name 'Type-check app (TypeScript)' `
    -WorkingDirectory $appDir `
    -Executable $appTsc `
    -CommandArguments @('--noEmit')

Invoke-NativeStep `
    -Name 'Lint admin (oxlint)' `
    -WorkingDirectory $adminDir `
    -Executable $npm `
    -CommandArguments @('run', 'lint')

Invoke-NativeStep `
    -Name 'Type-check and build admin' `
    -WorkingDirectory $adminDir `
    -Executable $npm `
    -CommandArguments @('run', 'build')

# Run this exact repository script in a child PowerShell process. It configures
# WindowsSelectorEventLoopPolicy and the Docker test database required by psycopg.
Invoke-NativeStep `
    -Name 'Test api (Windows test runner)' `
    -WorkingDirectory $apiDir `
    -Executable $powerShell `
    -CommandArguments @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $apiTestScript
    )

Invoke-NativeStep `
    -Name 'Test app (Jest)' `
    -WorkingDirectory $appDir `
    -Executable $npm `
    -CommandArguments @('run', 'test', '--', '--runInBand')

Write-Host ''
Write-Host 'All formatting, lint, type checks, builds, and tests passed.' -ForegroundColor Green
