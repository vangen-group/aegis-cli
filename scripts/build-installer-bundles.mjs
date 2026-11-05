// Builds the double-click installer zips (install-wizard T1).
//   node scripts/build-installer-bundles.mjs --out <dir>
// Each zip holds an "Aegis CLI Installer" folder: launcher + bootstrap +
// server + assets + install.sh. No downloads happen here.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out) { console.error("usage: node scripts/build-installer-bundles.mjs --out <dir>"); process.exit(1); }
const root = process.cwd();
const work = join(out, "Aegis CLI Installer");
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "installer"), { recursive: true });
cpSync(join(root, "installer"), join(work, "installer"), { recursive: true });
cpSync(join(root, "install.sh"), join(work, "install.sh"));
writeFileSync(join(work, "Install Aegis CLI.command"), `#!/bin/sh\ncd "$(dirname "$0")" && exec sh installer/bootstrap.sh\n`);
writeFileSync(join(work, "Install Aegis CLI.cmd"), `@echo off\r\ncd /d "%~dp0" && bash installer/bootstrap.sh\r\n`);
for (const [zip] of [["aegis-installer-macos.zip"], ["aegis-installer-windows.zip"]]) {
  // `zip` is not always installed (CI images, WSL minimal); fall back to
  // python3's zipfile module, which is present wherever python3 is.
  try {
    execFileSync("zip", ["-q", "-r", join(out, zip), "Aegis CLI Installer"], { cwd: out });
  } catch {
    execFileSync("python3", ["-m", "zipfile", "-c", join(out, zip), "Aegis CLI Installer"], { cwd: out });
  }
}
console.log(`bundles written to ${out}`);
