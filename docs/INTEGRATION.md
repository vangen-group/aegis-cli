# Integration with Aegis Workstation

Aegis CLI is the **authoritative source and distribution channel** for the
`aegis` launcher. Since the cli-standalone-distribution migration
(2026-10-29/30), aegis-workstation does not bundle, sync, or carry a copy of
it at all — it is a fully independent, pull-based relationship:

```
aegis-cli                                  aegis-workstation
├─ Source of truth for the launcher        ├─ Owns the docker-compose config,
├─ Own signed releases (cosign keyless)    │  the dev image, the bundle of
├─ Own release-please version cadence      │  CONFIGURATION (never the CLI)
└─ install.sh: first-time install          └─ `aegis update` downloads the
                                               latest aegis-cli release itself
                                               (verify, then install) — it
                                               never reads a bundled copy
```

There is no webhook, no sync script, and no step where aegis-workstation's
CI pulls this repo's code in. The two repos release on their own schedules;
the only coupling is at runtime, inside the already-running `aegis` binary.

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

```bash
cd aegis-cli

# Edit the CLI
vim bin/aegis

# Test locally
bash tests/update-uiux.test.sh

# Verify syntax
bash -n bin/aegis

# Commit with Conventional Commits — release-please reads this
git add bin/aegis
git commit -m "feat: improve update UX"
git push
```

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
