# Changelog — Aegis CLI

All notable changes to the Aegis CLI are documented here.

## [0.2.10](https://github.com/vangen-group/aegis-cli/compare/v0.2.9...v0.2.10) (2026-10-31)


### Bug Fixes

* remove the automatic gh auth setup-git at aegis up ([5665a46](https://github.com/vangen-group/aegis-cli/commit/5665a46e3b7545d844328779431119e011f9b2e9))

## [0.2.9](https://github.com/vangen-group/aegis-cli/compare/v0.2.8...v0.2.9) (2026-10-31)


### Bug Fixes

* accept the leading ./ aegis-cli release tar members carry ([f3d686c](https://github.com/vangen-group/aegis-cli/commit/f3d686cd3e92c2b4a7a1f0305ab091d393452549))

## [0.2.8] - 2026-10-31

### Fixed
- `bin/aegis` was frozen since the initial sync from aegis-workstation (before its T4/T5 migration work existed), so this release never actually carried either fix: `aegis update`'s CLI step downloading from aegis-cli releases (T4), or `aegis install` no longer requiring `bin/aegis` to exist inside the bundle (T5). A client on v0.2.7 running `aegis update` against the current bundle (which stopped shipping `bin/aegis` in T5) hit the stale requirement forever, with no newer logic on the installed binary to break the loop. Synced `bin/aegis` from aegis-workstation's current copy to fix it for real.
- Published manually (release-please is currently blocked on this repo — "GitHub Actions is not permitted to create or approve pull requests" — until that permission or a `RELEASE_PLEASE_TOKEN` is set up).

## [0.2.7] - 2026-10-29

### Fixed
- `install.sh` refused to run under Git Bash on Windows (`uname -s` reports `MINGW64_NT-...`), telling the user to use WSL instead — even though Git Bash is the exact shell `aegis.cmd` itself launches (`bash.exe`) for every Windows client. Added `MINGW*`/`MSYS*`/`CYGWIN*` detection mapping to a native `cosign-windows-amd64.exe` (pinned checksum from cosign v3.1.3's own `cosign_checksums.txt`) — no WSL detour needed, since Git Bash runs real Windows processes directly.

## [0.2.5] - 2026-10-29

### Fixed
- v0.2.4's release tarball was broken and never consumed by anyone: it packed `bin/aegis` etc. with a `bin/` prefix inside the archive, so `tar -xzf ... -C ~/bin` (the documented extraction command, docs/11-aegis-cli.md §2.0 in aegis-workstation) would have landed `~/bin/bin/aegis` instead of `~/bin/aegis`. The archive is now flat at the root, matching aegis-workstation's build-client-cli.sh shape.
- Added `config/license-keys.json` (public license-verification keys) to the release tarball as `aegis-license-keys.json`. Without it, `aegis account activate` on a fresh standalone install (no aegis-workstation configuration tree yet) had no key to verify the license against — bin/aegis's own fallback (`SCRIPT_DIR/aegis-license-keys.json`) would have found nothing.
- v0.2.4's tag and GitHub Release were deleted (never downloaded by anyone, broken on arrival) rather than left in the release history.

## [0.2.4] - 2026-10-29 (deleted, see 0.2.5)

### Added
- `bin/aegis-license.js`, `bin/aegis-activate.js`, `bin/aegis-license-api.js`, `bin/aegis-telemetry.js`, `bin/aegis.cmd`, `bin/aegis.ps1` — the rest of the client CLI's files, previously only shipped from aegis-workstation's bundle. First step of the standalone-distribution migration (this repo becomes the single source of truth for the CLI).

### Fixed
- Synced `bin/aegis` with aegis-workstation's copy, including the update-resume fix: a fresh `aegis update` retry now re-installs the bundle instead of looping forever on a known-broken published version (aegis-workstation issue #251 follow-up).
- `tests/update-uiux.test.sh`: replaced `((passed++))`/`((failed++))` with `passed=$((passed + 1))` — under `set -e`, the arithmetic-expression form returns the PRE-increment value, so incrementing from 0 evaluated to "false" and killed the whole suite after the very first assertion. The suite's nothing-after-the-first-check behavior was this bug, not a passing run.

## [0.2.3] - 2026-10-24

### Fixed
- Progress bars now use ASCII fallback (=/-) on Windows PowerShell and limited terminals
- Improved terminal capability detection for Unicode support
- Better rendering on terminals that don't support box-drawing characters

## [0.2.2] - 2026-10-24

### Added
- Synced to aegis-workstation for bundle publication
- Release demo documentation with live output examples

### Changed
- Improved terminal compatibility for progress bars

## [0.2.1] - 2026-10-24

### Added
- Integration documentation with aegis-workstation sync
- `docs/INTEGRATION.md` with complete workflow guide

### Changed
- Improved ETA calculation edge case handling
- Better error messages with recovery context

### Fixed
- ETA calculation when elapsed time is less than 1 second
- Spinner animation compatibility on different terminals

## [0.2.0] - 2026-10-24

### Added
- **Visual progress bars** for `aegis update` with ASCII art (━ and ░ symbols)
- **Real-time ETA calculation** based on elapsed time and completion percentage
- **Speed indicators** (e.g., 3.2 MB/s) for download operations
- **Verbose logging** with `--verbose` flag → `~/.aegis/update.log`
- **Structured logging** with timestamps and severity levels (INFO, ERROR, DEBUG)
- **Error recovery guidance** with state preservation for interrupted updates
- **Detailed final summary** with checklist of completed tasks

### Helper Functions (Internal)
- `_update_step_start()` — Display step header
- `_update_step_progress()` — Draw ASCII progress bar (0-100%)
- `_update_step_with_eta()` — Progress + ETA + speed in real-time
- `_update_step_complete()` — Mark step complete with checkmark
- `_format_bytes()` — Convert bytes to human-readable (1.2 MB, 45 KB)
- `_format_eta()` — Format time remaining (45s, 2m 30s, 1h 15m)
- `_update_log()` — Structured logging with timestamps
- `_update_error_with_recovery()` — Detailed error + recovery instructions
- `_update_enable_logging()` — Enable verbose mode and set log file
- `_update_spinner()` — Braille spinner for indeterminate operations

### Documentation
- Added `docs/UPDATE_UX.md` with complete feature documentation
- Example output showing progress bars, ETAs, and logging
- Usage guide with examples and exit codes
- Future enhancement roadmap (Bubble Tea TUI, real speed tracking)

### Testing
- Added `tests/update-uiux.test.sh` with unit tests for helper functions
- Tests for `_format_bytes()`, `_format_eta()`, progress bars, logging

### Changed
- Updated `.gitignore` to track source scripts (`bin/aegis`, `.cmd`, `.ps1`)
- Improved `cmd_update_client()` with verbose flag support

## [0.1.0] - 2026-10-24 (Initial)

### Added
- Migrated bash script from `aegis-workstation` to dedicated `aegis-cli` repository
- Initial project structure: `bin/`, `docs/`, `tests/`, `scripts/`
- Basic README with project overview
- `.gitignore` configuration

---

## Versioning Strategy

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0) — Breaking changes, CLI interface changes
- **MINOR** (0.Y.0) — New features, backwards compatible
- **PATCH** (0.0.Z) — Bug fixes, no feature changes

Examples:
- `0.2.0` — Added progress bars, logging (new features)
- `0.2.1` — Fixed ETA calculation edge case (patch)
- `1.0.0` — First stable release, backwards-compatible guarantee

## Future Releases

### v0.3.0 (Planned)
- [ ] Real download speed tracking from Docker
- [ ] Parallel progress bars for concurrent operations
- [ ] Rollback option on failure
- [ ] Update notifications/scheduling

### v1.0.0 (Planned)
- [ ] Go rewrite with Bubble Tea TUI
- [ ] Compiled binary (faster, more portable)
- [ ] Additional commands beyond `update` (full CLI refactor)
- [ ] Backwards-compatible with v0.x bash version
