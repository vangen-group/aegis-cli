#!/usr/bin/env bash
#
# install.sh — standalone installer for the Aegis CLI.
#
# Downloads the latest (or a pinned) signed release from GitHub, verifies it
# with cosign BEFORE extracting anything, and installs it flat into
# ~/bin (or $AEGIS_CLI_INSTALL_DIR). Fails closed: a verification failure
# means nothing gets written.
#
#   curl -fsSL https://raw.githubusercontent.com/vangen-group/aegis-cli/master/install.sh | bash
#
# Env vars:
#   AEGIS_CLI_VERSION       Pin to an exact tag (e.g. v0.2.5). Default: latest.
#   AEGIS_CLI_INSTALL_DIR   Where to extract. Default: $HOME/bin.
#
# cosign is pinned to v3.1.3 on purpose — the SAME version bin/aegis itself
# uses to verify the workstation image (AEGIS_COSIGN_IMAGE). A
# signer/verifier version mismatch is exactly the "no signatures found"
# incident aegis-workstation hit with its editor-v1 image on 2026-10-27;
# this installer does not repeat it.
set -euo pipefail

REPO="vangen-group/aegis-cli"
COSIGN_VERSION="v3.1.3"

log() { printf 'aegis-cli install: %s\n' "$*" >&2; }
die() { printf 'aegis-cli install: ERROR: %s\n' "$*" >&2; exit 1; }

# --- 1. Resolve platform (for the cosign binary only — the CLI itself is a
#        portable bash/node script, no per-platform build needed). ----------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
    Linux) cosign_os=linux ;;
    Darwin) cosign_os=darwin ;;
    *) die "unsupported OS: $os (this installer supports Linux and macOS; on Windows, use Git Bash inside WSL, or run this from inside the Aegis Workstation container)" ;;
esac
case "$arch" in
    x86_64|amd64) cosign_arch=amd64 ;;
    arm64|aarch64) cosign_arch=arm64 ;;
    *) die "unsupported architecture: $arch" ;;
esac

# Pinned per-platform cosign-<os>-<arch> binary checksums, from cosign
# v3.1.3's own published cosign_checksums.txt (verified against that file
# directly, not assumed).
cosign_sha256=""
case "${cosign_os}-${cosign_arch}" in
    linux-amd64) cosign_sha256="4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71" ;;
    linux-arm64) cosign_sha256="c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a" ;;
    darwin-amd64) cosign_sha256="2347488e5d5b25336644024dfeca5601b190e91197a71a917bda44744aff106c" ;;
    darwin-arm64) cosign_sha256="5cf948c2f4dfe59687bdd0b8523709067383e03982cc543475c8a7dc70e92a76" ;;
    *) die "no pinned cosign checksum for ${cosign_os}-${cosign_arch}" ;;
esac

WORK="$(mktemp -d)" || die "mktemp failed"
trap 'rm -rf "${WORK}"' EXIT

# --- 2. Get (or verify) a local cosign. Reuse one already on PATH only if
#        its version matches exactly — never trust an unpinned cosign to
#        verify the very first thing this machine installs. -----------------
cosign_bin=""
if command -v cosign >/dev/null 2>&1 && [[ "$(cosign version 2>/dev/null | sed -n 's/^GitVersion:[[:space:]]*//p')" == "${COSIGN_VERSION#v}" ]]; then
    cosign_bin="$(command -v cosign)"
    log "using cosign ${COSIGN_VERSION} already on PATH"
else
    log "downloading cosign ${COSIGN_VERSION} (${cosign_os}-${cosign_arch}, checksum-verified)"
    curl -fsSL --output "${WORK}/cosign" \
        "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-${cosign_os}-${cosign_arch}" \
        || die "could not download cosign"
    echo "${cosign_sha256}  ${WORK}/cosign" | sha256sum --check --strict --status \
        || die "cosign checksum did not match the pinned value — refusing to continue"
    chmod +x "${WORK}/cosign"
    cosign_bin="${WORK}/cosign"
fi

# --- 3. Resolve the release tag. ---------------------------------------------
tag="${AEGIS_CLI_VERSION:-}"
if [[ -z "$tag" ]]; then
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    [[ -n "$tag" ]] || die "could not resolve the latest release tag"
fi
log "installing ${tag}"

# --- 4. Download the tarball + its cosign bundle. ---------------------------
base_url="https://github.com/${REPO}/releases/download/${tag}"
curl -fsSL --output "${WORK}/aegis-cli.tar.gz" "${base_url}/aegis-cli.tar.gz" \
    || die "could not download aegis-cli.tar.gz for ${tag}"
curl -fsSL --output "${WORK}/aegis-cli.tar.gz.cosign.bundle" "${base_url}/aegis-cli.tar.gz.cosign.bundle" \
    || die "could not download the signature bundle for ${tag}"

# --- 5. Verify BEFORE extracting anything. Fail closed. ---------------------
log "verifying signature"
"${cosign_bin}" verify-blob \
    --bundle "${WORK}/aegis-cli.tar.gz.cosign.bundle" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    --certificate-identity-regexp "^https://github.com/${REPO}/" \
    "${WORK}/aegis-cli.tar.gz" \
    || die "signature verification FAILED — this ${tag} tarball was not signed by a run of github.com/${REPO}. Nothing was installed."
log "signature verified — signed by a run of github.com/${REPO}"

# --- 6. Extract (flat archive -> install dir) and make aegis executable. ----
install_dir="${AEGIS_CLI_INSTALL_DIR:-${HOME}/bin}"
mkdir -p "${install_dir}"
tar -xzf "${WORK}/aegis-cli.tar.gz" -C "${install_dir}"
chmod +x "${install_dir}/aegis"

log "installed ${tag} to ${install_dir}"
case ":${PATH}:" in
    *":${install_dir}:"*) ;;
    *) log "NOTE: ${install_dir} is not on your PATH yet — add it in your shell profile (~/.bashrc, ~/.zshrc)" ;;
esac
log "next: ${install_dir}/aegis account activate <license-id>"
