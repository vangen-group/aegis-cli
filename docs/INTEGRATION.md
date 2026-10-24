# Integration with Aegis Workstation

Aegis CLI is the **authoritative source** for the Aegis launcher. It is automatically synchronized to aegis-workstation and included in the distributed bundle.

## Architecture

### Role

```
aegis-cli
├─ Source of truth for CLI logic
├─ UX improvements (progress bars, logging, error recovery)
├─ Tests and documentation
└─ Independent release cycle (v0.2.0, v0.3.0, etc.)

↓ [Automatic sync on release]

aegis-workstation
├─ Bundles aegis CLI into templates/workstation/bin/aegis
├─ Builds Docker image with aegis included
├─ Signs and publishes to registry
└─ Users run: aegis update
```

### Integration Points

1. **Development**: Edit `/bin/aegis` in aegis-cli
2. **Testing**: Run `bash tests/update-uiux.test.sh`
3. **Release**: Tag release (e.g., `v0.2.0`)
4. **Sync**: aegis-workstation CI automatically syncs
5. **Bundle**: aegis-workstation builds new bundle with updated CLI
6. **User**: `aegis update` → downloads new bundle → gets latest CLI

## Workflow

### 1. Making Changes

```bash
cd aegis-cli

# Edit the CLI
vim bin/aegis

# Test locally
bash tests/update-uiux.test.sh

# Verify syntax
bash -n bin/aegis

# Commit
git add bin/aegis
git commit -m "feat: improve update UX"
```

### 2. Release

```bash
# Update version
echo "0.2.1" > VERSION

# Update CHANGELOG.md (move Unreleased to 0.2.1)

# Create tag
git tag -a v0.2.1 -m "Release v0.2.1: bug fix for ETA calculation"

# Push
git push origin v0.2.1
```

**CI/CD automatically:**
- Runs tests
- Creates release on GitHub
- Publishes artifact (future: compiled binary)
- Triggers aegis-workstation sync (via webhook)

### 3. Automatic Sync (in aegis-workstation CI)

```bash
# aegis-workstation CI detects aegis-cli release
bash scripts/sync-aegis-cli.sh  # Copies bin/aegis from aegis-cli

# Verifies
bash -n templates/workstation/bin/aegis

# Tests
npm test

# Builds bundle
bash scripts/build-client-bundle.sh
```

### 4. Bundle Distribution

```
New bundle includes: aegis CLI v0.2.1
    ↓ [Sign with Cosign]
    ↓ [Push to registry]
    ↓ [User: aegis update]
✓ User gets CLI v0.2.1 with latest UX
```

## Versioning

### Semantic Versioning

- **0.2.0** — Current (progress bars, logging, error recovery)
- **0.2.1** — Patch (bug fixes)
- **0.3.0** — Minor (new features, backwards compatible)
- **1.0.0** — Major (Go rewrite, compiled binary)

### Version in aegis-workstation

aegis-workstation bundles whatever version of aegis CLI it syncs:

```
aegis-workstation v0.15.0
├─ Includes: aegis-cli v0.2.0
└─ User sees: "aegis version 0.2.0"

aegis-workstation v0.16.0
├─ Includes: aegis-cli v0.3.0 (after sync)
└─ User sees: "aegis version 0.3.0"
```

## Documentation

### What to Update

When you make changes, update in aegis-cli:

| Change | Update |
|--------|--------|
| New feature | `docs/UPDATE_UX.md` + README |
| New flag | `docs/QUICK_REFERENCE.md` + `--help` |
| Bug fix | `CHANGELOG.md` (Unreleased → version) |
| Breaking change | Note in `CHANGELOG.md` + `CONTRIBUTING.md` |

### Documentation NOT to update

- aegis-workstation docs (handled separately)
- aegis-workstation's copy of the CLI (auto-synced, don't edit)

## Testing Strategy

### Before Release

```bash
# 1. Unit tests (in aegis-cli)
bash tests/update-uiux.test.sh

# 2. Syntax check
bash -n bin/aegis

# 3. Integration test (if possible)
# Run aegis update in test environment
```

### After Sync (in aegis-workstation CI)

```bash
# 1. Verify sync was successful
bash -n templates/workstation/bin/aegis

# 2. Run aegis-workstation tests
npm test

# 3. Build bundle (validates Docker, Cosign, etc.)
bash scripts/build-client-bundle.sh
```

## Troubleshooting

### "aegis-workstation sync didn't pick up my changes"

1. **Verify release was created**: `git tag -l v0.2.1`
2. **Check aegis-workstation CI**: Look for sync job
3. **Manual sync** (if CI is delayed):
   ```bash
   cd aegis-workstation
   AEGIS_CLI_REPO=../aegis-cli bash scripts/sync-aegis-cli.sh
   ```

### "Sync went wrong, need to rollback"

In aegis-workstation:
```bash
# Restore previous version from backup
cp templates/workstation/bin/aegis.backup-TIMESTAMP templates/workstation/bin/aegis
```

Then commit that revert.

### "CLI doesn't work after syncing"

1. **Check syntax**: `bash -n templates/workstation/bin/aegis`
2. **Verify backup**: `ls templates/workstation/bin/aegis.backup-*`
3. **Check aegis-cli tests**: Did they pass in the release?
4. **Check aegis-workstation tests**: Did they pass after sync?

## Future: Go Rewrite (v1.0.0)

When aegis-cli is rewritten in Go:

### Changes

1. **Build**: Compile `go build -o dist/aegis`
2. **Distribution**: Release binary as artifact
3. **Sync**: Copy compiled binary (not bash script)
4. **Size**: Smaller, faster, more portable
5. **UX**: Bubble Tea TUI instead of bash progress bars

### Backwards Compatibility

- v1.0.0 binary will accept all v0.x flags
- Flags will be enhanced (e.g., `--verbose` gets TUI mode)
- Error messages will improve
- Users won't need to change workflows

## Contributing

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for:
- Code style and conventions
- Testing requirements
- PR process
- Release procedure

## Links

- **aegis-cli repo**: https://github.com/vangen-group/aegis-cli
- **aegis-workstation**: https://github.com/vangen-group/aegis-workstation
- **Sync script**: `../scripts/sync-aegis-cli.sh` (in aegis-workstation)
- **CLI Usage**: `../docs/QUICK_REFERENCE.md`
