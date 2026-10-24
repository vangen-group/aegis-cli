# Aegis CLI — Quick Reference

## Installation

```bash
# Copy to PATH
cp bin/aegis ~/bin/
chmod +x ~/bin/aegis

# Verify
aegis --version
```

## Common Commands

### Update to Latest Version

```bash
# Standard update with progress bars
aegis update

# Verbose update with detailed logging
aegis update --verbose

# View update logs
tail -f ~/.aegis/update.log

# Check update status
aegis status
```

### Up / Down

```bash
# Start the workstation
aegis up

# Start with interactive shell
aegis shell [path]

# Stop containers (preserve volumes)
aegis stop

# Remove containers and networks (preserve volumes)
aegis down

# Remove everything including volumes
aegis down -v
```

### Environments & Tools

```bash
# List installed languages and tools
aegis env list

# Add a language
aegis add environment java 21 --yes
aegis add environment node 22

# Remove a language
aegis remove environment java 21

# Add a tool
aegis add tool gh
aegis add tool az
aegis add tool chromium

# Rebuild image
aegis env rebuild
```

### Secrets & Configuration

```bash
# View a secret
aegis secret show database/prod

# Edit a secret
aegis secret edit database/prod

# List secrets
aegis secret ls

# Set environment variables (session-only)
aegis shell --env auto

# Allowlist a domain
aegis allow add example.com
aegis allow add example.com --port 443
```

### Backup & Restore

```bash
# Create backup
aegis backup

# Restore from backup
aegis restore ~/backups/aegis-backup-*.tar.gz

# Export a file/directory from volume
aegis export code/my-repo/file.txt --dest ~/Desktop

# Import a file/directory to volume
aegis import ~/Desktop/file.txt code/my-repo/
```

### Sandbox (Untrusted Code)

```bash
# Run repository in isolated sandbox
aegis sandbox ~/untrusted-repo

# Sandbox with gVisor (more secure)
aegis sandbox ~/untrusted-repo --gvisor

# Promote repo from sandbox to main workstation
aegis promote ~/untrusted-repo --to code/vangen/trusted-project
```

### Inspection & Troubleshooting

```bash
# Check workstation status
aegis status

# Run security audit
aegis audit

# View help for a command
aegis help [command]

# Check version
aegis version

# Check license
aegis account

# View running logs
aegis status

# Connect to database network
aegis connect database-network
aegis disconnect database-network
```

## Flags & Options

### Update Flags

```bash
aegis update --verbose        # Enable detailed logging
aegis update --dry-run        # Preview changes without applying
```

### Shell Flags

```bash
aegis shell [path]                              # Open interactive shell
aegis shell [path] -- command args              # Run single command
aegis shell --env auto                          # Load env from .envrc
aegis shell --env envs/project/webapp           # Load specific env
aegis shell --tunnel localhost:5432:db.internal # Create TCP tunnel
```

### Herdr (Terminal Multiplexer)

```bash
aegis herdr [path]                    # Start herdr panel
aegis herdr --tunnel localhost:3000   # With tunnels
aegis herdr --env auto                # With environment vars
```

### Build (Inno Setup Windows Installers)

```bash
aegis build windows code/path/to/setup.iss   # Compile .iss → .exe
aegis build clean                             # Remove build image
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (see message for details) |
| 2 | Usage error (bad arguments) |

## File Locations

| File | Purpose |
|------|---------|
| `~/.aegis/workstation` | Installed configuration (workstation template) |
| `~/.aegis/sandbox-install` | Installed sandbox template |
| `~/.aegis/license` | Aegis license file |
| `~/.aegis/update.log` | Verbose update logs (when using `--verbose`) |
| `~/.aegis/environments.json` | Language/tool manifest |
| `~/.aegis/device.json` | Device activation info |
| `/workspace/memories` | Persistent development files (volume) |
| `/workspace/code` | Project repositories (volume) |

## Environment Variables

### Configuration

```bash
export AEGIS_WORKSTATION_DIR="/path/to/workstation/template"
export AEGIS_BIN_DIR="$HOME/bin"
export AEGIS_INSTALL_DIR="$HOME/.aegis/workstation"
export AEGIS_SANDBOX_INSTALL_DIR="$HOME/.aegis/sandbox"

export AEGIS_ENV_FILE="$HOME/.aegis/environments.json"
export AEGIS_ALLOWLIST_FILE="$HOME/.aegis/allowlist.txt"

export AEGIS_IMAGE_REGISTRY="registry.example.com"
export AEGIS_IMAGE_REPO="owner/image"
export AEGIS_IMAGE_TAG="v0.2.0"

export AEGIS_TELEMETRY="off"  # or "on"
```

### Advanced

```bash
# License verification
export AEGIS_LICENSE_FILE="$HOME/.aegis/license"
export AEGIS_LICENSE_KEYS_FILE="$HOME/.aegis/license-keys.json"

# Device activation
export AEGIS_DEVICE_CREDENTIAL_FILE="$HOME/.aegis/device.json"

# Build logging
export AEGIS_BUILD_LOG_DIR="$HOME/.aegis/logs"

# Signatures (T21)
export AEGIS_UPDATE_TRUST_FILE="$HOME/.aegis/allowed-signers"
export AEGIS_REQUIRE_SIGNATURES=1
```

## Aliases (Recommended)

```bash
# ~/.bashrc or ~/.zshrc

alias aegis-shell='aegis shell'
alias aegis-status='aegis status'
alias aegis-logs='tail -f ~/.aegis/update.log'
alias aegis-audit='aegis audit'

# Navigate to project
alias workspace='cd /workspace/code'
alias memories='cd /workspace/memories'
```

## Common Issues

### Update Fails

```bash
# View logs
aegis update --verbose

# Or check existing logs
tail -f ~/.aegis/update.log

# Resume after fixing the issue
aegis update
```

### License Invalid

```bash
# View license status
aegis account

# Activate new license
aegis account activate <license-id>

# Renew expiring license
aegis account renew
```

### Image Pull Fails

```bash
# Check Docker access and registry credentials
docker login registry.example.com

# Retry update
aegis update
```

### Volumes Full

```bash
# Check sizes
docker volume ls
docker system df

# Clean up old images
aegis update  # removes orphaned images during update

# Or manually
docker image prune
docker volume prune
```

## Performance Tips

- **Parallel operations**: Use `aegis env rebuild` once instead of multiple `add`
- **Network**: Add only needed domains to allowlist (`aegis allow add`)
- **Storage**: Regular `aegis backup` + `aegis down -v` to clean unused images
- **Logging**: Use `--verbose` only when troubleshooting (adds overhead)

## Getting Help

```bash
aegis help                    # Overall help
aegis help update             # Help for specific command
aegis --help                  # Same as aegis help

# Online documentation
open https://github.com/vangen-group/aegis-cli
```
