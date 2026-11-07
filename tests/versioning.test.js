'use strict';
// release-please and the sync-launcher tags count the SAME version series.
// Before this, sync-launcher tagged v0.6.x while release-please's manifest
// stayed at 0.2.17, so its standing release PR proposed v0.3.0 — a release
// that would have looked like a downgrade from v0.6.13.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SYNC = fs.readFileSync(path.join(ROOT, '.github/workflows/sync-launcher.yml'), 'utf8');

function manifestVersion(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, '.release-please-manifest.json'), 'utf8'))['.'];
}

function versionFile(dir) {
    const m = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').match(/^(\S+) # x-release-please-version$/m);
    assert.ok(m, 'VERSION keeps the release-please marker');
    return m[1];
}

test('the manifest and VERSION agree', () => {
    assert.equal(versionFile(ROOT), manifestVersion(ROOT));
});

// Runs the block of the sync commit step that moves the manifest and VERSION,
// exactly as written in the workflow, against a scratch copy.
test('a sync moves the manifest and VERSION to the tag it is about to cut', () => {
    const block = SYNC.match(/^( *)if \[ -n "\$NEXT" \]; then\n[\s\S]*?^\1fi$/m);
    assert.ok(block, 'the manifest/VERSION update block is missing from sync-launcher.yml');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-versioning-'));
    try {
        fs.copyFileSync(path.join(ROOT, '.release-please-manifest.json'), path.join(dir, '.release-please-manifest.json'));
        fs.copyFileSync(path.join(ROOT, 'VERSION'), path.join(dir, 'VERSION'));
        const r = spawnSync('bash', ['-c', `set -euo pipefail\ngit() { :; }\nNEXT=v9.8.7\n${block[0]}`], { cwd: dir, encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        assert.equal(manifestVersion(dir), '9.8.7');
        assert.equal(versionFile(dir), '9.8.7');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the tag step cuts exactly the version the commit step wrote', () => {
    const tagStep = SYNC.slice(SYNC.indexOf('name: Tag a release when the launcher changed'));
    assert.match(tagStep, /NEXT="\$\{\{ steps\.changed\.outputs\.next \}\}"/);
    assert.doesNotMatch(tagStep, /next-release-tag\.sh/, 'no second, independent computation');
    assert.match(SYNC, /echo "next=\$\{NEXT\}" >> "\$GITHUB_OUTPUT"/);
});
