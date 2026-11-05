'use strict';
// install-wizard T10: install.sh logs an explicit [step] started/finished
// protocol; AEGIS_INSTALL_STEPS_ONLY=1 exercises the network-free steps and
// the server derives its progress model from the markers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

test('install.sh defines the step protocol and runs the network-free steps under AEGIS_INSTALL_STEPS_ONLY=1', () => {
    const r = spawnSync('bash', ['install.sh'], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, AEGIS_INSTALL_STEPS_ONLY: '1', AEGIS_CLI_VERSION: 'test' } });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    for (const line of [
        '[step] started resolve-platform',
        '[step] finished resolve-platform',
        '[step] started resolve-release',
        '[step] finished resolve-release',
    ]) assert.ok(r.stderr.includes(line), `missing marker: ${line}`);
    assert.ok(!r.stderr.includes('downloading cosign'), 'steps-only mode must not download anything');
});

test('the step protocol covers all six install steps in order', () => {
    const src = require('node:fs').readFileSync(path.join(REPO_ROOT, 'install.sh'), 'utf8');
    const main = src.slice(src.indexOf('main() {'));
    const calls = main.split('\n')
        .filter((line) => line.startsWith('    step_'))
        .map((line) => line.trim().replace('step_', '').replace(/_/g, '-'));
    assert.deepEqual(calls, ['resolve-platform', 'acquire-cosign', 'resolve-release', 'download', 'verify', 'extract-install']);
    for (const id of calls) {
        assert.ok(src.includes(`[step] started ${id}`), `missing started marker for ${id}`);
        assert.ok(src.includes(`[step] finished ${id}`), `missing finished marker for ${id}`);
    }
});
