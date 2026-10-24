# Aegis CLI

A modern, secure CLI for managing Aegis workstations and sandboxes.

## Features

- 🚀 Fast, efficient command execution
- 📊 Beautiful progress bars with Google-style UX
- 🔒 Secure bundle verification
- 🎨 Colorized output with clear feedback
- ⚡ ETA and speed indicators

## Building

```bash
make build
```

## Running

```bash
./bin/aegis --help
./bin/aegis update
./bin/aegis version
```

## Development

```bash
make dev      # Build for development
make test     # Run tests
make clean    # Clean build artifacts
```

## Architecture

- `cmd/` - CLI commands
- `internal/update/` - Update logic
- `main.go` - Entry point

## License

Proprietary — Vanguard Engine Group (VANGEN). All rights reserved.
