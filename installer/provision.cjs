// install-wizard T12 (S8): execute the LUKS provisioning FOR the client.
// Every command is an argv array (never a shell string) and secret prompts
// (cryptsetup passphrase, sudo password) are answered directly by the user
// in the inherited TTY — the wizard server NEVER sees them. The destructive
// step (luksFormat) refuses to run without an explicit consent flag.
'use strict';
// Test-volume mode (T13): distinct names so tests/provisioning never touch
// real volumes. Cleanup (delete-test) refuses any path without "test".
const isTest = () => process.env.AEGIS_INSTALLER_TEST_VOLUME === '1';
const paths = () => ({
    img: process.env.AEGIS_VOLUME_IMG || `${process.env.HOME || '/root'}/${isTest() ? 'aegis_secure_test.img' : 'aegis_secure.img'}`,
    mnt: process.env.AEGIS_VOLUME_MNT || (isTest() ? '/mnt/aegis_secure_test' : '/mnt/aegis_secure'),
    mapper: isTest() ? 'aegis_vol_test' : 'aegis_vol',
});

const commandsFor = () => {
    const { img, mnt, mapper } = paths();
    return {
        'create-image': { consent: false, argv: ['truncate', '-s', '150G', img] },
        'associate-loop': { consent: false, argv: ['sudo', 'losetup', '--find', '--show', img] },
        'format-luks': { consent: true, argv: ['sudo', 'cryptsetup', 'luksFormat', process.env.AEGIS_VOLUME_LOOP || '<LOOP>'] },
        'open-mount': { consent: false, argv: ['sudo', 'sh', '-c', `cryptsetup luksOpen ${process.env.AEGIS_VOLUME_LOOP || '<LOOP>'} ${mapper} && mkfs.ext4 /dev/mapper/${mapper} && mkdir -p ${mnt} && mount /dev/mapper/${mapper} ${mnt} && chown $(id -u):$(id -g) ${mnt}`] },
    };
};

// Cleanup: delete the TEST volume only. Every path must contain 'test' —
// this can never touch a real volume.
function cleanupTestVolume({ spawnFn } = {}) {
    if (!isTest()) return { ok: false, error: 'cleanup refused: not in test-volume mode' };
    const { img, mnt, mapper } = paths();
    for (const p of [img, mnt]) {
        if (!/test/i.test(p)) return { ok: false, error: `cleanup refused: ${p} is not a test path` };
    }
    if (!spawnFn) return { ok: false, error: 'no executor' };
    const argv = ['sudo', 'sh', '-c',
        `mountpoint -q ${mnt} && umount ${mnt}; [ -e /dev/mapper/${mapper} ] && cryptsetup luksClose ${mapper}; losetup -j ${img} --output NAME --noheadings | xargs -r sudo losetup -d; rm -f ${img}; echo test volume removed`];
    return { ok: true, spawned: spawnFn(argv, { stdio: 'inherit' }) };
}

function planStep(id) {
    const step = commandsFor()[id];
    if (!step) return { ok: false, error: 'unknown step' };
    return { ok: true, id, consentRequired: step.consent, argv: step.argv };
}

function runStep(id, { consent = false, spawnFn } = {}) {
    const plan = planStep(id);
    if (!plan.ok) return plan;
    if (plan.consentRequired && consent !== true) {
        return { ok: false, error: 'refused: destructive step requires explicit consent' };
    }
    if (!spawnFn) return { ok: false, error: 'no executor (dev misuse: this only runs from the wizard host)' };
    return { ok: true, id, argv: plan.argv, spawned: spawnFn(plan.argv, { stdio: 'inherit' }) };
}

module.exports = { planStep, runStep, commandsFor, cleanupTestVolume, isTest, paths };
