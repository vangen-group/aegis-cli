# Contributing to Aegis CLI

Thank you for your interest in contributing to Aegis CLI! This document outlines guidelines and procedures for contributing.

## Code of Conduct

- Be respectful and professional
- Focus on the quality and correctness of changes
- Test your changes before submitting

## Getting Started

1. **Fork or create a branch** from `master`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Test your changes locally**
   ```bash
   bash -n bin/aegis              # Syntax check
   bash tests/update-uiux.test.sh # Run tests
   ```

3. **Verify bash compatibility**
   - Must work on bash 4.0+
   - Test on macOS (bash 3.x compatibility check) and Linux

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add new feature

   - Explain what the feature does
   - List any helper functions added
   - Note any breaking changes"
   ```

## Coding Standards

### Bash Style

- Use `set -euo pipefail` for error handling
- Prefix helper functions with `_` (e.g., `_update_step_start`)
- Use descriptive variable names (no single letters except loop counters)
- Comment non-obvious logic
- Quote variables: `"$var"` not `$var`

### Function Naming

- **Internal helpers**: `_update_*()` for update-related, `_format_*()` for formatting
- **Commands**: `cmd_*()` for CLI commands
- **Validation**: `_is_*()` or `_check_*()` for checks

### Error Handling

- Use `err()` function for error messages (stderr)
- Use `log()` function for info messages (stdout)
- Exit with code 1 on failure, 0 on success, 2 on usage error

### Logging

- Use `_update_log()` with level: INFO, ERROR, DEBUG
- Include timestamps automatically
- Log at key decision points, not every line

## Testing

### Unit Tests

Add tests to `tests/update-uiux.test.sh` for new functions:

```bash
test_my_function() {
    local result=$(_my_function "input")
    assert_equals "my function description" "expected" "$result"
}
```

### Integration Tests

Test the full `aegis update` flow:
- Dry-run mode (no actual changes)
- Error scenarios (missing files, etc.)
- Recovery from partial updates

### Running Tests

```bash
bash tests/update-uiux.test.sh
```

Expected output:
```
=== Aegis Update UX Tests ===

✓ _format_bytes(512)
✓ _format_bytes(1024)
...

=== Results ===
Passed: 15
All tests passed!
```

## Documentation

### When to Document

- New functions (add comment above the function)
- New CLI flags (update `--help` and README)
- Behavior changes (update CHANGELOG.md)

### Documentation Format

```bash
# Calculate remaining time based on progress
# Arguments: current_percentage (0-100), elapsed_seconds
# Output: formatted time string (e.g., "45s", "2m 30s")
_calculate_eta() {
    local pct="$1" elapsed="$2"
    ...
}
```

## Commits

### Conventional Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add progress bar visualization
fix: correct ETA calculation edge case
docs: add contributing guide
test: add unit tests for formatting functions
refactor: extract timer logic to helper
```

### Commit Size

- **Ideal**: One clear feature or fix per commit
- **Large changes**: Consider splitting into logical chunks
- **Avoid**: Mixing unrelated changes in one commit

## Pull Request Process

1. **Update CHANGELOG.md** with your changes (Unreleased section)
2. **Run tests**: `bash tests/update-uiux.test.sh`
3. **Check syntax**: `bash -n bin/aegis`
4. **Write clear PR description**:
   - What problem does it solve?
   - How does it work?
   - Any breaking changes?
5. **Link related issues** if applicable

### PR Template

```markdown
## What does this do?
Brief description of the feature or fix.

## How does it work?
Explain the implementation approach.

## Testing
- [ ] Syntax check passes
- [ ] Unit tests pass
- [ ] Manual testing done
- [ ] Edge cases considered

## Breaking Changes
- None
(or list any backwards-incompatible changes)
```

## Performance Considerations

- Avoid spawning subshells in loops
- Cache results of expensive operations
- Use `[[ ]]` instead of `[ ]` for faster evaluation
- Minimize string concatenation in loops

## Security

- Never eval() untrusted input
- Quote all variables to prevent word splitting
- Use `set -u` to catch undefined variables
- Validate file paths don't escape intended scope

## Release Process

Automated with [release-please](https://github.com/googleapis/release-please) since
2026-10-30 — VERSION and CHANGELOG.md are no longer edited by hand:

1. Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`,
   `feat!:`/`BREAKING CHANGE:`) — release-please reads these to decide the next
   version and to write the changelog entry.
2. Every push to `master` updates (or opens) a standing "chore(master): release X.Y.Z"
   pull request, which bumps `VERSION` and `CHANGELOG.md` for you.
3. Merge that pull request when you want to ship. The merge itself creates the
   `vX.Y.Z` tag and the GitHub Release, which triggers
   `.github/workflows/release.yml` to build, sign (cosign), and attach the
   release assets.

No manual VERSION edit or `git tag` — doing either by hand now fights the bot
instead of helping it.

## Questions?

- Check existing `bin/aegis` for patterns
- Review `docs/UPDATE_UX.md` for feature context
- Look at recent commits for style examples

## License

By contributing, you agree that your contributions will be licensed under the project's license (Proprietary — VANGEN).
