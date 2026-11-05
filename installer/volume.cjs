// install-wizard T4: the LUKS secure volume (docs/17 of aegis-workstation).
// Three states — missing (no image), sealed (image + loop, not mounted),
// mounted — are DETECTED, never toggled, by the installer. The passphrase
// lives only with the human: provisioning steps guide, verification is
// strictly read-only (no luksOpen, no mount, nothing destructive).
'use strict';
const { execFileSync } = require('node:child_process');

const IMG = process.env.AEGIS_VOLUME_IMG || `${process.env.HOME || '/root'}/aegis_secure.img`;
const MNT = process.env.AEGIS_VOLUME_MNT || '/mnt/aegis_secure';

const defaultRunner = (cmd, args) => {
    try {
        return { status: 0, stdout: execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000 }), stderr: '' };
    } catch (e) {
        return { status: e.status ?? 1, stdout: e.stdout || '', stderr: e.stderr || String(e.message || e) };
    }
};

// → {state:'missing'|'sealed'|'mounted'|'unknown', img, mnt}
function volumeState({ runner } = {}) {
    const run = runner || defaultRunner;
    try {
        if (run('test', ['-f', IMG]).status !== 0) {
            return { state: 'missing', img: IMG, mnt: MNT };
        }
        if (run('mountpoint', ['-q', MNT]).status === 0) {
            return { state: 'mounted', img: IMG, mnt: MNT };
        }
        if (run('sudo', ['losetup', '-j', IMG]).status === 0 && run('sudo', ['losetup', '-j', IMG]).stdout.trim() !== '') {
            return { state: 'sealed', img: IMG, mnt: MNT };
        }
        // Image exists but no loop association: provisioned, sealed at rest.
        return { state: 'sealed', img: IMG, mnt: MNT };
    } catch {
        return { state: 'unknown', img: IMG, mnt: MNT };
    }
}

// Read-only verification per provisioning step (docs/17 §4). NEVER runs
// cryptsetup luksFormat/luksOpen or mount — only observes results.
function verifyStep(id, { runner } = {}) {
    const run = runner || defaultRunner;
    const checks = {
        'create-image': () => run('test', ['-f', IMG]).status === 0 && Number(run('stat', ['-c', '%s', IMG]).stdout || 0) > 0,
        'associate-loop': () => run('sudo', ['losetup', '-j', IMG]).status === 0 && run('sudo', ['losetup', '-j', IMG]).stdout.trim() !== '',
        'format-luks': () => {
            const q = run('sudo', ['losetup', '-j', IMG, '--output', 'NAME', '--noheadings']);
            if (q.status !== 0) return false;
            const loop = (q.stdout || '').split('\n')[0].trim();
            if (!loop) return false;
            const isLuks = run('sudo', ['cryptsetup', 'isLuks', loop]);
            return isLuks.status === 0;
        },
        'open-mount': () => run('mountpoint', ['-q', MNT]).status === 0,
        'validate': () => run('test', ['-w', MNT]).status === 0,
    };
    const fn = checks[id];
    if (!fn) return { ok: false, error: 'unknown step' };
    try {
        return { ok: fn() === true };
    } catch (e) {
        return { ok: false, error: String(e.message || e) };
    }
}

// The provisioning guide (docs/17 §4), bilingual. The human runs these in
// their terminal; the passphrase is typed ONLY inside cryptsetup's prompt.
const PROVISIONING = [
    { id: 'create-image', es: 'Crear la imagen sparse (no ocupa el disco completo): truncate -s 150G ~/aegis_secure.img', en: 'Create the sparse image (does not take full disk): truncate -s 150G ~/aegis_secure.img' },
    { id: 'associate-loop', es: 'Asociar un dispositivo loop: sudo losetup --find --show ~/aegis_secure.img (anotá /dev/loopN)', en: 'Associate a loop device: sudo losetup --find --show ~/aegis_secure.img (note /dev/loopN)' },
    { id: 'format-luks', es: 'Formatear LUKS — ⚠️ DESTRUCTIVO: sudo cryptsetup luksFormat /dev/loopN (la frase de paso se escribe SOLO en el prompt de cryptsetup; sin ella los datos son irrecuperables por diseño)', en: 'Format LUKS — ⚠️ DESTRUCTIVE: sudo cryptsetup luksFormat /dev/loopN (type the passphrase ONLY at the cryptsetup prompt; without it data is unrecoverable by design)' },
    { id: 'open-mount', es: 'Abrir, formatear ext4 y montar: sudo cryptsetup luksOpen /dev/loopN aegis_vol && sudo mkfs.ext4 /dev/mapper/aegis_vol && sudo mkdir -p /mnt/aegis_secure && sudo mount /dev/mapper/aegis_vol /mnt/aegis_secure', en: 'Open, format ext4 and mount: sudo cryptsetup luksOpen /dev/loopN aegis_vol && sudo mkfs.ext4 /dev/mapper/aegis_vol && sudo mkdir -p /mnt/aegis_secure && sudo mount /dev/mapper/aegis_vol /mnt/aegis_secure' },
    { id: 'validate', es: 'Validar el primer arranque (docs/17 §4.5) y verificar cifrado en reposo (§4.6, opcional)', en: 'Validate the first boot (docs/17 §4.5) and optionally audit at-rest encryption (§4.6)' },
];

module.exports = { volumeState, verifyStep, PROVISIONING };
