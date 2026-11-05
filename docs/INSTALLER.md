# The Aegis CLI installer wizard (install-wizard T11)

The double-click installer packages the verified `install.sh` behind a local
browser wizard. This document is the operator-facing overview; behavior specs
live in `odd/tasks/install-wizard.md`.

## How it works

1. **Bundle** — `scripts/build-installer-bundles.mjs` builds per-platform zips
   (macOS `.command`, Windows `.cmd`), each containing a defensive bootstrap,
   a loopback server (`installer/server.mjs`), and the pinned `install.sh`
   plus the `VERSION` stamp.
2. **Bootstrap** — validates the bundle layout (missing files, symlinks),
   then starts the server with bundled/system node. On Windows the `.cmd`
   relaunches everything inside the WSL2 Ubuntu distro (`wsl -e` +
   `WSLENV` path handoff); without WSL it prints the exact enabling commands
   and pauses. The terminal never closes on failure (unconditional pause).
3. **Wizard** — a dependency-free server on `127.0.0.1` (session cookie,
   fixed route allowlist, CSP `default-src 'self'`, no external resources):
   - **Check** — per-platform prerequisites (virtualization, WSL2 with the
     documented DISM procedure, Docker Desktop/Engine via `docker info`,
     existing aegis install as non-blocking info). Missing things show a
     human hint; under WSL2 virtualization is auto-satisfied.
   - **Review** — a sectioned plan (download → verify → install → the
     workstation handoff) naming what each step needs; telemetry opt-in
     (off by default) persisted to `telemetry-choice.json`.
   - **Install** — nothing runs until the confirm POST (session-gated; the
     browser never sends commands or paths). Progress is derived from
     install.sh's `[step] started/finished` markers (T10 protocol); a journal
     (`~/.local/state/aegis-cli/install-state`) lets a re-run resume where a
     stuck run stopped (S7), and the journal resets when the target tag
     changes.
   - **Done** — the next journey: `aegis license activate <license-id>`.

## Language

Spanish is the default (owner decision). The top-bar **EN/ES** toggle sets an
`aegis_lang` cookie; hints, plan sections, progress labels and the UI chrome
all follow it.

## Release pipeline

The tag-triggered Release workflow builds both zips, stamps `VERSION` from
the tag, and uploads them as release assets next to the signed tarball — no
manual asset uploads.
