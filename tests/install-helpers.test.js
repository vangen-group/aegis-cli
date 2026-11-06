'use strict';
// luks-integration T6: provisioning leaves the runbook's two tools installed.
// The ownership values must come from the INVOKING process — inside a sudo
// context `id -u` is 0, and a literal uid breaks every user but one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeVolumeHelpers } = require('../installer/helpers.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-helpers-'));
}

test('both helpers are written executable, with the resolved paths (T6)', () => {
    const home = tmp();
    try {
        const r = writeVolumeHelpers({
            home,
            img: '/home/x/aegis_secure.img',
            mnt: '/mnt/aegis_secure',
            mapper: 'aegis_vol',
            uid: 4242,
            gid: 4343,
        });
        assert.equal(r.ok, true, r.error);
        for (const name of ['mount-aegis.sh', 'umount-aegis.sh']) {
            const p = path.join(home, name);
            assert.ok(fs.existsSync(p), `missing ${name}`);
            const mode = fs.statSync(p).mode & 0o777;
            assert.equal(mode, 0o755, `${name} must be executable (got ${mode.toString(8)})`);
        }
        const mount = fs.readFileSync(path.join(home, 'mount-aegis.sh'), 'utf8');
        assert.match(mount, /\/home\/x\/aegis_secure\.img/);
        assert.match(mount, /\/mnt\/aegis_secure/);
        assert.match(mount, /aegis_vol/);
        assert.match(mount, /cryptsetup luksOpen/, 'the passphrase prompt is cryptsetup\'s own');
        const umount = fs.readFileSync(path.join(home, 'umount-aegis.sh'), 'utf8');
        assert.match(umount, /luksClose/);
        assert.match(umount, /aegis_vol/);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('ownership comes from the invoking process, with SUDO_UID as the escape hatch (never a literal)', () => {
    const home = tmp();
    try {
        writeVolumeHelpers({ home, img: '/i', mnt: '/m', mapper: 'aegis_vol', uid: 4242, gid: 4343 });
        const mount = fs.readFileSync(path.join(home, 'mount-aegis.sh'), 'utf8');
        assert.match(mount, /\$\{SUDO_UID:-4242\}:\$\{SUDO_GID:-4343\}/, 'must use the passed uid/gid with a SUDO_UID fallback');
        assert.ok(!/chown "\$\(id -u\)/.test(mount), 'id -u under sudo resolves to root — never use it for ownership');
        assert.ok(!/1000:1000/.test(mount), 'no hardcoded uid');
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('the provisioning path installs the helpers and never hardcodes an owner (structural)', () => {
    const server = fs.readFileSync(path.join(REPO_ROOT, 'installer', 'server.mjs'), 'utf8');
    assert.match(server, /writeVolumeHelpers\(/, 'provisioning must install the helpers');
    assert.match(server, /process\.getuid\(\)/, 'the uid must come from the invoking process');
    assert.ok(!/chown 1000:1000/.test(server), 'no hardcoded 1000:1000');
    const provision = fs.readFileSync(path.join(REPO_ROOT, 'installer', 'provision.cjs'), 'utf8');
    assert.ok(!/chown 1000:1000/.test(provision), 'no hardcoded 1000:1000 in the root script');
});

test('a read-only home is reported, not thrown', () => {
    const r = writeVolumeHelpers({ home: '/proc/nonexistent-home', img: '/i', mnt: '/m', mapper: 'aegis_vol', uid: 1, gid: 1 });
    assert.equal(r.ok, false);
    assert.ok(r.error);
});
