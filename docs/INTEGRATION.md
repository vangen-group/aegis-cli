# Integration with Aegis Workstation

Aegis CLI is the **distribution and release channel** for the `aegis`
launcher. A client never reads a copy bundled by aegis-workstation — it
always installs/updates from this repo's own signed releases:

```
aegis-cli                                  aegis-workstation
├─ Signs and publishes releases            ├─ Where the launcher is actually
│  (cosign keyless)                        │  developed and tested: owns the
├─ Own release-please version cadence      │  docker-compose config, the dev
└─ install.sh: first-time install          │  image, and the ~320 tests that
                                            │  exercise bin/aegis against them
                                            └─ `aegis update` downloads the
                                               latest aegis-cli release itself
                                               (verify, then install) — it
                                               never reads a bundled copy
```

At runtime there is no webhook, no sync, no coupling at all — a client's
`aegis update` just downloads the latest signed release from this repo.

Maintaining this repo's `bin/`/`config/license-keys.json` is a different
matter: `.github/workflows/sync-launcher.yml` pulls the current files from
aegis-workstation (read-only token, scoped to that one repo) and commits
here if they changed, which then flows through release-please like any
other `fix:`. This repo is never hand-edited to fix launcher behavior —
edit aegis-workstation and let the sync bring it here (see that repo's
`docs/11-aegis-cli.md`). A future Go rewrite (v1.0.0) removes this shared
file entirely; duplicating the docker-compose/Dockerfile/templates here
just to avoid it sooner isn't worth it.

## How a client actually gets the CLI

- **First install, nothing on the machine yet**: `aegis-cli`'s own
  `install.sh` (`curl | bash`, or `AEGIS_CLI_VERSION=vX.Y.Z` pinned) —
  resolves the latest release, verifies its cosign bundle, extracts flat into
  `~/bin`. See this repo's root `install.sh` and
  `docs/11-aegis-cli.md` §2.0 in aegis-workstation.
- **Every later update**: `aegis update`'s own step 2 downloads the latest
  (or pinned) aegis-cli release directly from this repo's GitHub Releases —
  see `_fetch_cli_release` / `_client_install_launcher` in
  aegis-workstation's `templates/workstation/bin/aegis`.

Both paths verify the SAME way: `cosign verify-blob --bundle` against a
certificate identity matching `github.com/vangen-group/aegis-cli`.

## Versioning

Independent since this migration — there is no "aegis-workstation vX.Y
includes aegis-cli vA.B" table to keep, because nothing is baked in at build
time. A machine's installed `aegis` version and its workstation's product
version are each whatever `aegis update` happened to fetch last, for their
own repo. `aegis version` always reports the actually-installed CLI, which
is the only version that matters for that question — checking the relationship
means running `aegis version` on the machine in question, not reading a table
here, since by design nothing pins the two together ahead of time.

Release cadence here is automated by
[release-please](https://github.com/googleapis/release-please) — see
"Release Process" in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Making changes

Do not hand-edit `bin/`/`config/license-keys.json` in this repo — the next
`sync-launcher.yml` run overwrites them from aegis-workstation and silently
drops the edit. Make the change there instead:

```bash
cd aegis-workstation

# Edit the launcher
vim templates/workstation/bin/aegis

# Run its real test suite (compose/Dockerfile-backed)
node --test test/*.test.js

# Commit and push to main
git add templates/workstation/bin/aegis
git commit -m "fix(workstation): improve update UX"
git push
```

Then bring it here — either wait for the daily sync, or trigger it now:

```bash
gh workflow run sync-launcher.yml --repo vangen-group/aegis-cli
```

If it finds a diff, it commits `fix(sync): ...` to `master`, which
release-please turns into a release PR the same way any other `fix:` would.
Files outside `bin/`/`config/license-keys.json` (this repo's own
`install.sh`, CI/release workflows, docs, `CONTRIBUTING.md`) are genuinely
this repo's own and are edited here directly, same as always.

Merging the release-please PR tags, creates the GitHub Release, and
triggers `.github/workflows/release.yml` to build, sign, and publish the
release assets. No separate aegis-workstation step is involved at all — the
next `aegis update` anywhere picks it up on its own.

## Troubleshooting

### "My change isn't showing up after `aegis update`"

1. **Verify the release actually published**: `gh release view vX.Y.Z` in
   this repo (or check the Actions tab for `.github/workflows/release.yml`).
2. **Check what the client resolved**: `aegis update` logs the exact tag it
   downloaded and verified — compare against the release you expect.
3. **Pin it explicitly while debugging**: `AEGIS_CLI_VERSION=vX.Y.Z aegis
   update` skips "latest" resolution entirely.

### Rolling back a bad release

There is no sync step to revert in aegis-workstation. Either:

- Publish a new, fixed release (preferred — forward fix, the normal path), or
- Have affected machines pin the previous known-good tag with
  `AEGIS_CLI_VERSION=vX.Y.Z aegis update` until the fix ships.

## Future: Go rewrite (v1.0.0)

When aegis-cli is rewritten in Go, this relationship does not change — only
what `install.sh`/`aegis update` download and verify does (a compiled binary
release asset instead of the bash script tarball). v1.0.0 is expected to
accept all v0.x flags; see [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the
contribution and release process.

## Links

- **aegis-cli repo**: https://github.com/vangen-group/aegis-cli
- **aegis-workstation**: https://github.com/vangen-group/aegis-workstation
- **CLI usage**: `../docs/QUICK_REFERENCE.md`
