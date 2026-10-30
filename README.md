# Aegis CLI

The modern command-line interface for **Aegis Workstation** — a hermetic dev environment for supervised AI agents with secure secrets, network isolation, and detailed audit trails.

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
![Status](https://img.shields.io/badge/status-Active-green)

## Features

### Update with Modern UX
- ✨ **Visual progress bars** — Real-time ASCII bars with completion percentage
- ⏱️ **ETA & speed** — Dynamic time remaining and operation speed (MB/s)
- 📋 **Detailed logging** — Verbose mode with timestamps and log file
- 🔄 **Error recovery** — Preserve state and resume interrupted updates
- ✅ **Clear feedback** — Checkmarks and summary for each step

### Complete CLI
- 🚀 **Workstation management** — Up, down, status, audit
- 🔧 **Environment control** — Add/remove languages and tools
- 🔒 **Secrets handling** — Secure credential storage and injection
- 📦 **Backup/restore** — Full workstation snapshots
- 🔌 **Network tools** — Tunneling, allowlist, SSH certificates

## Quick Start

### Installation

```bash
cp bin/aegis ~/bin/
chmod +x ~/bin/aegis
aegis --version
```

### First Update

```bash
# Standard update with progress bars
aegis update

# Verbose update with detailed logs
aegis update --verbose
```

### Start Developing

```bash
aegis up                              # Start workstation
aegis shell code/my-project           # Open shell in project
aegis add environment python 3.12     # Install Python 3.12
aegis add tool gh                     # Add GitHub CLI
```

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/UPDATE_UX.md`](docs/UPDATE_UX.md) | Progress bars, logging, error recovery |
| [`docs/QUICK_REFERENCE.md`](docs/QUICK_REFERENCE.md) | Command cheatsheet and aliases |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development guidelines and release process |
| [`CHANGELOG.md`](CHANGELOG.md) | Feature history and versioning |

## Project Structure

```
aegis-cli/
├── bin/
│   └── aegis                  # Main CLI (8400+ lines, bash)
├── docs/
│   ├── UPDATE_UX.md          # Progress bar feature docs
│   └── QUICK_REFERENCE.md    # Command cheatsheet
├── tests/
│   └── update-uiux.test.sh   # Unit tests (15+ cases)
├── scripts/                   # Helper utilities (planned)
├── VERSION                    # Semantic version (release-please managed)
├── CHANGELOG.md              # Complete change history
├── CONTRIBUTING.md           # Contribution guidelines
└── README.md                 # This file
```

## Architecture Highlights

### Progress & Feedback
- Helper functions for progress bars, formatting, logging
- Real-time ETA calculation: `(100 - pct) × elapsed / pct`
- Time tracking per step with `_UPDATE_STEP_START_TIME`
- Supports `--verbose` for detailed logs to `~/.aegis/update.log`

### Error Handling
- Preserves update state for resume on failure
- Provides recovery instructions and log location
- Detailed error messages with context
- Exit codes: 0 (success), 1 (error), 2 (usage)

### Testing
- Unit tests for all helper functions
- Tests for edge cases and formatting
- Run: `bash tests/update-uiux.test.sh`

## Usage Examples

### Update to Latest Version

```bash
# Standard update
$ aegis update
1/4 Installing signed configuration bundle
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [████████████░░░░░░░░] 60% | 3.1 MB/s | ~8s
    ✓ Step 3 complete

4/4 Removing previous images
    [████████████████████] 100%
    ✓ Step 4 complete

✓ Updated: aegis 9.9.8 -> 9.9.9
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved
```

### Verbose Mode with Logging

```bash
$ aegis update --verbose
# Logs written to ~/.aegis/update.log

$ tail -f ~/.aegis/update.log
[2026-10-24 19:45:32] [INFO] aegis update started
[2026-10-24 19:45:32] [INFO] Installing bundle from registry.example.com
[2026-10-24 19:45:45] [INFO] Bundle installed successfully
...
```

## Versioning

This project follows **[Semantic Versioning](https://semver.org/)**:

- **v0.2.0** — Current: Progress bars, logging, error recovery
- **v0.3.0** — Planned: Real speed tracking, parallel operations
- **v1.0.0** — Planned: Go rewrite, Bubble Tea TUI

See [`CHANGELOG.md`](CHANGELOG.md) for complete history.

## Development

### Run Tests

```bash
bash tests/update-uiux.test.sh
```

### Check Syntax

```bash
bash -n bin/aegis
```

### Contribution Guidelines

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for:
- Code style and naming conventions
- Testing requirements
- PR process and release procedure
- Security considerations

### Creating a New Release

Automated by [release-please](https://github.com/googleapis/release-please) — see
"Release Process" in [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: commit with
Conventional Commits, merge the release PR it keeps open, done.

## Roadmap

### v0.3.0 (Planned)
- [ ] Real download speed tracking from Docker
- [ ] Parallel progress bars for concurrent operations
- [ ] Rollback option on failure
- [ ] Update notifications/scheduling

### v1.0.0 (Planned)
- [ ] Go rewrite with Bubble Tea TUI
- [ ] Compiled binary (faster, more portable)
- [ ] Full CLI commands refactor
- [ ] Backwards-compatible with v0.x

## Architecture Decisions

### Why Bash (for v0.x)?

- **Fast**: No runtime overhead, direct shell execution
- **Portable**: Works on any Unix/Linux system with bash 4.0+
- **Transparent**: Easy to audit and modify
- **Legacy**: Maintains compatibility with existing aegis-workstation

### Why Go (for v1.0)?

- **Performance**: Compiled binary, lower latency
- **Rich UX**: Bubble Tea for interactive TUI
- **Cross-platform**: Windows/macOS/Linux native binaries
- **Maintainability**: Stronger type safety, better tooling

## License

**Proprietary** — Vanguard Engine Group (VANGEN). All rights reserved.

## Support

- 📖 Read [`docs/UPDATE_UX.md`](docs/UPDATE_UX.md) for feature details
- 🔍 Check [`docs/QUICK_REFERENCE.md`](docs/QUICK_REFERENCE.md) for commands
- 💬 See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development help

---

Made with ❤️ by VANGEN for secure, auditable AI agent development.
