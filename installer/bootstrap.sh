#!/bin/sh
# Double-click bootstrap (install-wizard T1). Runs from an extracted bundle,
# never from a remote pipe. Validates the bundle layout, then starts the
# loopback wizard server with the best node available.
set -eu
bundle=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
for f in installer/server.mjs installer/assets.mjs install.sh; do
    [ -f "$bundle/$f" ] || { echo "bootstrap: bundle file missing: $f" >&2; exit 1; }
    [ -L "$bundle/$f" ] && { echo "bootstrap: unsafe symlink in bundle: $f" >&2; exit 1; }
done
NODE_BIN="${AEGIS_INSTALLER_NODE:-}"
[ -z "$NODE_BIN" ] && NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "bootstrap: no node found — install Node.js, or set AEGIS_INSTALLER_NODE" >&2; exit 1; }
# Pre-authenticate sudo NOW, on a clean TTY, before any piped output can
# race with the password prompt (the owner's password failed twice because
# the provisioning log wrote to the same terminal while sudo was reading).
# The sudo timestamp then covers the whole provisioning run.
if command -v sudo >/dev/null 2>&1; then
    echo "One sudo password check (it covers the whole install):"
    sudo -v || echo "warning: continuing without sudo — volume provisioning will ask again"
    # Keep the timestamp fresh while the wizard runs (sudo expires in ~15min).
    ( while sleep 240; do sudo -n -v 2>/dev/null || break; done ) &
fi

echo "opening the Aegis CLI installer in your browser..."
exec "$NODE_BIN" "$bundle/installer/server.mjs" "$@"
