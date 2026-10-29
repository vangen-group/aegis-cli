#!/usr/bin/env bash
#
# build-release-tarball.sh — assemble the CLI release tarball.
#
# Packs exactly the client CLI's files (bin/aegis + bin/aegis.cmd +
# bin/aegis.ps1 + the aegis-*.js helpers) into a .tar.gz, same files the
# install scripts (install.sh/install.ps1) extract on the user's machine.
#
# Deterministic by construction, same recipe as aegis-workstation's
# build-client-bundle.sh: the member list is sorted, every member gets a
# fixed mtime and uid/gid 0, and gzip runs with -n (no name/timestamp
# header). The same checkout therefore yields the same bytes and the same
# sha256, which is what gets signed.
#
# Usage: scripts/build-release-tarball.sh [output-path]
#   output-path  default: dist/aegis-cli.tar.gz
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-dist/aegis-cli.tar.gz}"

ENTRIES=(
    "bin/aegis"
    "bin/aegis.cmd"
    "bin/aegis.ps1"
    "bin/aegis-license.js"
    "bin/aegis-activate.js"
    "bin/aegis-license-api.js"
    "bin/aegis-telemetry.js"
)

for entry in "${ENTRIES[@]}"; do
    if [[ ! -f "${REPO_ROOT}/${entry}" ]]; then
        echo "error: release tarball entry is missing: ${entry}" >&2
        exit 1
    fi
done

mkdir -p "$(dirname "${OUT}")"

tar \
    --sort=name \
    --mtime='2026-01-01 00:00:00Z' \
    --owner=0 --group=0 --numeric-owner \
    -C "${REPO_ROOT}" \
    -cf - "${ENTRIES[@]}" \
    | gzip -n -9 > "${OUT}"

echo "build-release-tarball: wrote ${OUT} ($(sha256sum "${OUT}" | cut -d' ' -f1))"
