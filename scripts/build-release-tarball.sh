#!/usr/bin/env bash
#
# build-release-tarball.sh — assemble the CLI release tarball.
#
# Packs the client CLI's files (bin/aegis + bin/aegis.cmd + bin/aegis.ps1 +
# the aegis-*.js helpers) FLAT into a .tar.gz — same shape as
# aegis-workstation's build-client-cli.sh: every member at archive ROOT,
# no bin/ prefix inside the tarball, so `tar -xzf aegis-cli.tar.gz -C ~/bin`
# lands aegis straight at ~/bin/aegis, not ~/bin/bin/aegis. Also includes
# config/license-keys.json, renamed to aegis-license-keys.json at archive
# root: the launcher reads it from SCRIPT_DIR/aegis-license-keys.json as a
# fallback (bin/aegis line ~504) until `aegis install` lays down a real
# configuration tree with its own config/license-keys.json. Without it,
# `aegis account activate` on a fresh standalone install has no key to
# verify the license against.
#
# NOTE: these are the public verification keys. If aegis-workstation's
# copy (templates/workstation/config/license-keys.json) ever rotates, this
# copy must be updated too, or an activation signed under the new key
# fails to verify here — same "two places" class of bug as everything
# else this migration exists to collapse into one source of truth.
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

# archive-member-name:repo-source-path — the archive member name has NO
# directory prefix (archive is flat), even though the repo keeps these
# under bin/ and config/ like aegis-workstation does.
MEMBERS=(
    "aegis:bin/aegis"
    "aegis.cmd:bin/aegis.cmd"
    "aegis.ps1:bin/aegis.ps1"
    "aegis-license.js:bin/aegis-license.js"
    "aegis-activate.js:bin/aegis-activate.js"
    "aegis-license-api.js:bin/aegis-license-api.js"
    "aegis-secret-protect.js:bin/aegis-secret-protect.js"
    "aegis-telemetry.js:bin/aegis-telemetry.js"
    "aegis-license-keys.json:config/license-keys.json"
)

for pair in "${MEMBERS[@]}"; do
    src="${pair#*:}"
    if [[ ! -f "${REPO_ROOT}/${src}" ]]; then
        echo "error: release tarball source is missing: ${src}" >&2
        exit 1
    fi
done

mkdir -p "$(dirname "${OUT}")"
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

for pair in "${MEMBERS[@]}"; do
    name="${pair%%:*}" src="${pair#*:}"
    mkdir -p "${STAGE}/$(dirname "${name}")"
    cp "${REPO_ROOT}/${src}" "${STAGE}/${name}"
done

tar \
    --sort=name \
    --mtime='2026-01-01 00:00:00Z' \
    --owner=0 --group=0 --numeric-owner \
    -C "${STAGE}" \
    -cf - . \
    | gzip -n -9 > "${OUT}"

echo "build-release-tarball: wrote ${OUT} ($(sha256sum "${OUT}" | cut -d' ' -f1))"
