# aegis.ps1 -- thin wrapper for PowerShell. Contains NO logic of its own: it
# only hands off to the bash script (the single source of truth) via Git
# Bash's bash.exe. See docs/11-aegis-cli.md.
#
# Locally authored, no download step, no ExecutionPolicy bypass required:
# under the default "RemoteSigned" policy, a script created directly on this
# machine (never downloaded, so it carries no Zone.Identifier / Mark of the
# Web) runs as-is.

$ErrorActionPreference = "Stop"

$bash = "C:\Program Files\Git\bin\bash.exe"
$script = Join-Path $PSScriptRoot "aegis"

# Cross-shell stdin (T39.5): PowerShell pipes are NOT inherited by child
# processes by default — `& $bash $script @args` drops the piped content on
# the floor, so `something | aegis ...` arrived empty. Pass it through
# explicitly, and keep the console encodings UTF-8 (no BOM) so CRLF content
# round-trips byte-honest.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

if ([Console]::IsInputRedirected) {
    $input | & $bash $script @args
} else {
    & $bash $script @args
}
exit $LASTEXITCODE
