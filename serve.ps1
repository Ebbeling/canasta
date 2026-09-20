<#
.SYNOPSIS
    Start de Canasta-toernooiserver op dit apparaat.

.DESCRIPTION
    Controleert Node.js en npm, bouwt de app en de server als dat nodig is, en
    start de lokale toernooiserver. De server bedient zowel de organisator als
    de tafels: andere apparaten op dezelfde WiFi openen het netwerkadres dat
    hieronder wordt getoond.

    Het script wijzigt niets aan de firewall en vraagt geen beheerdersrechten.
    Wordt de server van andere apparaten niet gezien, dan staat onderaan wat er
    meestal aan de hand is.

.EXAMPLE
    .\serve.ps1

.EXAMPLE
    # Een andere poort gebruiken:
    .\serve.ps1 -Port 9000

.EXAMPLE
    # Alleen op deze laptop, niet op het netwerk:
    .\serve.ps1 -LocalOnly

.EXAMPLE
    # De oude ontwikkelserver (Vite, hot reload, geen toernooiserver):
    .\serve.ps1 -Dev

.EXAMPLE
    # Als Windows het script weigert vanwege de Execution Policy:
    powershell -ExecutionPolicy Bypass -File .\serve.ps1
#>

[CmdletBinding()]
param(
    [int] $Port = 8787,
    [switch] $NoBrowser,
    [switch] $LocalOnly,
    [switch] $Rebuild,
    [switch] $Dev,
    [int] $DevPort = 5173,
    [string] $Database
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# --- Weergave ---------------------------------------------------------------

function Write-Banner {
    param([string] $Text)
    Write-Host ''
    Write-Host '+------------------------------------------+' -ForegroundColor Cyan
    Write-Host ('|' + $Text.PadLeft(([int](21 + $Text.Length / 2))).PadRight(42) + '|') -ForegroundColor Cyan
    Write-Host '+------------------------------------------+' -ForegroundColor Cyan
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

function Wait-BeforeExit {
    $inIse = Test-Path -Path 'variable:psISE'
    if ($Host.Name -eq 'ConsoleHost' -and -not $inIse) {
        Write-Host ''
        $null = Read-Host 'Druk op Enter om dit venster te sluiten'
    }
}

# --- Node en npm opzoeken ---------------------------------------------------

# Node en npm staan niet op elke machine in PATH. Naast PATH wordt daarom op de
# gebruikelijke installatielocaties gekeken.
function Find-Executable {
    param([string] $Name, [string[]] $Candidates)

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
    catch { return $false }
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
# hier gelezen in plaats van overgetypt, zodat de URL blijft kloppen.
function Get-BasePath {
    $configPath = Join-Path $ProjectRoot 'vite.config.ts'
    if (-not (Test-Path -LiteralPath $configPath)) { return '/' }

    $config = Get-Content -LiteralPath $configPath -Raw
    $match = [regex]::Match($config, "const\s+BASE\s*=\s*['""]([^'""]+)['""]")
    if ($match.Success) { return $match.Groups[1].Value }
    return '/'
}

# --- Netwerkadres -----------------------------------------------------------

# Hetzelfde antwoord als de server zelf geeft; hier alleen om het adres al vóór
# de start te kunnen tonen en om te kunnen waarschuwen als er geen netwerk is.
function Get-LanAddress {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch '^(Loopback|vEthernet|Bluetooth)'
        }

    $private = $candidates | Where-Object {
        $_.IPAddress -like '192.168.*' -or
        $_.IPAddress -like '10.*' -or
        $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.'
    }

    $chosen = if ($private) { $private | Select-Object -First 1 } else { $candidates | Select-Object -First 1 }
    return $chosen
}

# --- Start ------------------------------------------------------------------

Write-Banner 'CANASTA TOURNAMENT SERVER'

# 1. Node.js
$nodePath = Find-Executable -Name 'node' -Candidates $nodeCandidates
if (-not $nodePath) {
    Write-Problem -Title 'Node.js is niet geinstalleerd of staat niet in PATH.' -Lines @(
        'Installeer Node.js 22 of hoger en probeer opnieuw.',
        'Download: https://nodejs.org/'
    )
    Wait-BeforeExit
    exit 1
}
$nodeVersion = (& $nodePath --version) 2>$null
Write-Step "Node.js gevonden: $nodeVersion"

# De server gebruikt de ingebouwde SQLite van Node. Die is er pas vanaf 22.5 en
# is stabiel vanaf 24; op iets ouders start de server met een cryptische fout,
# en dat is hier makkelijker uit te leggen dan daar.
$major = 0
if ($nodeVersion -match 'v(\d+)\.(\d+)') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 5)) {
        Write-Problem -Title "Node.js $nodeVersion is te oud voor de toernooiserver." -Lines @(
            'De server gebruikt de ingebouwde SQLite van Node (node:sqlite).',
            'Die is beschikbaar vanaf Node 22.5 en stabiel vanaf Node 24.',
            'Installeer een nieuwere Node.js en probeer opnieuw.'
        )
        Wait-BeforeExit
        exit 1
    }
}

# 2. npm
$npmPath = Find-Executable -Name 'npm' -Candidates $npmCandidates
if (-not $npmPath) {
    Write-Problem -Title 'npm is niet beschikbaar.' -Lines @(
        'Controleer de Node.js installatie en PATH.'
    )
    Wait-BeforeExit
    exit 1
}
Write-Step "npm gevonden:     $((& $npmPath --version) 2>$null)"

# 3. Dependencies
$modulesPath = Join-Path $ProjectRoot 'node_modules'
if (-not (Test-Path -LiteralPath $modulesPath)) {
    Write-Host ''
    Write-Step 'node_modules ontbreekt. Dependencies worden geinstalleerd.'
    Write-Host ''

    & $npmPath install
    if ($LASTEXITCODE -ne 0) {
        Write-Problem -Title "npm install is mislukt (exit code $LASTEXITCODE)." -Lines @(
            'Bekijk de foutmelding hierboven.'
        )
        Wait-BeforeExit
        exit $LASTEXITCODE
    }
    Write-Host ''
}
else {
    Write-Step 'Dependencies aanwezig.'
}

# --- Ontwikkelmodus ---------------------------------------------------------

if ($Dev) {
    $devSelected = Find-FreePort -Preferred $DevPort
    if ($devSelected -eq 0) {
        Write-Problem -Title "Geen vrije poort gevonden vanaf $DevPort." -Lines @()
        Wait-BeforeExit
        exit 1
    }

    $basePath = Get-BasePath
    Write-Host ''
    Write-Step 'Ontwikkelserver (Vite). Geen toernooiserver, geen tafels.'
    Write-Host ''
    Write-Host "  http://127.0.0.1:$devSelected$basePath" -ForegroundColor Green
    Write-Host ''
    Write-Host 'Stoppen met Ctrl+C.'
    Write-Host ''

    & $npmPath run dev -- --host 127.0.0.1 --port $devSelected --strictPort
    exit $LASTEXITCODE
}

# --- Bouwen -----------------------------------------------------------------

$webIndex = Join-Path $ProjectRoot 'dist\index.html'
$serverBundle = Join-Path $ProjectRoot 'server\dist\main.js'

if ($Rebuild -or -not (Test-Path -LiteralPath $webIndex)) {
    Write-Host ''
    Write-Step 'De app wordt gebouwd (npm run build)...'
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) {
        Write-Problem -Title 'De app kon niet worden gebouwd.' -Lines @(
            'Bekijk de foutmelding hierboven.'
        )
        Wait-BeforeExit
        exit $LASTEXITCODE
    }
}
else {
    Write-Step 'App-build aanwezig.  (gebruik -Rebuild om opnieuw te bouwen)'
}

if ($Rebuild -or -not (Test-Path -LiteralPath $serverBundle)) {
    Write-Host ''
    Write-Step 'De server wordt gebouwd (npm run server:build)...'
    & $npmPath run server:build
    if ($LASTEXITCODE -ne 0) {
        Write-Problem -Title 'De server kon niet worden gebouwd.' -Lines @(
            'Bekijk de foutmelding hierboven.'
        )
        Wait-BeforeExit
        exit $LASTEXITCODE
    }
}
else {
    Write-Step 'Server-build aanwezig.'
}

# --- Poort en adressen ------------------------------------------------------

$selectedPort = Find-FreePort -Preferred $Port
if ($selectedPort -eq 0) {
    Write-Problem -Title "Geen vrije poort gevonden vanaf $Port." -Lines @(
        'Sluit andere servers, of kies een poort:',
        '  .\serve.ps1 -Port 9000'
    )
    Wait-BeforeExit
    exit 1
}
if ($selectedPort -ne $Port) {
    Write-Step "Poort $Port is bezet; $selectedPort wordt gebruikt."
}

$basePath = Get-BasePath
$bindHost = if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }
$localUrl = "http://localhost:$selectedPort$basePath"

$lan = Get-LanAddress
$lanUrl = $null
if ($lan -and -not $LocalOnly) {
    $lanUrl = "http://$($lan.IPAddress):$selectedPort$basePath"
}

# 4. Browser openen zodra de server antwoordt.
$openerJob = $null
if (-not $NoBrowser) {
    $openerJob = Start-Job -ScriptBlock {
        param($TargetUrl, $TargetPort)
        for ($attempt = 0; $attempt -lt 120; $attempt++) {
            try {
                $client = New-Object System.Net.Sockets.TcpClient
                $client.Connect('127.0.0.1', $TargetPort)
                $client.Close()
                Start-Sleep -Milliseconds 400
                Start-Process $TargetUrl
                return
            }
            catch { Start-Sleep -Milliseconds 500 }
        }
    } -ArgumentList $localUrl, $selectedPort
}

Write-Host ''
Write-Host 'Server start...' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Organisator (deze laptop):'
Write-Host "  $localUrl" -ForegroundColor Green
Write-Host ''

if ($lanUrl) {
    Write-Host 'Netwerk (tafels, telefoons en tablets):'
    Write-Host "  $lanUrl" -ForegroundColor Green
    Write-Host "  via $($lan.InterfaceAlias)" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host 'Alle apparaten moeten op dezelfde WiFi zitten. Internet is niet nodig.'
}
elseif ($LocalOnly) {
    Write-Host 'Alleen deze laptop: -LocalOnly is opgegeven, dus tafels kunnen er niet bij.' -ForegroundColor Yellow
}
else {
    Write-Host 'Geen netwerkadres gevonden. Deze laptop lijkt niet met een netwerk' -ForegroundColor Yellow
    Write-Host 'verbonden, dus tafels kunnen er nu niet bij.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Stoppen met Ctrl+C.'
Write-Host ''

# 5. De server op de voorgrond, zodat de uitvoer zichtbaar blijft en Ctrl+C hem
#    netjes stopt. Node krijgt SIGINT door en sluit de database zelf af.
$serverArgs = @($serverBundle, '--port', "$selectedPort", '--host', $bindHost, '--base', $basePath)
if ($Database) { $serverArgs += @('--database', $Database) }

$serverExit = 0
try {
    & $nodePath @serverArgs
    $serverExit = $LASTEXITCODE
}
finally {
    if ($openerJob) {
        Stop-Job -Job $openerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $openerJob -Force -ErrorAction SilentlyContinue
    }
}

if ($serverExit -ne 0) {
    Write-Problem -Title "De server is gestopt met exit code $serverExit." -Lines @(
        'De foutmelding staat hierboven.'
    )
    Wait-BeforeExit
    exit $serverExit
}

Write-Host ''
Write-Host 'Server gestopt.'
Write-Host ''
Write-Host 'Kunnen de tafels de server niet bereiken?' -ForegroundColor DarkGray
Write-Host '  - Staan alle apparaten op dezelfde WiFi (niet op mobiel internet)?' -ForegroundColor DarkGray
Write-Host '  - Staat het WiFi-netwerk in Windows op "Prive" en niet op "Openbaar"?' -ForegroundColor DarkGray
Write-Host '  - Windows Defender Firewall vraagt bij de eerste start om toegang.' -ForegroundColor DarkGray
Write-Host '    Is die vraag weggeklikt, sta Node.js dan alsnog toe via' -ForegroundColor DarkGray
Write-Host '    Windows-beveiliging > Firewall > Een app toestaan.' -ForegroundColor DarkGray
Write-Host '  - Sommige gastnetwerken blokkeren verkeer tussen apparaten onderling.' -ForegroundColor DarkGray
Write-Host ''
