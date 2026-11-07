# Starts the ghidra-mcp headless server (github.com/bethington/ghidra-mcp) on 127.0.0.1, no Ghidra GUI needed.
# Reads ghidraInstallDir, javaHome and ghidraMcpJar from reborn.local.json (or GHIDRA_INSTALL_DIR / JAVA_HOME / GHIDRA_MCP_JAR).
# Usage:  powershell -File tools\ghidra-mcp.ps1 [-File <binary>] [-Port 8089] [-Root <folder allowed for imports>]
# Script execution endpoints stay off (GHIDRA_MCP_ALLOW_SCRIPTS unset). Loopback only, so no token is required.
param([string]$File = "", [int]$Port = 8089, [string]$Root = "", [string]$Heap = "4g")
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$cfg = @{}
$local = Join-Path $repo "reborn.local.json"
if (Test-Path $local) { (Get-Content $local -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } }
$ghidra = if ($env:GHIDRA_INSTALL_DIR) { $env:GHIDRA_INSTALL_DIR } else { $cfg["ghidraInstallDir"] }
$javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { $cfg["javaHome"] }
$jar = if ($env:GHIDRA_MCP_JAR) { $env:GHIDRA_MCP_JAR } else { $cfg["ghidraMcpJar"] }
foreach ($p in @($ghidra, $javaHome, $jar)) { if (-not $p -or -not (Test-Path $p)) { throw "missing path: '$p' (set it in reborn.local.json)" } }

$cp = @($jar) + $(foreach ($k in "Framework", "Features", "Processors") { (Get-ChildItem "$ghidra\Ghidra\$k\*\lib\*.jar").FullName })
$state = Join-Path $repo ".evidence\ghidra-mcp"
New-Item -ItemType Directory -Force $state | Out-Null
$argfile = Join-Path $state "java-args.txt"
$lines = @("-Xmx$Heap", "-XX:+UseG1GC", "-Dghidra.home=$ghidra", "-Dapplication.name=GhidraMCP", "-classpath", ('"' + ($cp -join ";").Replace("\", "\\") + '"'), "com.xebyte.headless.GhidraMCPHeadlessServer", "--bind", "127.0.0.1", "--port", "$Port")
if ($File) { $lines += @("--file", ('"' + (Resolve-Path $File).Path.Replace("\", "\\") + '"')) }
Set-Content -Path $argfile -Value $lines -Encoding ascii
if ($Root) { $env:GHIDRA_MCP_FILE_ROOT = (Resolve-Path $Root).Path }
Write-Host "ghidra-mcp headless on http://127.0.0.1:$Port  (ghidra: $ghidra)"
& "$javaHome\bin\java.exe" "@$argfile"
