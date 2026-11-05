// Builds the double-click installer zips (install-wizard T1).
//   node scripts/build-installer-bundles.mjs --out <dir>
// Each zip holds an "Aegis CLI Installer" folder: launcher + bootstrap +
// server + assets + install.sh. No downloads happen here.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const outArg = process.argv[process.argv.indexOf("--out") + 1];
if (!outArg) { console.error("usage: node scripts/build-installer-bundles.mjs --out <dir>"); process.exit(1); }
// Absolute on purpose: the zip step runs with cwd=out, so a relative --out
// would resolve against the wrong directory.
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const root = process.cwd();
const work = join(out, "Aegis CLI Installer");
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "installer"), { recursive: true });
cpSync(join(root, "installer"), join(work, "installer"), {
  recursive: true,
  // telemetry-choice.json is a runtime artifact (written by the server when
  // a user confirms) — it never belongs in a fresh bundle.
  filter: (src) => !src.endsWith("telemetry-choice.json"),
});
cpSync(join(root, "install.sh"), join(work, "install.sh"));
writeFileSync(join(work, "Install Aegis CLI.command"), `#!/bin/sh\ncd "$(dirname "$0")" && exec sh installer/bootstrap.sh\n`);
writeFileSync(join(work, "Install Aegis CLI.cmd"), [
  "@echo off",
  "rem Everything installs INSIDE the WSL2 Ubuntu environment - the Windows host",
  "rem only holds this zip. Relaunch the bootstrap inside WSL when available.",
  "where wsl.exe >nul 2>nul",
  "if %errorlevel%==0 (",
  "  wsl -e sh -c \"cd \\\"$(wslpath -a '%~dp0')\\\" && exec sh installer/bootstrap.sh\"",
  "  if errorlevel 1 (",
  "    echo.",
  "    echo The installer failed inside WSL - read the message above.",
  "    pause",
  "  )",
  ") else (",
  "  echo Aegis CLI needs WSL2 ^(Ubuntu^) first.",
  "  echo In an Administrator PowerShell run:",
  "  echo   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart",
  "  echo   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart",
  "  echo   wsl --update ^&^& wsl --set-default-version 2",
  "  echo Then RESTART Windows and double-click this installer again.",
  "  pause",
  ")",
].join("\r\n") + "\r\n");
for (const [zip] of [["aegis-installer-macos.zip"], ["aegis-installer-windows.zip"]]) {
  // `zip` is not always installed (CI images, WSL minimal); fall back to
  // python3's zipfile module, which is present wherever python3 is.
  try {
    execFileSync("zip", ["-q", "-r", zip, "Aegis CLI Installer"], { cwd: out });
  } catch {
    execFileSync("python3", ["-m", "zipfile", "-c", zip, "Aegis CLI Installer"], { cwd: out });
  }
}
console.log(`bundles written to ${out}`);
