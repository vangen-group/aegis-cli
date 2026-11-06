// luks-integration T6 (spec: aegis-workstation/odd/tasks/luks-integration.md):
// provisioning leaves the runbook's two tools installed. docs/17 §5 documents
// ~/mount-aegis.sh and ~/umount-aegis.sh as "the two tools that live on the
// host", but nothing ever installed them — opening the vault meant five manual
// commands with a loop number to remember.
//
// Ownership: the container runs as root, so `id -u` inside a sudo context
// resolves to 0. The values written here come from the invoking process and
// the scripts also honour SUDO_UID/SUDO_GID, so any uid works — never a
// literal (the sibling repo's paneo found exactly that bug).
'use strict';
const { writeFileSync, chmodSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const MOUNT = (o) => `#!/bin/sh
# ~/mount-aegis.sh — open the Aegis secure volume (docs/17 §5).
# The passphrase is typed ONLY at the cryptsetup prompt: it never touches a
# file, an argument or a log.
set -eu
IMG='${o.img}'
MAPPER='${o.mapper}'
MNT='${o.mnt}'

[ -f "$IMG" ] || { echo "No existe $IMG — aprovisioná el volumen primero (aegis install / wizard)."; exit 1; }
if mountpoint -q "$MNT"; then echo "Ya montado en $MNT"; exit 0; fi

LOOP=$(sudo losetup -j "$IMG" --output NAME --noheadings 2>/dev/null | cut -d: -f1 | head -n1)
if [ -z "$LOOP" ]; then
    LOOP=$(sudo losetup --find --show "$IMG" | cut -d: -f1)
fi
trap 'sudo losetup -d "$LOOP" 2>/dev/null || true' ERR

sudo cryptsetup luksOpen "$LOOP" "$MAPPER"
sudo mkdir -p "$MNT"
sudo mount "/dev/mapper/$MAPPER" "$MNT"
sudo chown "\${SUDO_UID:-${o.uid}}:\${SUDO_GID:-${o.gid}}" "$MNT"
echo "Aegis secure volume abierto en $MNT ($LOOP -> /dev/mapper/$MAPPER)"
`;

const UMOUNT = (o) => `#!/bin/sh
# ~/umount-aegis.sh — seal the Aegis secure volume (docs/17 §5).
set -eu
IMG='${o.img}'
MAPPER='${o.mapper}'
MNT='${o.mnt}'

if mountpoint -q "$MNT"; then sudo umount "$MNT"; fi
if [ -e "/dev/mapper/$MAPPER" ]; then sudo cryptsetup luksClose "$MAPPER"; fi
LOOP=$(sudo losetup -j "$IMG" --output NAME --noheadings 2>/dev/null | cut -d: -f1 | head -n1)
[ -n "$LOOP" ] && sudo losetup -d "$LOOP" || true
echo "Aegis secure volume sellado."
`;

// writeVolumeHelpers → { ok, files:[...] } — never throws on a read-only home;
// the volume itself is already provisioned at that point.
function writeVolumeHelpers({ home, img, mnt, mapper, uid, gid } = {}) {
    if (!home) return { ok: false, error: 'no home dir' };
    const opts = { img, mnt, mapper, uid: uid ?? 0, gid: gid ?? 0 };
    const files = [
        [join(home, 'mount-aegis.sh'), MOUNT(opts)],
        [join(home, 'umount-aegis.sh'), UMOUNT(opts)],
    ];
    try {
        for (const [path, body] of files) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, body, { mode: 0o755 });
            chmodSync(path, 0o755);
        }
        return { ok: true, files: files.map(([p]) => p) };
    } catch (e) {
        return { ok: false, error: String(e.message || e) };
    }
}

module.exports = { writeVolumeHelpers, MOUNT, UMOUNT };
