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
        // Test volumes are light (64M — mkfs on them is instant); production
        // keeps the docs/17 150G sparse image.
        'create-image': { consent: false, argv: ['truncate', '-s', isTest() ? '64M' : '150G', img] },
        'associate-loop': { consent: false, argv: ['sudo', 'losetup', '--find', '--show', img] },
        'format-luks': { consent: true, argv: ['sudo', 'cryptsetup', 'luksFormat', '--batch-mode', '-y', process.env.AEGIS_VOLUME_LOOP || '<LOOP>'] },
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

// Console passphrase dialog for provision-all — two processes, by design:
//  1. The DIALOG runs as the user (no sudo), spawned with the console as
//     stdin/stdout/stderr, so it is the terminal's foreground job and may
//     toggle echo and read. Progress markers go to fd 3 (a pipe the wizard
//     parses); the console only shows the dialog.
//  2. The ROOT script runs under `sudo -n` and NEVER touches the terminal:
//     with use_pty and a piped stdout, sudo starts the command in the
//     BACKGROUND of its pty (sudo src/exec_pty.c, CD_EXEC_BG), where any
//     stty/read on /dev/tty is stopped by SIGTTOU/SIGTTIN — that froze every
//     earlier attempt, cryptsetup's own prompts included.
// The passphrase (typed once + confirmation) travels dialog → root on a
// pipe and reaches cryptsetup through stdin (--key-file=-): never argv,
// never the wizard server. --batch-mode drops cryptsetup's YES question.
// (The per-step format-luks keeps cryptsetup's own prompt, so it adds -y:
// --batch-mode alone also switches passphrase verification off.)
const MIN_PASSPHRASE = 12;
// Interactive cryptsetup unlock reads at most 512 characters; a longer key
// fed through --key-file=- could never be typed back at mount time.
const MAX_PASSPHRASE = 512;
const CONSOLE_TEXT = {
    es: {
        title: 'Aegis · Volumen seguro',
        intro: `Elegí una frase de paso (mínimo ${MIN_PASSPHRASE} caracteres). No se muestra mientras escribís — es normal.`,
        warn: 'Guardala bien: sin ella, los datos del volumen NO se pueden recuperar.',
        ask: '  Frase de paso:   ',
        again: '  Repetila:        ',
        short: `  ✗ Muy corta: usá al menos ${MIN_PASSPHRASE} caracteres.`,
        long: `  ✗ Muy larga: usá como máximo ${MAX_PASSPHRASE} caracteres.`,
        mismatch: '  ✗ No coinciden. Probá de nuevo.',
        ok: '  ✓ Frase confirmada. Creando el volumen cifrado…',
        giveup: '  ✗ Demasiados intentos. Volvé al wizard y tocá "Reintentar".',
        sudo: '  ✗ Tu sesión de sudo no está activa. Cerrá el instalador y volvé a abrirlo.',
        failed: '  ✗ No se pudo crear el volumen. El motivo está en el wizard (navegador).',
        mounted: '  ✓ Volumen cifrado y montado. Ya podés volver al navegador.',
    },
    en: {
        title: 'Aegis · Secure volume',
        intro: `Choose a passphrase (at least ${MIN_PASSPHRASE} characters). Nothing shows as you type — that is expected.`,
        warn: 'Keep it safe: without it, the volume data CANNOT be recovered.',
        ask: '  Passphrase:      ',
        again: '  Repeat it:       ',
        short: `  ✗ Too short: use at least ${MIN_PASSPHRASE} characters.`,
        long: `  ✗ Too long: use at most ${MAX_PASSPHRASE} characters.`,
        mismatch: '  ✗ They do not match. Try again.',
        ok: '  ✓ Passphrase confirmed. Creating the encrypted volume…',
        giveup: '  ✗ Too many attempts. Go back to the wizard and press "Retry".',
        sudo: '  ✗ Your sudo session is not active. Close the installer and open it again.',
        failed: '  ✗ The volume could not be created. The reason is shown in the wizard (browser).',
        mounted: '  ✓ Volume encrypted and mounted. You can go back to the browser.',
    },
};
const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

// Root half: reads the passphrase from stdin, no terminal access at all.
// Markers go to stdout (the wizard pipe). $1 = owner uid:gid for the mount.
function rootScript() {
    const { img, mnt, mapper } = paths();
    return [
        'set -eu',
        `IMG=${shq(img)}; MAPPER=${shq(mapper)}; MNT=${shq(mnt)}`,
        'IFS= read -r PASS || true',
        // Rollback: a failed run BEFORE luksFormat succeeded removes what this
        // run created, so Retry starts clean (never touches a prior image).
        'LOOP=; FORMATTED=0',
        'rollback() { if [ "$FORMATTED" = 1 ]; then return 0; fi; if [ -n "$LOOP" ]; then losetup -d "$LOOP" 2>/dev/null || true; fi; rm -f "$IMG"; }',
        "trap 'rc=$?; if [ $rc -ne 0 ]; then rollback; fi' EXIT; trap 'exit 130' INT TERM",
        `[ -n "$PASS" ] || { echo '[fail] passphrase'; trap - EXIT; exit 4; }`,
        "echo '[step] started create-image'",
        `[ ! -e "$IMG" ] || { echo '[fail] exists'; trap - EXIT; exit 5; }`,
        `truncate -s ${isTest() ? '64M' : '150G'} "$IMG"`,
        "echo '[step] finished create-image'",
        "echo '[step] started associate-loop'",
        'LOOP=$(losetup --find --show "$IMG" | cut -d: -f1)',
        // The pipe hides a losetup failure: catch it explicitly.
        `[ -n "$LOOP" ] || { echo '[fail] loop'; exit 6; }`,
        "echo '[step] finished associate-loop'",
        'echo "LOOP=$LOOP"',
        "echo '[step] started format-luks'",
        'printf \'%s\' "$PASS" | cryptsetup luksFormat --batch-mode --key-file=- "$LOOP"',
        'FORMATTED=1',
        "echo '[step] finished format-luks'",
        "echo '[step] started open-mount'",
        'printf \'%s\' "$PASS" | cryptsetup luksOpen --key-file=- "$LOOP" "$MAPPER"',
        'PASS=',
        'mkfs.ext4 -q /dev/mapper/"$MAPPER"',
        'mkdir -p "$MNT"',
        'mount /dev/mapper/"$MAPPER" "$MNT"',
        'chown "$1" "$MNT" 2>/dev/null || true',
        "echo '[step] finished open-mount'",
    ].join('\n');
}

// User half (the dialog). Spawn with stdio [tty, tty, tty, pipe]: fd 3
// carries the markers. Fails fast — before asking anything — on missing
// consent, an existing image, or an expired sudo session.
function provisionAllScript({ consent = false, lang = 'es', attempts = 3 } = {}) {
    const { img } = paths();
    const t = CONSOLE_TEXT[lang] || CONSOLE_TEXT.es;
    return [
        'set -u',
        `IMG=${shq(img)}`,
        `ROOT=${shq(rootScript())}`,
        'say() { printf \'%s\\n\' "$1"; }',
        'mark() { printf \'%s\\n\' "$1" >&3; }',
        "trap 'stty echo 2>/dev/null' EXIT; trap 'exit 130' INT TERM",
        // read -s is not POSIX (dash): toggle echo instead.
        'secret() { stty -echo; printf \'%s\' "$1"; IFS= read -r REPLY || REPLY=; stty echo; printf \'\\n\'; }',
        consent ? 'true' : "mark '[fail] consent'; exit 3",
        `[ ! -e "$IMG" ] || { mark '[fail] exists'; exit 5; }`,
        `sudo -n true 2>/dev/null || { say ${shq(t.sudo)}; mark '[fail] sudo'; exit 7; }`,
        "mark '[await] passphrase'",
        `say ''; say ${shq('━━━ ' + t.title + ' ━━━')}; say ${shq(t.intro)}; say ${shq(t.warn)}; say ''`,
        'PASS=; n=0',
        `while [ $n -lt ${attempts} ]; do`,
        '  n=$((n+1))',
        `  secret ${shq(t.ask)}; P1=$REPLY`,
        `  if [ \${#P1} -lt ${MIN_PASSPHRASE} ]; then say ${shq(t.short)}; continue; fi`,
        `  if [ \${#P1} -gt ${MAX_PASSPHRASE} ]; then say ${shq(t.long)}; continue; fi`,
        `  secret ${shq(t.again)}; P2=$REPLY`,
        `  if [ "$P1" = "$P2" ]; then PASS=$P1; break; fi`,
        `  say ${shq(t.mismatch)}`,
        'done',
        'P1=; P2=',
        `[ -n "$PASS" ] || { say ${shq(t.giveup)}; mark '[fail] passphrase'; exit 4; }`,
        "mark '[await] done'",
        `say ${shq(t.ok)}`,
        // printf is a dash builtin: the passphrase never shows in ps argv.
        'printf \'%s\\n\' "$PASS" | sudo -n sh -c "$ROOT" aegis-root "$(id -u):$(id -g)" >&3 2>&3; rc=$?',
        'PASS=',
        `if [ $rc -eq 0 ]; then say ${shq(t.mounted)}; else say ${shq(t.failed)}; fi`,
        'exit $rc',
    ].join('\n');
}

module.exports = { planStep, runStep, commandsFor, cleanupTestVolume, isTest, paths, provisionAllScript, MIN_PASSPHRASE };
