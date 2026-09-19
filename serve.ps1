<#
.SYNOPSIS
    Start de Canasta PWA lokaal, zonder zelf npm-commando's te hoeven typen.

.DESCRIPTION
    Controleert Node.js en npm, installeert de dependencies als dat nog nodig is,
    start de Vite development server en opent de app in de browser.

    Het script wijzigt niets aan de applicatie. Het basepad en de poort worden
    uit de bestaande configuratie gelezen, zodat de URL klopt zonder dat hier
    iets gedupliceerd hoeft te worden.

.EXAMPLE
    .\serve.ps1

.EXAMPLE
    # Als Windows het script weigert vanwege de Execution Policy:
    powershell -ExecutionPolicy Bypass -File .\serve.ps1

.EXAMPLE
    # Een andere poort gebruiken:
    .\serve.ps1 -Port 5200
#>

[CmdletBinding()]
param(
    [int] $Port = 5173,
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# --- Weergave ---------------------------------------------------------------

function Write-Banner {
    param([string] $Text)
    Write-Host ''
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host ''
}

function Write-Step {
    param([string] $Text)
    Write-Host "  $Text"
}

function Write-Problem {
    param([string] $Title, [string[]] $Lines)
    Write-Host ''
    Write-Host "ERROR: $Title" -ForegroundColor Red
    foreach ($line in $Lines) { Write-Host $line -ForegroundColor Red }
    Write-Host ''
}

# Houdt het venster open wanneer het script dubbelgeklikt of via -File is
# gestart; in een bestaande console valt er niets te wachten.
function Wait-BeforeExit {
    # `$psISE` bestaat alleen in de ISE; onder StrictMode is een ongedefinieerde
    # variabele een fout, dus wordt het bestaan getest in plaats van de waarde.
    $inIse = Test-Path -Path 'variable:psISE'
    if ($Host.Name -eq 'ConsoleHost' -and -not $inIse) {
        Write-Host ''
        $null = Read-Host 'Druk op Enter om dit venster te sluiten'
    }
}

# --- Node en npm opzoeken ---------------------------------------------------

# Node en npm staan niet op elke machine in PATH. Naast PATH wordt daarom op de
# gebruikelijke installatielocaties gekeken, zodat dit script ook werkt wanneer
# `npm` in een gewone PowerShell niet gevonden wordt.
function Find-Executable {
    param(
        [string] $Name,
        [string[]] $Candidates
    )

    # Get-Command kan meerdere treffers geven (npm.cmd naast npm); zonder
    # -First 1 worden de paden aan elkaar geplakt tot één onbruikbare string.
    $onPath = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($onPath) { return $onPath.Source }

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return $null
}

# Niet elke omgevingsvariabele bestaat overal (ProgramFiles(x86) ontbreekt op
# 32-bits Windows), dus lege bases worden overgeslagen in plaats van doorgegeven
# aan Join-Path.
function Join-IfPresent {
    param([string] $Base, [string] $Leaf)
    if ([string]::IsNullOrWhiteSpace($Base)) { return $null }
    return (Join-Path -Path $Base -ChildPath $Leaf)
}

$nodeHomes = @(
    ${env:ProgramFiles},
    ${env:ProgramFiles(x86)},
    (Join-IfPresent ${env:LOCALAPPDATA} 'Programs')
)

$nodeCandidates = @()
$npmCandidates = @()
foreach ($nodeHome in $nodeHomes) {
    $nodeCandidates += (Join-IfPresent $nodeHome 'nodejs\node.exe')
    $npmCandidates += (Join-IfPresent $nodeHome 'nodejs\npm.cmd')
}
$npmCandidates += (Join-IfPresent ${env:APPDATA} 'npm\npm.cmd')
$nodeCandidates += (Join-IfPresent ${env:APPDATA} 'nvm\node.exe')

# --- Poort ------------------------------------------------------------------

function Test-PortFree {
    param([int] $Number)
    try {
        $listener = New-Object System.Net.Sockets.TcpListener(
            [System.Net.IPAddress]::Loopback, $Number)
        $listener.Start()
        $listener.Stop()
        return $true
    }
    catch {
        return $false
    }
}

function Find-FreePort {
    param([int] $Preferred)
    for ($candidate = $Preferred; $candidate -lt ($Preferred + 20); $candidate++) {
        if (Test-PortFree -Number $candidate) { return $candidate }
    }
    return 0
}

# --- Basepad uit de Vite-configuratie ---------------------------------------

# Het basepad staat in vite.config.ts als `const BASE = '/canasta/'`. Het wordt
# hier gelezen in plaats van overgetypt, zodat de URL blijft kloppen als het
# ooit verandert.
function Get-BasePath {
    $configPath = Join-Path $ProjectRoot 'vite.config.ts'
    if (-not (Test-Path -LiteralPath $configPath)) { return '/' }

    $config = Get-Content -LiteralPath $configPath -Raw
    $match = [regex]::Match($config, "const\s+BASE\s*=\s*['""]([^'""]+)['""]")
    if ($match.Success) { return $match.Groups[1].Value }

    $inline = [regex]::Match($config, "base:\s*['""]([^'""]+)['""]")
    if ($inline.Success) { return $inline.Groups[1].Value }

    return '/'
}

# --- Start ------------------------------------------------------------------

Write-Banner 'Canasta PWA - Local Development Server'
Write-Host 'Project: Canasta'
Write-Host 'Mode:    Development'
Write-Host ''

# 1. Node.js
$nodePath = Find-Executable -Name 'node' -Candidates $nodeCandidates
if (-not $nodePath) {
    Write-Problem -Title 'Node.js is niet geinstalleerd of staat niet in PATH.' -Lines @(
        'Installeer Node.js (versie 20 of hoger) en probeer opnieuw.',
        'Download: https://nodejs.org/'
    )
    Wait-BeforeExit
    exit 1
}
$nodeVersion = (& $nodePath --version) 2>$null
Write-Step "Node.js gevonden: $nodeVersion"

# 2. npm
$npmPath = Find-Executable -Name 'npm' -Candidates $npmCandidates
if (-not $npmPath) {
    Write-Problem -Title 'npm is niet beschikbaar.' -Lines @(
        'Controleer de Node.js installatie en PATH.',
        'npm wordt normaal samen met Node.js geinstalleerd.'
    )
    Wait-BeforeExit
    exit 1
}
$npmVersion = (& $npmPath --version) 2>$null
Write-Step "npm gevonden:     $npmVersion"

# 3. Dependencies
$modulesPath = Join-Path $ProjectRoot 'node_modules'
if (-not (Test-Path -LiteralPath $modulesPath)) {
    Write-Host ''
    Write-Step 'node_modules ontbreekt. Dependencies worden geinstalleerd.'
    Write-Step 'Dit kan de eerste keer een paar minuten duren.'
    Write-Host ''

    & $npmPath install
    $installExit = $LASTEXITCODE

    if ($installExit -ne 0) {
        Write-Problem -Title "npm install is mislukt (exit code $installExit)." -Lines @(
            'Bekijk de foutmelding hierboven.',
            'Vaak helpt het om de map node_modules te verwijderen en het opnieuw te proberen.'
        )
        Wait-BeforeExit
        exit $installExit
    }

    Write-Host ''
    Write-Step 'Dependencies geinstalleerd.'
}
else {
    Write-Step 'Dependencies aanwezig.'
}

# 4. Poort en URL
$selectedPort = Find-FreePort -Preferred $Port
if ($selectedPort -eq 0) {
    Write-Problem -Title "Geen vrije poort gevonden vanaf $Port." -Lines @(
        'Sluit andere development servers, of kies een poort:',
        '  .\serve.ps1 -Port 5200'
    )
    Wait-BeforeExit
    exit 1
}
if ($selectedPort -ne $Port) {
    Write-Step "Poort $Port is bezet; $selectedPort wordt gebruikt."
}

$basePath = Get-BasePath
$url = "http://127.0.0.1:$selectedPort$basePath"

# 5. Browser openen zodra de server antwoordt.
# Vite is er niet meteen, dus een achtergrondtaak wacht tot de poort open staat
# in plaats van blind een vaste tijd te slapen.
$openerJob = $null
if (-not $NoBrowser) {
    $openerJob = Start-Job -ScriptBlock {
        param($TargetUrl, $TargetPort)
        for ($attempt = 0; $attempt -lt 120; $attempt++) {
            try {
                $client = New-Object System.Net.Sockets.TcpClient
                $client.Connect('127.0.0.1', $TargetPort)
                $client.Close()
                Start-Sleep -Milliseconds 600
                Start-Process $TargetUrl
                return
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }
    } -ArgumentList $url, $selectedPort
}

Write-Banner 'Canasta PWA is running'
Write-Host 'Open:'
Write-Host "  $url" -ForegroundColor Green
Write-Host ''
if ($basePath -ne '/') {
    Write-Host "Let op: de app draait onder $basePath, niet op de root." -ForegroundColor Yellow
    Write-Host ''
}
Write-Host 'Press Ctrl+C to stop the server.'
Write-Host ''

# 6. Vite draaien op de voorgrond, zodat de uitvoer zichtbaar blijft en Ctrl+C
#    de server netjes stopt.
$viteExit = 0
try {
    & $npmPath run dev -- --host 127.0.0.1 --port $selectedPort --strictPort
    $viteExit = $LASTEXITCODE
}
finally {
    if ($openerJob) {
        Stop-Job -Job $openerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $openerJob -Force -ErrorAction SilentlyContinue
    }
}

if ($viteExit -ne 0) {
    Write-Problem -Title "De development server is gestopt met exit code $viteExit." -Lines @(
        'De foutmelding van Vite staat hierboven.'
    )
    Wait-BeforeExit
    exit $viteExit
}

Write-Host ''
Write-Host 'Server gestopt.'
