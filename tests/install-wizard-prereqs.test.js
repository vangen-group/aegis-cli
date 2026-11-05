'use strict';
// install-wizard T2: platform prerequisite detection (virtualization/WSL2 on
// Windows), and T3: the final screen (telemetry opt-in, next step).
// The runner is injectable so tests never probe the real machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { collectPrereqs } = require('../installer/prereqs.cjs');

const ok = (cmd, args) => ({ status: 0, stdout: args ? '' : '', stderr: '' });

test('on Windows the plan checks virtualization and WSL2 plus Docker Desktop (T6), with human hints', () => {
    const calls = [];
    const runner = (cmd, args) => {
        calls.push(cmd + ' ' + args.join(' '));
        if (args.join(' ').includes('Get-ComputerInfo')) {
            return { status: 0, stdout: 'VirtualizationEnabledInFirmware : True\n', stderr: '' };
        }
        if (cmd === 'docker') return { status: 0, stdout: 'Server Version: 27\n', stderr: '' };
        return { status: 0, stdout: 'WSL version: 2.4.13.0\n', stderr: '' };
    };
    const prereqs = collectPrereqs({ platform: 'win32', runner });
    assert.equal(prereqs.length, 3);
    assert.deepEqual(prereqs.map((p) => p.id), ['virtualization', 'wsl2', 'docker']);
    assert.equal(prereqs[2].id, 'docker');
    assert.equal(prereqs[2].state, 'ok');
    assert.match(prereqs[2].hint, /Docker Desktop/i, 'the docker hint must name Docker Desktop');
    assert.ok(calls.some((c) => c.startsWith('docker info')), 'the docker probe must be docker info');
});

test('a missing prerequisite is reported with its hint, not an error', () => {
    const runner = (cmd, args) => {
        if (args.join(' ').includes('Get-ComputerInfo')) return { status: 0, stdout: 'VirtualizationEnabledInFirmware : False\n', stderr: '' };
        if (cmd === 'docker') return { status: 1, stdout: '', stderr: 'command not found' };
        return { status: 1, stdout: '', stderr: 'not installed' };
    };
    const prereqs = collectPrereqs({ platform: 'win32', runner });
    assert.deepEqual(prereqs.map((p) => [p.id, p.state]), [['virtualization', 'missing'], ['wsl2', 'missing'], ['docker', 'missing']]);
    assert.ok(prereqs.every((p) => p.hint.length > 0));
});

test('on Linux virtualization is /dev/kvm plus docker; on macOS only docker (T6)', () => {
    const linux = collectPrereqs({ platform: 'linux', runner: (cmd) => (cmd === 'docker' ? { status: 0, stdout: 'ok', stderr: '' } : { status: 1, stdout: '', stderr: '' }) });
    assert.deepEqual(linux.map((p) => [p.id, p.state]), [['virtualization', 'missing'], ['docker', 'ok']]);
    const mac = collectPrereqs({ platform: 'darwin', runner: (cmd) => (cmd === 'docker' ? { status: 1, stdout: '', stderr: 'command not found' } : { status: 0, stdout: '', stderr: '' }) });
    assert.equal(mac.length, 1, 'macOS still checks Docker Desktop');
    assert.deepEqual([mac[0].id, mac[0].state], ['docker', 'missing']);
});

test('the default runner works without arguments on the current platform', () => {
    const prereqs = collectPrereqs({});
    assert.ok(Array.isArray(prereqs));
    assert.ok(prereqs.every((p) => ['ok', 'missing', 'unknown'].includes(p.state)));
});
