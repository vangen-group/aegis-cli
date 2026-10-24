# Aegis Update UX — Progress Bars & Real-Time Feedback

The `aegis update` command now provides modern, Google-style progress feedback with visual bars, ETAs, and detailed logging.

## Features

### Visual Progress Bars

Each of the 4 update steps shows a real-time progress bar:

```
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

### Real-Time Information

- **Progress bars** - Visual ASCII bars (━ and ░ symbols) from 0-100%
- **Percentage** - Current completion percentage
- **Speed** - Current operation speed (e.g., 3.2 MB/s for downloads)
- **ETA** - Estimated time remaining (calculated in real-time)
- **Checkmarks** - ✓ mark when each step completes

### Verbose Logging

Enable detailed logging for troubleshooting:

```bash
aegis update --verbose
```

Logs are written to `~/.aegis/update.log` with timestamps and severity levels:

```
[2026-10-24 19:45:32] [INFO] aegis update started
[2026-10-24 19:45:32] [INFO] Installing bundle from registry.example.com
[2026-10-24 19:45:45] [INFO] Bundle installed successfully
[2026-10-24 19:45:45] [INFO] Updating CLI from ~/bin
[2026-10-24 19:45:48] [INFO] CLI updated successfully
[2026-10-24 19:45:48] [INFO] Pulling base image: registry.example.com/owner/image:v9.9.9
[2026-10-24 19:46:15] [INFO] New version started successfully
[2026-10-24 19:46:20] [INFO] Cleanup completed
[2026-10-24 19:46:20] [INFO] aegis update completed successfully
```

### Error Recovery

If an update fails, detailed recovery instructions are provided:

```
✗ Step 1 failed: the bundle was not installed
  Recovery information saved to: ~/.aegis/workstation.update-previous
  To resume, run: aegis update
  To view logs, run: tail -f ~/.aegis/update.log
```

The update state is preserved, allowing you to fix the issue and resume with `aegis update`.

## Implementation Details

### Helper Functions

- `_update_step_start(step_num, step_name)` — Display step header
- `_update_step_progress(pct)` — Draw progress bar (0-100%)
- `_update_step_with_eta(step_num, name, pct, speed)` — Progress + ETA + speed
- `_update_step_complete(step_num)` — Mark step complete with checkmark
- `_format_bytes(bytes)` — Convert bytes to human-readable (1.2 MB, 45 KB)
- `_format_eta(seconds)` — Format time remaining (45s, 2m 30s, 1h 15m)
- `_update_log(level, msg)` — Structured logging with timestamps
- `_update_error_with_recovery(step, error, state_file)` — Detailed error + recovery

### Time Tracking

- Each step's elapsed time is tracked via `_UPDATE_STEP_START_TIME`
- ETA is calculated as: `(100 - current_pct) × elapsed_time / current_pct`
- Prevents division by zero and handles edge cases gracefully

### Logging

Logs are written to `~/.aegis/update.log` only when `--verbose` is used:
- Timestamp format: `YYYY-MM-DD HH:MM:SS`
- Severity levels: `INFO`, `ERROR`, `DEBUG`
- Always persists when verbose mode is active

## Usage

```bash
# Standard update with progress bars
aegis update

# Verbose update with detailed logging
aegis update --verbose

# View logs after update
tail -f ~/.aegis/update.log

# Resume a failed update
# (state is automatically preserved)
aegis update
```

## Exit Codes

- `0` - Update successful
- `1` - Update failed (see logs and error message for details)
- `2` - Usage error (bad arguments)

## Future Enhancements

- [ ] Bubble Tea TUI for interactive progress (step 2)
- [ ] Real download speed tracking from Docker
- [ ] Parallel operations with separate progress bars
- [ ] Rollback option on failure
- [ ] Update notifications/scheduling
