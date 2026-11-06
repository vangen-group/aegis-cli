'use strict';
// The sync workflow tags a patch release after it commits a launcher change.
// The version arithmetic lives in scripts/next-release-tag.sh so it can be
// tested here instead of only on a real workflow run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'next-release-tag.sh');

const run = (arg) => spawnSync('sh', [SCRIPT, ...(arg === undefined ? [] : [arg])], { encoding: 'utf8' });

test('bumps the patch component', () => {
    assert.equal(run('v0.6.5').stdout.trim(), 'v0.6.6');
    assert.equal(run('v1.0.0').stdout.trim(), 'v1.0.1');
    assert.equal(run('v12.34.99').stdout.trim(), 'v12.34.100');
});

test('no previous tag prints nothing and succeeds (the human picks the first one)', () => {
    const r = run('');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '');
});

test('a malformed tag is refused, never silently bumped', () => {
    for (const bad of ['nope', 'v1.2', 'v1.2.3.4', '1.2.3', 'v1.2.x']) {
        const r = run(bad);
        assert.notEqual(r.status, 0, `${bad} must be refused`);
        assert.match(r.stderr, /not a vX\.Y\.Z tag/);
    }
});
