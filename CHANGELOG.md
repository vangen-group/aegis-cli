# Changelog — Aegis CLI

All notable changes to the Aegis CLI are documented here.

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
