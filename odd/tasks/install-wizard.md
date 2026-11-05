# Install wizard — double-click installer for the Aegis CLI

- **Feature:** `install-wizard`
- **Estado:** PLANEO → U1 en curso.
- **Origen:** decisión del dueño (2026-11-04) tras revisar el patrón de
  gentle-shell ("download and double-click, no terminal needed") y el
  runbook LUKS (docs/17 del workstation, sección 10: prerequisitos del
  instalador).
- **Dominio:** vangengroup.com (link de descarga: redirect al release latest).

## Specs

- S1: "vamos con el wizard. de instalacion de aegis cli." — wizard de
  instalación double-click para aegis-cli, al estilo gentle-shell: zip por
  plataforma en GitHub Releases, `.cmd`/`.command` launcher, servidor local
  loopback y wizard en el navegador. Nada se instala sin confirmar el plan.
- S2: El wizard detecta y guía; los comandos de sistema (PowerShell admin,
  BIOS) los ejecuta el humano — el instalador no los corre en silencio
  (docs/17 §10.1-10.2: virtualización, WSL2).
- S3: Frase de paso LUKS y secretos jamás atraviesan el instalador; los tres
  estados del volumen (sellado/montado/inexistente) se detectan y reportan
  (docs/17 §7). El paso LUKS es fase posterior — U-fases, no U1.
- S4: Telemetry: opt-in en la última pantalla del wizard (client-redesign
  L4.4), un toggle transparente.
- S5: Reutilizar `install.sh` como motor (cosign pinned v3.1.3, verificación
  antes de extraer): el wizard orquesta, no reimplementa.
- S6: Seguridad del servidor local: 127.0.0.1 only, cookie de sesión,
  allowlist de rutas fija, el navegador nunca manda comandos ni paths — los
  planes se construyen server-side y el runner local los ejecuta.

## Tasks

- T1 [S1,S5,S6] U1: `scripts/build-installer-bundles.mjs` (zip macOS/Windows
  con launchers `Install Aegis CLI.command`/`.cmd`) + bootstrap defensivo +
  servidor loopback mínimo + wizard UI con plan + confirmación. Tests RED
  primero.
- T2 [S2] Detección de prerequisitos (virtualización/WSL2 en Windows) con
  guía paso a paso del humano.
- T3 [S4] Pantalla final: opt-in telemetry + "siguiente: aegis install
  <license-id>" (primer viaje, client-redesign L4.2).
- T4 LUKS: detección de los tres estados del volumen (S3) — fase posterior.
- T5 Release workflow que publique los zips en GitHub Releases + redirect en
  vangengroup.com.

## Log

- L1: "vamos con el wizard. de instalacion de aegis cli." (2026-11-04). Patrón
  elegido: el de Gentleman-Programming/gentle-shell (zip + double-click +
  wizard web local + plan confirmado). El dueño mostró el banner ASCII VANGEN
  para el CLI — reuso decidido en client-redesign L5.
- T2/T3 — hecho (commit en feat/install-wizard): installer/prereqs.cjs
  detecta virtualización/WSL2 (win32) y /dev/kvm (linux), macOS sin checks,
  runner inyectable (los tests nunca tocan la máquina real); el plan del
  server incluye prereqs + "siguiente: aegis install <license-id>"; el wizard
  muestra prereqs con hints y checkbox de telemetry opt-in (off por defecto);
  /api/confirm persiste telemetry-choice.json. Tests 7/7.
