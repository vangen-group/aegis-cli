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
    for (const id of PROVISIONING.map((p) => p.id)) {
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
    assert.equal(PROVISIONING.length, 5);
    for (const p of PROVISIONING) {
        assert.ok(p.es && p.en);
        assert.ok(p.es.length > 10 && p.en.length > 10);
    }
    assert.match(PROVISIONING[2].es, /frase de paso/);
    assert.match(PROVISIONING[2].es, /DESTRUCTIVO/);
});

test('S8 supersedes the dev-only gate: EVERYONE gets the provisioning list (the wizard provisions for the client)', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'installer', 'server.mjs'), 'utf8');
    assert.ok(!src.includes('AEGIS_INSTALLER_DEV === "1"'), 'the dev-only gate must be gone');
    assert.match(src, /provisioning: PROVISIONING.map/, 'the provisioning list ships to every wizard run');
});
