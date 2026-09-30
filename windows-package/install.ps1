<#
.SYNOPSIS
    Pi Coding Suite - Windows Installer
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "    Pi Coding Suite - Windows Installer" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Determine target paths
$installPrefix = Join-Path $env:LOCALAPPDATA "Programs\pi-agent"
$binDir = Join-Path $installPrefix "bin"
$libDir = Join-Path $installPrefix "lib"

Write-Host "[1/4] Preparing directories..." -ForegroundColor Yellow
Write-Host "  -> Target binary directory:  $binDir"
Write-Host "  -> Target library directory: $libDir"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}
if (-not (Test-Path $libDir)) {
    New-Item -ItemType Directory -Path $libDir -Force | Out-Null
}

# 2. Copy agent bundle files
Write-Host "[2/4] Installing Pi Terminal Coding Agent..." -ForegroundColor Yellow
Write-Host "  -> Copying agent bundle files..."
$sourceLib = Join-Path $scriptDir "lib"
if (Test-Path $sourceLib) {
    Copy-Item -Path (Join-Path $sourceLib "*") -Destination $libDir -Recurse -Force
} else {
    Write-Warning "Source lib directory not found at $sourceLib"
}

# Create launcher batch file (pi.cmd)
$cmdLauncher = Join-Path $binDir "pi.cmd"
$cmdContent = @'
@echo off
setlocal
set "PI_LIB_DIR=%~dp0..\lib"
where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js 22 or higher is required to run pi. >&2
    exit /b 1
)
node "%PI_LIB_DIR%\cli.js" %*
exit /b %ERRORLEVEL%
'@
Set-Content -Path $cmdLauncher -Value $cmdContent -Encoding ASCII

# Create launcher PowerShell script (pi.ps1)
$psLauncher = Join-Path $binDir "pi.ps1"
$psContent = @'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$piLibDir = Join-Path $scriptDir "..\lib"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Error: Node.js (>= 22) is required to run pi."
    exit 1
}
& node "$piLibDir\cli.js" @args
exit $LASTEXITCODE
'@
Set-Content -Path $psLauncher -Value $psContent -Encoding UTF8

Write-Host "  -> Created launcher scripts: $cmdLauncher and $psLauncher"

# Add to user PATH environment variable if needed
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = ($userPath -split ";") | Where-Object { $_ -ne "" }
if ($pathParts -notcontains $binDir) {
    $newUserPath = ($pathParts + $binDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    Write-Host "  [+] Added '$binDir' to User PATH environment variable." -ForegroundColor Green
} else {
    Write-Host "  -> '$binDir' is already in User PATH."
}

# Update current process PATH
if ($env:Path -notlike "*$binDir*") {
    $env:Path = "$binDir;$env:Path"
}

# Verify node and agent
if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
        $cliJs = Join-Path $libDir "cli.js"
        if (Test-Path $cliJs) {
            $agentVersion = & node $cliJs --version 2>$null
            Write-Host "  -> Pi agent verification: version $agentVersion" -ForegroundColor Green
        }
    } catch {
        Write-Warning "Could not verify pi agent version: $_"
    }
} else {
    Write-Warning "Node.js (>= 22) is required but not found in PATH."
}

# Initialize ~/.pi/agent/models.json template if not present
$piConfigDir = Join-Path $env:USERPROFILE ".pi\agent"
if (-not (Test-Path $piConfigDir)) {
    New-Item -ItemType Directory -Path $piConfigDir -Force | Out-Null
}
$modelsFile = Join-Path $piConfigDir "models.json"
if (-not (Test-Path $modelsFile)) {
    $defaultModels = @'
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        
      ]
    }
  }
}
'@
    Set-Content -Path $modelsFile -Value $defaultModels -Encoding UTF8
    Write-Host "  -> Initialized default models template: $modelsFile"
}

# 3. Check VS Code and install extension
Write-Host "[3/4] Checking VS Code environment..." -ForegroundColor Yellow
$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    # Check default install locations
    $defaultCodePath = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"
    if (Test-Path $defaultCodePath) {
        $codeCmd = $defaultCodePath
    }
}

if ($codeCmd) {
    Write-Host "  -> VS Code detected: $codeCmd"
    
    # Identify VSIX file
    $vsixFile = Get-ChildItem -Path $scriptDir -Filter "*.vsix" | Select-Object -First 1
    if ($vsixFile) {
        Write-Host "  -> Removing existing conflicting extensions..."
        $conflicting = @("GitHub.copilot", "GitHub.copilot-chat", "ms-vscode.vscode-websearchforcopilot", "clockzinc.pi-vscode-ui", "zenteiq.pi-vscode-ui", "zenteiq.ziq-vscode-ui")
        foreach ($ext in $conflicting) {
            try {
                & code --uninstall-extension $ext 2>$null | Out-Null
            } catch {}
        }

        Write-Host "  -> Installing latest Pi Coding Assistant extension ($($vsixFile.Name))..."
        & code --install-extension $vsixFile.FullName --force
        Write-Host "  -> Extension installed successfully." -ForegroundColor Green
    } else {
        Write-Warning "No .vsix package found in $scriptDir to install."
    }
} else {
    Write-Warning "VS Code CLI ('code') not found. Skipping VS Code extension installation."
}

Write-Host "[4/4] Installation Complete!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Next Steps:"
Write-Host " 1. Open a new terminal window to use 'pi' command."
Write-Host " 2. In VS Code, reload the window to load the new extension:"
Write-Host "    Ctrl+Shift+P -> 'Developer: Reload Window'"
Write-Host "==================================================" -ForegroundColor Cyan
