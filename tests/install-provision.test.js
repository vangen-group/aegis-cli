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
    assert.ok(r.spawned.argv[2].includes('aegis_secure_test.img'), 'the rm targets the test image');
    delete process.env.AEGIS_INSTALLER_TEST_VOLUME;
    delete process.env.AEGIS_VOLUME_IMG;
    delete process.env.AEGIS_VOLUME_MNT;
});
