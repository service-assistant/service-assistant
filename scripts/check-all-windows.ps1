$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $repoRoot 'server'
$clientDir = Join-Path $repoRoot 'client'
$adminDir = Join-Path $repoRoot 'admin'
$serverRuff = Join-Path $serverDir '.venv\Scripts\ruff.exe'
$serverPyright = Join-Path $serverDir '.venv\Scripts\pyright.exe'
$serverTestScript = Join-Path $serverDir 'scripts\test-windows.ps1'
$clientTsc = Join-Path $clientDir 'node_modules\.bin\tsc.cmd'
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
    -Path $serverRuff `
    -MissingMessage 'Server virtual environment not found. Run "poetry install" in the server directory first.'
Assert-FileExists `
    -Path $serverTestScript `
    -MissingMessage "Server Windows test script not found: $serverTestScript"
Assert-FileExists `
    -Path $serverPyright `
    -MissingMessage 'Server Pyright not found. Run "poetry install" in the server directory first.'
Assert-FileExists `
    -Path $clientTsc `
    -MissingMessage 'Client dependencies not found. Run "npm install" in the client directory first.'
Assert-FileExists `
    -Path $adminTsc `
    -MissingMessage 'Admin dependencies not found. Run "npm install" in the admin directory first.'
Assert-FileExists `
    -Path $adminOxlint `
    -MissingMessage 'Admin dependencies not found. Run "npm install" in the admin directory first.'

$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$npm = $npmCommand.Source

Invoke-NativeStep `
    -Name 'Format server (Ruff)' `
    -WorkingDirectory $serverDir `
    -Executable $serverRuff `
    -CommandArguments @('format', 'app', 'tests')

Invoke-NativeStep `
    -Name 'Format client (Prettier)' `
    -WorkingDirectory $clientDir `
    -Executable $npm `
    -CommandArguments @('run', 'format')

Invoke-NativeStep `
    -Name 'Lint server (Ruff)' `
    -WorkingDirectory $serverDir `
    -Executable $serverRuff `
    -CommandArguments @('check', 'app', 'tests', 'alembic')

Invoke-NativeStep `
    -Name 'Type-check server (Pyright)' `
    -WorkingDirectory $serverDir `
    -Executable $serverPyright

Invoke-NativeStep `
    -Name 'Lint client (Expo ESLint)' `
    -WorkingDirectory $clientDir `
    -Executable $npm `
    -CommandArguments @('run', 'lint')

Invoke-NativeStep `
    -Name 'Type-check client (TypeScript)' `
    -WorkingDirectory $clientDir `
    -Executable $clientTsc `
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
    -Name 'Test server (Windows test runner)' `
    -WorkingDirectory $serverDir `
    -Executable $powerShell `
    -CommandArguments @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $serverTestScript
    )

Invoke-NativeStep `
    -Name 'Test client (Jest)' `
    -WorkingDirectory $clientDir `
    -Executable $npm `
    -CommandArguments @('run', 'test', '--', '--runInBand')

Write-Host ''
Write-Host 'All formatting, lint, type checks, builds, and tests passed.' -ForegroundColor Green
