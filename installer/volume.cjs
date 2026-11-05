// install-wizard T4: the LUKS secure volume (docs/17 of aegis-workstation).
// Three states — missing (no image), sealed (image + loop, not mounted),
// mounted — are DETECTED, never toggled, by the installer. The passphrase
// lives only with the human: provisioning steps guide, verification is
// strictly read-only (no luksOpen, no mount, nothing destructive).
'use strict';
const { execFileSync } = require('node:child_process');

// T13: test-volume mode — completely different names so provisioning can be
// exercised without ever touching a real volume. Test paths MUST contain
// "test" (cleanup refuses otherwise).
const isTest = () => process.env.AEGIS_INSTALLER_TEST_VOLUME === '1';
const paths = () => ({
    img: process.env.AEGIS_VOLUME_IMG || `${process.env.HOME || '/root'}/${isTest() ? 'aegis_secure_test.img' : 'aegis_secure.img'}`,
    mnt: process.env.AEGIS_VOLUME_MNT || (isTest() ? '/mnt/aegis_secure_test' : '/mnt/aegis_secure'),
    mapper: isTest() ? 'aegis_vol_test' : 'aegis_vol',
    isTest: isTest(),
});

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
    const { img: IMG, mnt: MNT } = paths();
    try {
        if (run('test', ['-f', IMG]).status !== 0) {
            return { state: 'missing', img: IMG, mnt: MNT, isTest: paths().isTest };
        }
        if (run('mountpoint', ['-q', MNT]).status === 0) {
            return { state: 'mounted', img: IMG, mnt: MNT, isTest: paths().isTest };
        }
        if (run('sudo', ['losetup', '-j', IMG]).status === 0 && run('sudo', ['losetup', '-j', IMG]).stdout.trim() !== '') {
            return { state: 'sealed', img: IMG, mnt: MNT, isTest: paths().isTest };
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
    const { img: IMG, mnt: MNT } = paths();
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

const PROVISIONING = () => {
    const { img, mnt, mapper, isTest } = paths();
    const loop = isTest ? '/dev/loopN (de la imagen de prueba)' : '/dev/loopN';
    const size = isTest ? '64M (liviano, solo para probar)' : '150G';
    const base = [
        ['create-image', `Crear la imagen sparse (no ocupa el disco completo): truncate -s ${size} ${img}`, `Create the sparse image: truncate -s ${size} ${img}`],
        ['associate-loop', `Asociar un dispositivo loop: sudo losetup --find --show ${img} (anotá el /dev/loopN)`, `Associate a loop device: sudo losetup --find --show ${img} (note the /dev/loopN)`],
        ['format-luks', `Formatear LUKS — ⚠️ DESTRUCTIVO: sudo cryptsetup luksFormat ${loop} (la frase de paso se escribe SOLO en el prompt de cryptsetup; sin ella los datos son irrecuperables por diseño)`, `Format LUKS — ⚠️ DESTRUCTIVE: sudo cryptsetup luksFormat ${loop} (the passphrase is typed ONLY at the cryptsetup prompt; without it data is unrecoverable by design)`],
        ['open-mount', `Abrir, formatear ext4 y montar: sudo cryptsetup luksOpen ${loop} ${mapper} && sudo mkfs.ext4 /dev/mapper/${mapper} && sudo mkdir -p ${mnt} && sudo mount /dev/mapper/${mapper} ${mnt}`, `Open, format ext4 and mount: sudo cryptsetup luksOpen ${loop} ${mapper} && sudo mkfs.ext4 /dev/mapper/${mapper} && sudo mkdir -p ${mnt} && sudo mount /dev/mapper/${mapper} ${mnt}`],
        ['validate', 'Validar el primer arranque (docs/17 §4.5) y verificar cifrado en reposo (§4.6, opcional)', 'Validate the first boot (docs/17 §4.5) and optionally audit at-rest encryption (§4.6)'],
    ];
    return base.map(([id, es, en]) => ({ id, es, en }));
};
module.exports = { volumeState, verifyStep, PROVISIONING };
