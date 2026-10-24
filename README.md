# Aegis CLI

The command-line interface for Aegis Workstation — a hermetic dev environment for supervised AI agents.

## Structure

```
aegis-cli/
├── bin/
│   └── aegis              # Main CLI script (bash)
├── scripts/               # Helper scripts
├── docs/                  # Documentation
└── tests/                 # Test suites
```

## Usage

```bash
./bin/aegis --help
./bin/aegis update        # Update to latest version
./bin/aegis version       # Show version
```

## Building

The CLI is bash-based and requires no compilation. Just copy `bin/aegis` to your PATH:

```bash
cp bin/aegis ~/bin/
chmod +x ~/bin/aegis
```

## Roadmap

- [ ] Migrate update command UX to modern progress bars
- [ ] Consider Go rewrite for performance (future)
- [ ] Bubble Tea TUI integration (future)

## License

Proprietary — Vanguard Engine Group (VANGEN). All rights reserved.
