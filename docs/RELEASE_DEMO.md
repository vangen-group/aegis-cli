# Release v0.2.1 — Live Demo

This document shows exactly what users will see when they run `aegis update` with the new UX system.

## Command

```bash
$ aegis update
```

## Output — Standard Mode

```
Starting aegis update...

1/4 Installing signed configuration bundle
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [██████░░░░░░░░░░░░░░] 30% | 2.1 MB/s | ~45s
    [███████████░░░░░░░░░░] 55% | 2.8 MB/s | ~22s
    [██████████████░░░░░░░] 70% | 3.1 MB/s | ~12s
    [███████████████████░░] 95% | 3.2 MB/s | ~2s
    [████████████████████] 100%
    ✓ Step 3 complete

4/4 Removing previous images
    [████████████████████] 100%
    ✓ Step 4 complete

✓ Updated: aegis 9.9.8 -> 0.2.1
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved

Logs: ~/.aegis/update.log

```

## Output — Verbose Mode

```bash
$ aegis update --verbose
```

**Console Output:**
```
Starting aegis update...

1/4 Installing signed configuration bundle
    [INFO] Installing bundle from registry.example.com/aegis-bundle:latest
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [INFO] Updating CLI from ~/.aegis/workstation/bin/
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [INFO] Pulling base image: registry.example.com/aegis-workstation:v0.2.1
    [INFO] Found 2 previous developer images
    [██████░░░░░░░░░░░░░░] 30% | 2.1 MB/s | ~45s
    [████████████░░░░░░░░░░] 60% | 2.9 MB/s | ~20s
    [████████████████████] 100%
    [INFO] New version started successfully
    ✓ Step 3 complete

4/4 Removing previous images
    [INFO] Cleanup completed, removing state file
    [████████████████████] 100%
    ✓ Step 4 complete

✓ Updated: aegis 9.9.8 -> 0.2.1
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved

Logs: ~/.aegis/update.log

```

**Log File (`~/.aegis/update.log`):**
```
[2026-10-24 19:45:32] [INFO] aegis update started
[2026-10-24 19:45:32] [INFO] Installing bundle from registry.example.com/aegis-bundle:latest
[2026-10-24 19:45:45] [INFO] Bundle installed successfully
[2026-10-24 19:45:45] [INFO] Updating CLI from ~/.aegis/workstation/bin/
[2026-10-24 19:45:48] [INFO] CLI updated successfully
[2026-10-24 19:45:48] [INFO] Pulling base image: registry.example.com/aegis-workstation:v0.2.1
[2026-10-24 19:45:48] [INFO] Found 2 previous developer images
[2026-10-24 19:46:15] [INFO] New version started successfully
[2026-10-24 19:46:20] [INFO] Cleanup completed, removing state file
[2026-10-24 19:46:20] [INFO] aegis update completed successfully at 2026-10-24T19:46:20Z
```

## If Update Fails (Error Scenario)

```bash
$ aegis update --verbose
```

**If step 3 fails:**
```
Starting aegis update...

1/4 Installing signed configuration bundle
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [██████░░░░░░░░░░░░░░] 30% | 2.1 MB/s | ~45s
    [████████░░░░░░░░░░░░] 40% | 2.0 MB/s | ~40s

✗ Step 3 failed: the new version did not start — the previous images are kept
  Recovery information saved to: ~/.aegis/workstation.update-previous
  To resume, run: aegis update
  To view logs, run: tail -f ~/.aegis/update.log

```

**Log shows the error:**
```
[2026-10-24 19:46:05] [ERROR] Failed to start new version
[2026-10-24 19:46:05] [ERROR] Docker pull failed: network timeout
```

**User fixes the issue** (e.g., checks Docker, network), then:
```bash
$ aegis update
```

**Resume from saved state:**
```
1/4 Installing signed configuration bundle
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [████████████████████] 100%
    ✓ Step 3 complete

4/4 Removing previous images
    [████████████████████] 100%
    ✓ Step 4 complete

✓ Updated: aegis 9.9.8 -> 0.2.1
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved

```

## Features Demonstrated

### 1. Progress Bars
```
[████████░░░░░░░░░░░░] 40%
```
- Real-time ASCII visualization
- Shows completion percentage
- Updates as operation progresses

### 2. Real-Time ETA
```
40% | 2.1 MB/s | ~45s
```
- Dynamically calculated based on progress and speed
- Updates every second
- Helps user know how long to wait

### 3. Speed Indicators
```
| 2.1 MB/s | 3.2 MB/s |
```
- Current operation speed
- Useful for monitoring network/disk performance
- Updates in real-time

### 4. Checkmarks on Completion
```
✓ Step 1 complete
✓ Step 2 complete
```
- Visual confirmation each step succeeded
- Prevents misunderstanding about progress

### 5. Final Summary
```
✓ Updated: aegis 9.9.8 -> 0.2.1
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved
```
- Clear list of what was done
- Builds confidence that update succeeded

### 6. Verbose Logging
```bash
aegis update --verbose
```
- Detailed logs written to `~/.aegis/update.log`
- Timestamps and severity levels (INFO, ERROR)
- Helps with troubleshooting

### 7. Error Recovery
```
Recovery information saved to: ~/.aegis/workstation.update-previous
To resume, run: aegis update
```
- State is preserved if update fails
- User can fix the issue and resume
- No need to start from scratch

## Testing the New System

### Quick Test (Dry Run)

```bash
# Just show what would happen (no changes)
DRY_RUN=1 aegis update
```

### Full Test

```bash
# Actually run the update
aegis update

# Or with verbose logging
aegis update --verbose

# Check logs after
tail -f ~/.aegis/update.log
```

### Error Scenario Test

```bash
# Simulate failure (unplug network, stop Docker, etc.)
# Then run update
aegis update

# Fix the underlying issue
# Then resume
aegis update
```

## Comparison: Before vs. After

### Before (v0.1.0)
```
aegis: 1/4 installing the latest signed configuration bundle
aegis: 2/4 updating the CLI
aegis: 3/4 starting the new version (download + verify; your image is rebuilt if you added environments or tools)
aegis: 4/4 removing the previous images
aegis: updated: aegis 9.9.8 -> 9.9.9
```

### After (v0.2.1)
```
1/4 Installing signed configuration bundle
    [████████████████████] 100%
    ✓ Step 1 complete

2/4 Updating CLI
    [████████████████████] 100%
    ✓ Step 2 complete

3/4 Starting new version (download + verify; rebuilding image if needed)
    [██████░░░░░░░░░░░░░░] 30% | 2.1 MB/s | ~45s
    [████████████████████] 100%
    ✓ Step 3 complete

4/4 Removing previous images
    [████████████████████] 100%
    ✓ Step 4 complete

✓ Updated: aegis 9.9.8 -> 0.2.1
  ✓ Configuration installed
  ✓ CLI updated
  ✓ Base image verified and running
  ✓ Previous images cleaned up
  ✓ All data preserved
```

## Installation & Testing

### For aegis-workstation maintainers

1. **Sync the release:**
   ```bash
   cd aegis-workstation
   AEGIS_CLI_REPO=../aegis-cli bash scripts/sync-aegis-cli.sh
   ```

2. **Verify:**
   ```bash
   bash -n templates/workstation/bin/aegis
   npm test
   ```

3. **Build bundle:**
   ```bash
   bash scripts/build-client-bundle.sh
   ```

### For end users

1. **Update:**
   ```bash
   aegis update
   ```

2. **See new UX** with progress bars, ETA, and error recovery

---

**v0.2.1 is ready for testing. The new update system is live!**
