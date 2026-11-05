'use strict';
// install-wizard T12 (S8): provisioning executor — consent-gated, argv-only,
// and the wizard server never sees the passphrase (TTY answers directly).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planStep, runStep } = require('../installer/provision.cjs');

test('every command is an argv array — no shell strings, nothing secret in argv', () => {
    for (const [id, cmd] of Object.entries(require('../installer/provision.cjs').COMMANDS)) {
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
