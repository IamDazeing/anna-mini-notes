param(
  [string]$Platform = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExecutaRoot = Join-Path $ProjectRoot "executas\mini-notes-summarizer"
$DistRoot = Join-Path $ProjectRoot "dist"
$ToolName = "mini-notes-summarizer"

if (-not $Platform) {
  if ($env:OS -ne "Windows_NT") { throw "This PowerShell packager builds Windows; use package-executa.sh on macOS." }
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($arch -ne "X64") { throw "Unsupported local Windows architecture: $arch" }
  $Platform = "windows-x86_64"
}
if ($Platform -ne "windows-x86_64") { throw "PowerShell packager only supports windows-x86_64." }

cargo build --release --manifest-path (Join-Path $ExecutaRoot "Cargo.toml")
if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }

$Stage = Join-Path $DistRoot "stage-$Platform"
$BinDir = Join-Path $Stage "bin"
if (Test-Path -LiteralPath $Stage) {
  $ResolvedStage = (Resolve-Path -LiteralPath $Stage).Path
  $ResolvedDist = (Resolve-Path -LiteralPath $DistRoot).Path
  if (-not $ResolvedStage.StartsWith($ResolvedDist + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean stage outside dist: $ResolvedStage"
  }
  Remove-Item -LiteralPath $ResolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $ExecutaRoot "target\release\$ToolName.exe") -Destination (Join-Path $BinDir "$ToolName.exe") -Force

$ArchiveManifest = @{
  name = "tool-test-mini-notes-summarizer-12345678"
  version = "1.0.0"
  runtime = @{ binary = @{
    entrypoint = "bin/$ToolName.exe"
    permissions = @{ "bin/$ToolName.exe" = "0o755" }
  }}
} | ConvertTo-Json -Depth 8
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $Stage "manifest.json"), $ArchiveManifest, $Utf8NoBom)

New-Item -ItemType Directory -Path $DistRoot -Force | Out-Null
$Archive = Join-Path $DistRoot "$ToolName-$Platform.zip"
if (Test-Path -LiteralPath $Archive) { Remove-Item -LiteralPath $Archive }
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Archive
Write-Output $Archive
