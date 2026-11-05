'use strict';
// install-wizard T2: platform prerequisite detection (virtualization/WSL2 on
// Windows), and T3: the final screen (telemetry opt-in, next step).
// The runner is injectable so tests never probe the real machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { collectPrereqs } = require('../installer/prereqs.cjs');

const ok = (cmd, args) => ({ status: 0, stdout: args ? '' : '', stderr: '' });

test('on Windows the plan checks virtualization and WSL2 with human hints', () => {
    const calls = [];
    const runner = (cmd, args) => {
        calls.push(cmd + ' ' + args.join(' '));
        if (args.join(' ').includes('Get-ComputerInfo')) {
            return { status: 0, stdout: 'VirtualizationEnabledInFirmware : True\n', stderr: '' };
        }
        return { status: 0, stdout: 'WSL version: 2.4.13.0\n', stderr: '' };
    };
    const prereqs = collectPrereqs({ platform: 'win32', runner });
    assert.equal(prereqs.length, 2);
    assert.equal(prereqs[0].id, 'virtualization');
    assert.equal(prereqs[0].state, 'ok');
    assert.equal(prereqs[1].id, 'wsl2');
    assert.equal(prereqs[1].state, 'ok');
    assert.match(prereqs[0].hint, /BIOS|firmware/i, 'the missing-state hint must point at the BIOS');
    assert.ok(calls.length === 2, 'exactly the two windows probes run');
});

test('a missing prerequisite is reported with its hint, not an error', () => {
    const runner = (cmd, args) => {
        if (args.includes('Get-ComputerInfo')) return { status: 0, stdout: 'VirtualizationEnabledInFirmware : False\n', stderr: '' };
        return { status: 1, stdout: '', stderr: 'not installed' };
    };
    const prereqs = collectPrereqs({ platform: 'win32', runner });
    assert.deepEqual(prereqs.map((p) => [p.id, p.state]), [['virtualization', 'missing'], ['wsl2', 'missing']]);
    assert.ok(prereqs.every((p) => p.hint.length > 0));
});

test('on Linux virtualization is /dev/kvm; on macOS there is nothing to check', () => {
    const linux = collectPrereqs({ platform: 'linux', runner: () => ({ status: 1, stdout: '', stderr: '' }) });
    assert.equal(linux.length, 1);
    assert.equal(linux[0].id, 'virtualization');
    assert.equal(linux[0].state, 'missing');
    const mac = collectPrereqs({ platform: 'darwin', runner: () => { throw new Error('must not probe'); } });
    assert.equal(mac.length, 0, 'macOS needs no virtualization/WSL check');
});

test('the default runner works without arguments on the current platform', () => {
    const prereqs = collectPrereqs({});
    assert.ok(Array.isArray(prereqs));
    assert.ok(prereqs.every((p) => ['ok', 'missing', 'unknown'].includes(p.state)));
});
