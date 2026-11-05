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
        if (cmd === 'aegis') return { status: 1, stdout: '', stderr: '' };
        return { status: 0, stdout: 'WSL version: 2.4.13.0\n', stderr: '' };
    };
    const prereqs = collectPrereqs({ platform: 'win32', runner });
    assert.equal(prereqs.length, 4);
    assert.deepEqual(prereqs.map((p) => p.id), ['virtualization', 'wsl2', 'docker', 'aegis']);
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
    assert.deepEqual(prereqs.map((p) => [p.id, p.state]), [['virtualization', 'missing'], ['wsl2', 'missing'], ['docker', 'missing'], ['aegis', 'ok']]);
    assert.ok(prereqs.every((p) => p.hint.length > 0));
});

test('on Linux virtualization is /dev/kvm plus docker; on macOS only docker (T6)', () => {
    const linux = collectPrereqs({ platform: 'linux', runner: (cmd) => (cmd === 'docker' ? { status: 0, stdout: 'ok', stderr: '' } : { status: 1, stdout: '', stderr: '' }) });
    assert.deepEqual(linux.map((p) => [p.id, p.state]), [['virtualization', 'missing'], ['docker', 'ok'], ['aegis', 'ok']]);
    const mac = collectPrereqs({ platform: 'darwin', runner: () => ({ status: 1, stdout: '', stderr: 'command not found' }) });
    assert.equal(mac.length, 2, 'macOS checks Docker Desktop and the aegis presence');
    assert.deepEqual([mac[0].id, mac[0].state], ['docker', 'missing']);
    assert.deepEqual([mac[1].id, mac[1].state], ['aegis', 'ok']);
});

test('an existing aegis install is reported as non-blocking info with its version (T7)', () => {
    const prereqs = collectPrereqs({
        platform: 'darwin',
        lang: 'en',
        runner: (cmd, args) => (cmd === 'aegis' ? { status: 0, stdout: 'aegis 0.3.1\n', stderr: '' } : { status: 1, stdout: '', stderr: '' }),
    });
    const aegis = prereqs.find((p) => p.id === 'aegis');
    assert.ok(aegis, 'the aegis presence check must run on every platform');
    assert.equal(aegis.state, 'info');
    assert.match(aegis.label, /0\.3\.1/);
    assert.match(aegis.label, /launcher version, not the CLI release/, 'the label must clarify which version the probe reports');
    assert.match(aegis.label, /ships CLI /, 'the label must name the version this installer ships');
    assert.match(aegis.label, /updating in place/);
    // Not a blocker: absent aegis on a fresh machine is fine too.
    const fresh = collectPrereqs({ platform: 'darwin', lang: 'en', runner: () => ({ status: 1, stdout: '', stderr: '' }) });
    assert.equal(fresh.find((p) => p.id === 'aegis').state, 'ok');
    assert.match(fresh.find((p) => p.id === 'aegis').label, /not installed yet/);
});

test('the default runner works without arguments on the current platform', () => {
    const prereqs = collectPrereqs({});
    assert.ok(Array.isArray(prereqs));
    assert.ok(prereqs.every((p) => ['ok', 'missing', 'unknown'].includes(p.state)));
});

test('under windows-wsl virtualization is auto-ok (we ARE inside WSL2) and /dev/kvm is not demanded (L5)', () => {
    const prereqs = collectPrereqs({ platform: 'windows-wsl', lang: 'en', runner: (cmd) => (cmd === 'docker' ? { status: 0, stdout: 'ok', stderr: '' } : { status: 1, stdout: '', stderr: '' }) });
    assert.deepEqual(prereqs.map((p) => [p.id, p.state]), [['virtualization', 'ok'], ['docker', 'ok'], ['aegis', 'ok']]);
    assert.match(prereqs[0].label, /inside WSL2/);
    assert.ok(prereqs.every((p) => p.id !== 'kvm') && !JSON.stringify(prereqs).includes('/dev/kvm'), 'no KVM check under WSL2');
    // Without docker it still blocks (the real requirement).
    const noDocker = collectPrereqs({ platform: 'windows-wsl', runner: () => ({ status: 1, stdout: '', stderr: '' }) });
    assert.deepEqual(noDocker.map((p) => [p.id, p.state]), [['virtualization', 'ok'], ['docker', 'missing'], ['aegis', 'ok']]);
});

test('Spanish is the default language (owner decision): hints and aegis row come in Spanish', () => {
    const prereqs = collectPrereqs({ platform: 'windows-wsl', runner: (cmd) => (cmd === 'docker' ? { status: 0, stdout: 'ok', stderr: '' } : { status: 1, stdout: '', stderr: '' }) });
    assert.match(prereqs[0].label, /dentro de WSL2|estás corriendo dentro/i);
    const aegis = prereqs.find((p) => p.id === 'aegis');
    assert.match(aegis.label, /todavía no está instalado/);
    const fresh = collectPrereqs({ platform: 'darwin', runner: () => ({ status: 1, stdout: '', stderr: '' }) });
    assert.match(fresh.find((p) => p.id === 'aegis').label, /todavía no está instalado/);
});
