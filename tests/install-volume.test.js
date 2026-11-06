'use strict';
// install-wizard T4: LUKS volume states are detected (never toggled) and
// provisioning steps are verified READ-ONLY. The passphrase never appears
// anywhere in this module.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { volumeState, verifyStep, PROVISIONING } = require('../installer/volume.cjs');

test('the three volume states are detected from read-only probes (S3)', () => {
    const missing = volumeState({ runner: (c, a) => (c === 'test' && a[1] === '-f' ? { status: 1, stdout: '', stderr: '' } : { status: 1, stdout: '', stderr: '' }) });
    assert.equal(missing.state, 'missing');
    const mounted = volumeState({ runner: (c, a) => (c === 'mountpoint' ? { status: 0, stdout: '', stderr: '' } : c === 'test' ? { status: 0, stdout: '1', stderr: '' } : { status: 0, stdout: '/dev/loop0: [1]:x\n', stderr: '' }) });
    assert.equal(mounted.state, 'mounted');
    const sealed = volumeState({ runner: (c, a) => (c === 'mountpoint' ? { status: 1, stdout: '', stderr: '' } : c === 'test' ? { status: 0, stdout: '1', stderr: '' } : { status: 0, stdout: '/dev/loop0: [1]:x\n', stderr: '' }) });
    assert.equal(sealed.state, 'sealed');
});

test('verifyStep is read-only: no luksFormat, no luksOpen, no mount (S3/S6)', () => {
    for (const id of PROVISIONING().map((p) => p.id)) {
        const calls = [];
        verifyStep(id, { runner: (c, a) => { calls.push(c + ' ' + a.join(' ')); return { status: 0, stdout: '/dev/loop0\n', stderr: '' }; } });
        for (const call of calls) {
            assert.ok(!/luksFormat|luksOpen|mkfs|mount(?!point)/.test(call), `verify of ${id} must not run destructive commands: ${call}`);
        }
    }
    assert.equal(verifyStep('nope').ok, false);
});

test('format-luks verification fails closed when cryptsetup isLuks says no', () => {
    const r = verifyStep('format-luks', { runner: (c, a) => (a[0] === 'cryptsetup' ? { status: 1, stdout: '', stderr: 'not a LUKS device' } : { status: 0, stdout: '/dev/loop0\n', stderr: '' }) });
    assert.equal(r.ok, false);
});

test('the provisioning guide is bilingual and names the passphrase rule', () => {
    const items = PROVISIONING();
    assert.equal(items.length, 5);
    for (const p of items) {
        assert.ok(p.es && p.en);
        assert.ok(p.es.length > 10 && p.en.length > 10);
    }
    assert.match(items[2].es, /frase de paso/);
    assert.match(items[2].es, /DESTRUCTIVO/);
});

test('S8 supersedes the dev-only gate: EVERYONE gets the provisioning list (the wizard provisions for the client)', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'installer', 'server.mjs'), 'utf8');
    assert.ok(!src.includes('AEGIS_INSTALLER_DEV === "1"'), 'the dev-only gate must be gone');
    assert.match(src, /provisioning: PROVISIONING\(\).map/, 'the provisioning list ships to every wizard run');
});

test('every volume state reports whether it is a test volume', () => {
    process.env.AEGIS_INSTALLER_TEST_VOLUME = '1';
    try {
        // image present, not mounted, no loop association → sealed at rest
        const runner = (cmd, args) => ({ status: cmd === 'test' ? 0 : cmd === 'mountpoint' ? 1 : 0, stdout: '' });
        const v = volumeState({ runner });
        assert.equal(v.state, 'sealed');
        assert.equal(v.isTest, true);
    } finally { delete process.env.AEGIS_INSTALLER_TEST_VOLUME; }
});

test('the delete-test-volume button is offered only in test mode, in every end state', () => {
    const JS = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'installer', 'assets.mjs'), 'utf8');
    const calls = (JS.match(/offerCleanup\(/g) || []).length;
    assert.ok(calls >= 4, `defined + offered when mounted, sealed, after success and after failure (got ${calls})`);
    assert.match(JS, /const offerCleanup=\(\)=>\{if\(!v\.isTest\)return;/, 'never outside test mode');
});
