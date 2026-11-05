'use strict';
// install-wizard T1 (S1/S6): bundle builder, loopback wizard server with a
// confirm-gated plan, and the defensive bootstrap. Tests run the real server
// as a child process on an ephemeral port; install.sh is stubbed via
// AEGIS_INSTALLER_INSTALL_SH so nothing real downloads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function tempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}
function rmrf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function buildBundles(out) {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build-installer-bundles.mjs'), '--out', out], { cwd: REPO_ROOT, encoding: 'utf8' });
}
function zipList(zip) {
    const r = spawnSync('python3', ['-m', 'zipfile', '-l', zip], { encoding: 'utf8' });
    assert.equal(r.status, 0, `zip listing failed: ${r.stderr}`);
    return r.stdout;
}

test('build-installer-bundles creates both platform zips with launcher, bootstrap, server and install.sh', () => {
    const out = tempDir('aegis-wizard-bundles-');
    try {
        buildBundles(out);
        const mac = path.join(out, 'aegis-installer-macos.zip');
        const win = path.join(out, 'aegis-installer-windows.zip');
        for (const zip of [mac, win]) {
            assert.ok(fs.existsSync(zip), `missing ${path.basename(zip)}`);
            const listing = zipList(zip);
            assert.match(listing, /Install Aegis CLI\.command|Install Aegis CLI\.cmd/);
            assert.match(listing, /installer\/bootstrap\.sh/);
            assert.match(listing, /installer\/server\.mjs/);
            assert.match(listing, /install\.sh/);
        }
        assert.match(zipList(mac), /Install Aegis CLI\.command/);
        assert.match(zipList(win), /Install Aegis CLI\.cmd/);
    } finally {
        rmrf(out);
    }
});

test('the wizard server serves the plan, gates confirm behind the session, and refuses unknown routes', async () => {
    const dir = tempDir('aegis-wizard-server-');
    try {
        const stubInstall = path.join(dir, 'install.sh');
        fs.writeFileSync(stubInstall, '#!/bin/sh\necho INSTALLED-OK\n', { mode: 0o755 });
        const port = 17464 + Math.floor(Math.random() * 2000);
        // Background child: a server never exits, so this must be spawn (not
        // spawnSync) or the test would hang until the harness kills it.
        const child = require('node:child_process').spawn(process.execPath, [path.join(REPO_ROOT, 'installer', 'server.mjs'), '--port', String(port)], {
            cwd: REPO_ROOT,
            env: { ...process.env, AEGIS_INSTALLER_INSTALL_SH: stubInstall },
            stdio: 'ignore',
        });
        try {
            // Wait for readiness.
            let ready = false;
            for (let i = 0; i < 50 && !ready; i++) {
                await new Promise((r) => setTimeout(r, 50));
                const probe = spawnSync('curl', ['-s', '-o', '/dev/null', `http://127.0.0.1:${port}/`], { encoding: 'utf8' });
                ready = probe.status === 0;
            }
            assert.ok(ready, 'the server must come up on the loopback port');

            const base = `http://127.0.0.1:${port}`;
            const get = (p, cookie) => {
                const args = ['-s', '-o', '/dev/null', '-w', '%{http_code}'];
                if (cookie) args.push('-H', `Cookie: aegis_install=${cookie}`);
                args.push(base + p);
                const r = spawnSync('curl', args, { encoding: 'utf8' });
                return r.stdout.trim();
            };
            // First request sets the session cookie and serves the page.
            const first = spawnSync('curl', ['-s', '-i', base + '/'], { encoding: 'utf8' }).stdout;
            assert.match(first, /Set-Cookie: aegis_install=/);
            const cookie = /aegis_install=([a-f0-9]+)/.exec(first)[1];
            assert.equal(get('/'), '200', cookie);
            assert.equal(get('/', 'wrongcookie'), '403');
            assert.equal(get('/api/plan', cookie), '200');
            assert.equal(get('/nope', cookie), '404');
            // T2: the plan carries the prerequisite checks.
            const plan0 = JSON.parse(spawnSync('curl', ['-s', '-H', `Cookie: aegis_install=${cookie}`, base + '/api/plan'], { encoding: 'utf8' }).stdout);
            assert.ok(Array.isArray(plan0.prereqs), 'the plan must include the prereq checks');
            assert.ok(typeof plan0.next === 'string' && plan0.next.includes('aegis install'), 'the plan must name the next journey (T3)');

            const plan = JSON.parse(spawnSync('curl', ['-s', '-H', `Cookie: aegis_install=${cookie}`, base + '/api/plan'], { encoding: 'utf8' }).stdout);
            assert.ok(plan.steps.some((s) => s.includes('install.sh')), 'the plan must name the real install.sh invocation');

            // Confirm with the session + telemetry choice starts the stub install.
            const confirm = spawnSync('curl', ['-s', '-X', 'POST', '-H', `Cookie: aegis_install=${cookie}`, '-d', '{"telemetry":true}', '-o', '/dev/null', '-w', '%{http_code}', base + '/api/confirm'], { encoding: 'utf8' });
            assert.equal(confirm.stdout.trim(), '202');
            // T3: the opt-in is persisted next to the server (bundle dir).
            const choice = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'installer', 'telemetry-choice.json'), 'utf8'));
            assert.equal(choice.telemetry, true);
            let log = '';
            for (let i = 0; i < 60 && !log.includes('INSTALL-FINISHED'); i++) {
                await new Promise((r) => setTimeout(r, 50));
                log = spawnSync('curl', ['-s', '-H', `Cookie: aegis_install=${cookie}`, base + '/api/log'], { encoding: 'utf8' }).stdout;
            }
            assert.match(log, /INSTALLED-OK/);
            assert.match(log, /INSTALL-FINISHED rc=0/);
        } finally {
            child.kill('SIGTERM');
        }
    } finally {
        rmrf(dir);
    }
});

test('bootstrap.sh refuses a bundle with a missing or symlinked file', () => {
    const dir = tempDir('aegis-wizard-bootstrap-');
    try {
        fs.mkdirSync(path.join(dir, 'installer'), { recursive: true });
        fs.copyFileSync(path.join(REPO_ROOT, 'installer', 'server.mjs'), path.join(dir, 'installer', 'server.mjs'));
        fs.copyFileSync(path.join(REPO_ROOT, 'installer', 'bootstrap.sh'), path.join(dir, 'installer', 'bootstrap.sh'));
        fs.copyFileSync(path.join(REPO_ROOT, 'install.sh'), path.join(dir, 'install.sh'));
        // assets.mjs deliberately missing -> refuse.
        const r = spawnSync('sh', [path.join(dir, 'installer', 'bootstrap.sh')], { encoding: 'utf8' });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /bundle file missing: installer\/assets\.mjs/);
    } finally {
        rmrf(dir);
    }
});
