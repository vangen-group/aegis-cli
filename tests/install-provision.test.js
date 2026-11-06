'use strict';
// install-wizard T12 (S8): provisioning executor — consent-gated, argv-only,
// and the wizard server never sees the passphrase (TTY answers directly).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planStep, runStep, commandsFor } = require('../installer/provision.cjs');

test('every command is an argv array — no shell strings, nothing secret in argv', () => {
    for (const [id, cmd] of Object.entries(commandsFor())) {
        assert.ok(Array.isArray(cmd.argv), `${id} must be an argv array`);
        for (const arg of cmd.argv) {
            assert.ok(typeof arg === 'string', `${id} args must be strings`);
            assert.ok(!/\b(passphrase|password)\b/i.test(arg), `${id} must not carry secret words in argv`);
        }
    }
});

test('the destructive step refuses to run without explicit consent', () => {
    const r = runStep('format-luks', { spawnFn: () => { throw new Error('must not spawn'); } });
    assert.equal(r.ok, false);
    assert.match(r.error, /consent/);
    assert.equal(planStep('format-luks').consentRequired, true);
    for (const id of ['create-image', 'associate-loop', 'open-mount']) {
        assert.equal(planStep(id).consentRequired, false, `${id} is not destructive`);
    }
});

test('runStep executes through the injected spawn fn with stdio inherit', () => {
    const calls = [];
    const r = runStep('create-image', { spawnFn: (argv, opts) => { calls.push({ argv, opts }); return { pid: 1 }; } });
    assert.equal(r.ok, true);
    assert.deepEqual(calls[0].opts, { stdio: 'inherit' }, 'the TTY must be inherited so cryptsetup/sudo prompt the user directly');
    assert.equal(calls[0].argv[0], 'truncate');
    assert.equal(runStep('nope', { spawnFn: () => ({}) }).ok, false);
    assert.equal(runStep('create-image', {}).ok, false, 'no executor, no run (misuse guard)');
});

test('cleanup refuses any path without "test" — a real volume can never be deleted (T13)', () => {
    const { cleanupTestVolume } = require('../installer/provision.cjs');
    delete process.env.AEGIS_INSTALLER_TEST_VOLUME;
    assert.equal(cleanupTestVolume({ spawnFn: () => { throw new Error('must not spawn'); } }).ok, false, 'not in test mode');
    process.env.AEGIS_INSTALLER_TEST_VOLUME = '1';
    process.env.AEGIS_VOLUME_IMG = '/home/x/aegis_secure.img';
    assert.match(cleanupTestVolume({ spawnFn: () => { throw new Error('must not spawn'); } }).error, /not a test path/);
    process.env.AEGIS_VOLUME_IMG = '/home/x/aegis_secure_test.img';
    process.env.AEGIS_VOLUME_MNT = '/mnt/aegis_secure_test';
    const r = cleanupTestVolume({ spawnFn: (argv) => ({ argv }) });
    assert.equal(r.ok, true);
    assert.ok(r.spawned.argv.join(' ').includes('aegis_secure_test.img'), 'the rm targets the test image');
    delete process.env.AEGIS_INSTALLER_TEST_VOLUME;
    delete process.env.AEGIS_VOLUME_IMG;
    delete process.env.AEGIS_VOLUME_MNT;
});

// provision-all runs on a REAL pseudo-terminal (util-linux `script`) with
// stubbed root tools: the console dialog is what the user actually sees.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { provisionAllScript } = require('../installer/provision.cjs');
const HAS_SCRIPT = spawnSync('script', ['--version']).status === 0;

function sandbox() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-prov-'));
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const stub = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    // Every stub records its argv; cryptsetup also records the key it got on stdin.
    stub('losetup', `echo "losetup $*" >> "${dir}/calls"; [ -e "${dir}/no-loop" ] && exit 1; [ "$1" = --find ] && echo /dev/loop9; exit 0`);
    stub('cryptsetup', `echo "cryptsetup $*" >> "${dir}/calls"; cat > "${dir}/key-$2"`);
    for (const n of ['mkfs.ext4', 'mount', 'chown']) stub(n, `echo "${n} $*" >> "${dir}/calls"`);
    // Real sudo (use_pty) runs a command with piped stdout in the BACKGROUND
    // of its pty: any terminal access freezes it. setsid reproduces that —
    // the command gets NO controlling terminal, so touching it fails loudly.
    stub('sudo', `[ "$1" = -n ] && shift; [ -e "${dir}/sudo-expired" ] && exit 1; exec setsid -w "$@"`);
    return { dir, img: path.join(dir, 'aegis_secure_test.img'), mnt: path.join(dir, 'mnt_test'), bin };
}

// Answers each console prompt only once it is ON SCREEN (like a person).
function runOnTty(box, { consent = true, answers = [] } = {}) {
    process.env.AEGIS_INSTALLER_TEST_VOLUME = '1';
    process.env.AEGIS_VOLUME_IMG = box.img;
    process.env.AEGIS_VOLUME_MNT = box.mnt;
    const file = path.join(box.dir, 'provision.sh');
    fs.writeFileSync(file, provisionAllScript({ consent, lang: 'es' }));
    const child = spawn('script', ['-qec', `sh ${file} 3> ${box.dir}/markers`, '/dev/null'], {
        env: { ...process.env, PATH: `${box.bin}:${process.env.PATH}` },
    });
    let screen = '', seen = 0;
    const queue = [...answers];
    child.stdout.on('data', (d) => {
        screen += d;
        const prompts = (screen.match(/(Frase de paso|Repetila): +/g) || []).length;
        while (seen < prompts && queue.length) { seen++; child.stdin.write(queue.shift() + '\n'); }
    });
    // A dialog that never asks (or never ends) fails fast instead of hanging.
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    return new Promise((resolve) => child.on('close', (code) => {
        clearTimeout(timer);
        const read = (f) => (fs.existsSync(path.join(box.dir, f)) ? fs.readFileSync(path.join(box.dir, f), 'utf8') : '');
        resolve({ code, screen, markers: read('markers'), calls: read('calls'), read });
    }));
}

const GOOD = 'correct horse battery';
const clean = (box) => { fs.rmSync(box.dir, { recursive: true, force: true }); for (const k of ['AEGIS_INSTALLER_TEST_VOLUME', 'AEGIS_VOLUME_IMG', 'AEGIS_VOLUME_MNT']) delete process.env[k]; };

test('console dialog: visible prompts, hidden passphrase, retry on short/mismatch, key via stdin only', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    const box = sandbox();
    try {
        const r = await runOnTty(box, { answers: ['corta', GOOD, 'otra cosa distinta', GOOD, GOOD] });
        assert.equal(r.code, 0, r.screen);
        assert.match(r.screen, /Volumen seguro/);
        assert.match(r.screen, /Muy corta/);
        assert.match(r.screen, /No coinciden/);
        assert.match(r.screen, /Frase confirmada/);
        assert.match(r.screen, /cifrado y montado/);
        assert.ok(!r.screen.includes(GOOD), 'the passphrase is never echoed on the console');
        assert.ok(r.screen.includes('*'.repeat(GOOD.length)), 'each typed character shows as *');
        assert.ok(!/YES|yes/.test(r.screen), 'no YES question');
        assert.match(r.calls, /cryptsetup luksFormat --batch-mode --key-file=- \/dev\/loop9/);
        assert.match(r.calls, /cryptsetup luksOpen --key-file=- \/dev\/loop9 aegis_vol_test/);
        assert.equal(r.read('key---batch-mode'), GOOD, 'luksFormat gets the exact passphrase on stdin');
        assert.equal(r.read('key---key-file=-'), GOOD, 'luksOpen gets the same passphrase: typed once, confirmed once');
        assert.ok(!r.calls.includes(GOOD), 'the passphrase never appears in any argv');
        assert.match(r.markers, /\[await\] passphrase\n\[await\] done/);
        assert.match(r.markers, /\[step\] finished open-mount/);
        assert.ok(!r.markers.includes(GOOD), 'nothing secret reaches the piped log');
        assert.ok(fs.existsSync(box.img));
    } finally { clean(box); }
});

test('giving up on the passphrase touches nothing: Retry starts clean', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    const box = sandbox();
    try {
        const r = await runOnTty(box, { answers: [GOOD, 'x'.repeat(12), GOOD, 'y'.repeat(12), GOOD, 'z'.repeat(12)] });
        assert.equal(r.code, 4);
        assert.match(r.screen, /Demasiados intentos/);
        assert.match(r.markers, /\[fail\] passphrase/);
        assert.ok(!r.calls.includes('luksFormat'), 'nothing was formatted');
        assert.ok(!r.calls.includes('losetup'), 'giving up happens before any root work');
        assert.ok(!fs.existsSync(box.img), 'no image is created');
    } finally { clean(box); }
});

test('an existing image is never touched; no consent formats nothing', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    let box = sandbox();
    try {
        fs.writeFileSync(box.img, 'previous volume');
        const r = await runOnTty(box);
        assert.equal(r.code, 5);
        assert.match(r.markers, /\[fail\] exists/);
        assert.equal(fs.readFileSync(box.img, 'utf8'), 'previous volume');
        assert.equal(r.calls, '', 'no root tool ran');
    } finally { clean(box); }
    box = sandbox();
    try {
        const r = await runOnTty(box, { consent: false });
        assert.equal(r.code, 3);
        assert.ok(!r.calls.includes('cryptsetup'));
        assert.ok(!fs.existsSync(box.img), 'rolled back');
    } finally { clean(box); }
});

test('a root failure rolls back and tells the user on the console', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    const box = sandbox();
    try {
        fs.writeFileSync(path.join(box.dir, 'no-loop'), '');
        const r = await runOnTty(box, { answers: [GOOD, GOOD] });
        assert.equal(r.code, 6);
        assert.match(r.markers, /\[fail\] loop/);
        assert.match(r.screen, /No se pudo crear el volumen/);
        assert.match(r.markers, /\[fail\] loop/);
        assert.ok(!r.calls.includes('cryptsetup'));
        assert.ok(!fs.existsSync(box.img), 'rolled back');
    } finally { clean(box); }
});

test('an expired sudo session fails fast, before asking for the passphrase', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    const box = sandbox();
    try {
        fs.writeFileSync(path.join(box.dir, 'sudo-expired'), '');
        const r = await runOnTty(box);
        assert.equal(r.code, 7);
        assert.match(r.markers, /\[fail\] sudo/);
        assert.match(r.screen, /sudo no está activa/);
        assert.ok(!r.screen.includes('Frase de paso'));
    } finally { clean(box); }
});

test('masked input: ñ is one *, Backspace erases, Ctrl+C cancels cleanly', { skip: !HAS_SCRIPT && 'needs util-linux script' }, async () => {
    let box = sandbox();
    try {
        // 'contraseñaa' + Backspace + '1234' → 'contraseña1234' (14 characters)
        // An arrow key in the middle is ignored without losing the rest.
        const typed = 'contraseñaa\u007f12\u001b[D34';
        const r = await runOnTty(box, { answers: [typed, 'contraseña1234'] });
        assert.equal(r.code, 0, r.screen);
        assert.equal(r.read('key---batch-mode'), 'contraseña1234', 'Backspace removed one whole character');
        assert.ok(r.screen.includes('*'.repeat(11)), 'ñ shows as a single *');
        assert.ok(!r.screen.includes('contraseña'), 'never echoed');
    } finally { clean(box); }
    box = sandbox();
    try {
        const r = await runOnTty(box, { answers: ['\u0003'] });
        assert.equal(r.code, 130);
        assert.match(r.markers, /\[fail\] cancelled/);
        assert.match(r.screen, /Cancelado/);
        assert.equal(r.calls, '', 'nothing ran as root');
    } finally { clean(box); }
});

test('per-step luksFormat keeps passphrase verification (-y) alongside --batch-mode', () => {
    const argv = commandsFor()['format-luks'].argv;
    assert.ok(argv.includes('--batch-mode') && argv.includes('-y'));
});

test('wizard e2e: banner only while the console waits, a failed run explains itself and Retry works', { skip: !HAS_SCRIPT && 'needs util-linux script', timeout: 60000 }, async () => {
    const box = sandbox();
    const port = 19464 + Math.floor(Math.random() * 2000);
    // Run a copy of the wizard: confirming the install writes
    // telemetry-choice.json next to the server, never into the repo.
    fs.cpSync(path.join(__dirname, '..', 'installer'), path.join(box.dir, 'installer'), { recursive: true });
    const server = path.join(box.dir, 'installer', 'server.mjs');
    const installStub = path.join(box.dir, 'install.sh');
    // The first install attempt fails; Retry must be able to run it again.
    fs.writeFileSync(installStub, `if [ ! -e "${box.dir}/install-failed-once" ]; then touch "${box.dir}/install-failed-once"; echo INSTALL-BROKE; exit 9; fi\necho INSTALLED-OK\n`);
    const child = spawn('script', ['-qec', `"${process.execPath}" "${server}" --port ${port}`, '/dev/null'], {
        env: { ...process.env, PATH: `${box.bin}:${process.env.PATH}`, AEGIS_INSTALLER_TEST_VOLUME: '1', AEGIS_VOLUME_IMG: box.img, AEGIS_VOLUME_MNT: box.mnt, AEGIS_INSTALLER_INSTALL_SH: installStub },
    });
    let screen = '', seen = 0, answers = [];
    const pump = () => {
        const prompts = (screen.match(/(Frase de paso|Repetila): +/g) || []).length;
        while (seen < prompts && answers.length) { seen++; child.stdin.write(answers.shift() + '\n'); }
    };
    child.stdout.on('data', (d) => { screen += d; pump(); });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const base = `http://127.0.0.1:${port}`;
    try {
        let cookie;
        for (let i = 0; i < 100 && !cookie; i++) {
            await sleep(50);
            cookie = await fetch(base + '/').then((r) => /aegis_install=([a-f0-9]+)/.exec(r.headers.get('set-cookie') || '')?.[1]).catch(() => undefined);
        }
        assert.ok(cookie, 'server up');
        const H = { Cookie: `aegis_install=${cookie}` };
        const progress = () => fetch(base + '/api/volume/progress', { headers: H }).then((r) => r.json());
        const until = async (pred) => { for (let i = 0; i < 200; i++) { const p = await progress(); if (pred(p)) return p; await sleep(50); } throw new Error('timeout: ' + JSON.stringify(await progress())); };
        const start = () => fetch(base + '/api/volume/provision-all', { method: 'POST', headers: H, body: JSON.stringify({ consent: true }) }).then((r) => r.status);

        // Run 1: the user never confirms → failed, explained, rolled back.
        assert.equal(await start(), 202);
        const waiting = await until((p) => p.consolePrompt);
        assert.match(waiting.consolePrompt, /consola te está esperando/);
        answers = [GOOD, 'x'.repeat(12), GOOD, 'y'.repeat(12), GOOD, 'z'.repeat(12)];
        pump();
        const failed = await until((p) => !p.running && p.error);
        assert.match(failed.error, /no coincidieron/);
        assert.equal(failed.consolePrompt, null, 'no banner once the console stopped waiting');
        assert.ok(failed.steps.every((s) => s.status === 'pending'), 'the dialog gave up before any root step');
        assert.ok(!fs.existsSync(box.img));

        // Retry in place: accepted (not 409) and finishes 4/4.
        answers = [GOOD, GOOD];
        assert.equal(await start(), 202);
        const done = await until((p) => !p.running && p.done === 4);
        assert.equal(done.error, null);
        assert.equal(done.consolePrompt, null);
        assert.equal(await start(), 409, 'a finished run is not restarted');

        // Stage 3 → 4: a provisioned volume must not block the install
        // (the volume and install logs used to share one buffer → 409).
        const confirm = () => fetch(base + '/api/confirm', { method: 'POST', headers: H, body: JSON.stringify({ telemetry: false }) }).then((r) => r.status);
        assert.equal(await confirm(), 202, 'the install starts after the volume');
        let installLog = '';
        for (let i = 0; i < 100 && !/INSTALL-FINISHED rc=9/.test(installLog); i++) {
            await sleep(50);
            installLog = await fetch(base + '/api/log', { headers: H }).then((r) => r.text());
        }
        assert.match(installLog, /INSTALL-FINISHED rc=9/);
        // Retry after a failed install (used to be 409 forever).
        assert.equal(await confirm(), 202, 'a failed install can be retried');
        installLog = '';
        for (let i = 0; i < 100 && !/INSTALL-FINISHED rc=0/.test(installLog); i++) {
            await sleep(50);
            installLog = await fetch(base + '/api/log', { headers: H }).then((r) => r.text());
        }
        assert.match(installLog, /INSTALLED-OK/);
        assert.match(installLog, /INSTALL-FINISHED rc=0/);
        assert.equal((await fetch(base + '/api/confirm', { method: 'POST', headers: H, body: '{}' })).status, 409, 'the install starts once');

        // Delete the test volume: the answer arrives only once it is gone,
        // so the page can reload straight into "missing".
        const del = await fetch(base + '/api/volume/cleanup', { method: 'POST', headers: H });
        assert.equal(del.status, 200);
        assert.ok(!fs.existsSync(box.img), 'removed before the response');
    } finally {
        child.kill('SIGKILL');
        clean(box);
    }
});
