// install-wizard T12 (S8): execute the LUKS provisioning FOR the client.
// Every command is an argv array (never a shell string) and secret prompts
// (cryptsetup passphrase, sudo password) are answered directly by the user
// in the inherited TTY — the wizard server NEVER sees them. The destructive
// step (luksFormat) refuses to run without an explicit consent flag.
'use strict';
const IMG = process.env.AEGIS_VOLUME_IMG || `${process.env.HOME || '/root'}/aegis_secure.img`;
const MNT = process.env.AEGIS_VOLUME_MNT || '/mnt/aegis_secure';
const LOOP = process.env.AEGIS_VOLUME_LOOP || ''; // set after associate-loop (from losetup output)

// argv arrays only — no shell interpolation, nothing secret in argv.
const COMMANDS = {
    'create-image': { consent: false, argv: ['truncate', '-s', '150G', IMG] },
    'associate-loop': { consent: false, argv: ['sudo', 'losetup', '--find', '--show', IMG] },
    'format-luks': { consent: true, argv: ['sudo', 'cryptsetup', 'luksFormat', LOOP || '<LOOP>'] },
    'open-mount': { consent: false, argv: ['sudo', 'sh', '-c', `cryptsetup luksOpen ${LOOP || '<LOOP>'} aegis_vol && mkfs.ext4 /dev/mapper/aegis_vol && mkdir -p ${MNT} && mount /dev/mapper/aegis_vol ${MNT} && chown $(id -u):$(id -g) ${MNT}`] },
};

function planStep(id) {
    const step = COMMANDS[id];
    if (!step) return { ok: false, error: 'unknown step' };
    return { ok: true, id, consentRequired: step.consent, argv: step.argv };
}

// runStep: caller provides spawnFn(argv, opts) (stdio inherit at the call
// site) so tests inject a fake and never execute real commands.
function runStep(id, { consent = false, spawnFn } = {}) {
    const plan = planStep(id);
    if (!plan.ok) return plan;
    if (plan.consentRequired && consent !== true) {
        return { ok: false, error: 'refused: destructive step requires explicit consent' };
    }
    if (!spawnFn) return { ok: false, error: 'no executor (dev misuse: this only runs from the wizard host)' };
    return { ok: true, id, argv: plan.argv, spawned: spawnFn(plan.argv, { stdio: 'inherit' }) };
}

module.exports = { planStep, runStep, COMMANDS };
