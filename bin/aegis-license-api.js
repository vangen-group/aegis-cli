#!/usr/bin/env node
//
// aegis-license-api.js -- the licence lifecycle steps that need the network, for
// a machine that is already activated, used internally by bin/aegis's
// `aegis license renew|heartbeat|retire`. Not a public CLI: bin/aegis is the
// single source of truth for the user-facing commands.
//
// It is the sibling of aegis-activate.js. That one performs the anonymous first
// call and stores the device credential; this one spends it. Three routes, all
// device-authenticated, none of them carrying an identifier in the URL (the
// service reads licence and activation from the credential -- ActivationEndpoints):
//
//   renew     POST   /v1/activations/renew    -- re-signed licence file
//   heartbeat POST   /v1/activations/heartbeat -- marks this machine seen
//   retire    DELETE /v1/activations          -- frees the seat
//
// What this deliberately does NOT do:
//   - It never prints the device_secret, the Authorization header, or a response
//     body. Values reach the network from this process's memory only (SEC-24).
//   - renew never replaces the local licence with something this machine cannot
//     verify. The token the service hands back is checked against the same trust
//     list the launcher uses, through the same verifier, BEFORE the old file is
//     moved aside: a licence that fails verification leaves the working one
//     untouched and the command fails.
//   - retire does not keep the licence file. After the seat is released the
//     offline verifier would still report `status: valid` -- it checks a
//     signature, not the service's ledger -- so the local files are deleted
//     instead of sitting there saying something the service no longer agrees
//     with. Re-activating is `aegis license activate <id>`.
//
// Usage: node aegis-license-api.js <renew|heartbeat|retire> [--url <url>] [--yes]
//
//   --url   Service base URL (env AEGIS_LICENSE_API_URL). HTTPS unless loopback.
//   --yes   Required for retire: it deletes this machine's licence.
//
// Environment:
//   AEGIS_LICENSE_FILE           The licence token file (read by renew's backup,
//                                written by renew, deleted by retire).
//   AEGIS_DEVICE_CREDENTIAL_FILE The credential activation stored. Required.
//   AEGIS_LICENSE_KEYS_FILE      The trust list renew verifies against.
//
// Exit codes: 0 done, 1 refused or failed (nothing was overwritten), 2 bad usage.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const secretProtect = require('./aegis-secret-protect');

const DEFAULT_API_URL = 'https://aegis-workstation-production.up.railway.app';
const DEFAULT_LICENSE_FILE = path.join(os.homedir(), '.aegis', 'license');
const DEFAULT_CREDENTIAL_FILE = path.join(os.homedir(), '.aegis', 'device.json');
const VERBS = ['token', 'renew', 'heartbeat', 'retire'];

// Same bound as the activator: undici's fetch has no default timeout, and a
// service that accepts a connection and stalls must not hang this command.
const REQUEST_TIMEOUT_MS = 15000;

function die(message, code) {
    process.stderr.write('aegis-license-api: ' + message + '\n');
    process.exit(code === undefined ? 1 : code);
}

function usage(message) {
    if (message) process.stderr.write('aegis-license-api: ' + message + '\n');
    process.stderr.write('usage: aegis license <token|renew|heartbeat|retire> [--url <url>] [--yes]\n');
    process.exit(2);
}

function report(lines) {
    process.stdout.write(lines.join('\n') + '\n');
}

function abortAfter(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

// Only these response fields are ever surfaced. Extracting title/detail instead
// of echoing a body means a response that somehow carried a credential can never
// reach a log through an error path (SEC-24).
function serviceError(status, parsed) {
    const title = parsed && typeof parsed.title === 'string' ? parsed.title : null;
    const detail = parsed && typeof parsed.detail === 'string' ? parsed.detail : null;
    const parts = ['the service refused the request (' + status + ')'];
    if (title) parts.push(title);
    if (detail) parts.push(detail);
    return parts.join(': ');
}

async function call(url, method, authorization) {
    const guard = abortAfter(REQUEST_TIMEOUT_MS);
    let res, text;
    try {
        res = await fetch(url, {
            method,
            headers: authorization ? { authorization } : {},
            signal: guard.signal,
        });
        text = await res.text();
    } catch (e) {
        if (e && e.name === 'AbortError') throw new Error('timed out after ' + REQUEST_TIMEOUT_MS + ' ms');
        throw e;
    } finally {
        guard.dispose();
    }
    let parsed = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch (e) {
        // A non-JSON body is not something to echo; the caller reports status.
    }
    return { status: res.status, ok: res.ok, parsed };
}

// The credential aegis-activate.js wrote. Nothing here is printed, and the
// licence id has to be in the file: the header the service expects is
// <license>.<activation>.<secret>, and re-deriving it from the licence token
// would mean trusting an unverified payload to address an authenticated call.
function readCredential(file) {
    if (!fs.existsSync(file)) {
        die('this machine is not activated: no device credential at ' + file
            + ' (run: aegis license activate <license-id>)');
    }
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
        die('the credential file is unreadable: ' + file + ': ' + e.message);
    }
    const tagged = secretProtect.parse(raw.trim());
    let json;
    // Two cases retry protection, not just the legacy one: a PLAIN1 file
    // might have landed there because no real store was reachable on a
    // PAST run (confirmed happening in practice: a transient DPAPI bug meant
    // every device.json on an affected machine was stuck PLAIN1 forever,
    // since nothing ever re-attempted a stronger tier once one tag was
    // already recognized). Retrying costs nothing when the fallback is still
    // the only option -- protect() just returns PLAIN1 again.
    if (tagged) {
        try {
            json = secretProtect.unprotect(tagged.tag, tagged.blob);
        } catch (e) {
            die('could not unprotect the credential file: ' + file + ': ' + e.message);
        }
        if (tagged.tag === secretProtect.TAG_PLAIN) {
            try {
                const upgraded = secretProtect.protect(json);
                if (upgraded.tag !== secretProtect.TAG_PLAIN) {
                    writePrivate(file, secretProtect.serialize(upgraded.tag, upgraded.blob) + '\n');
                }
            } catch (e) {
                // Best effort: the read already succeeded, so a failed
                // upgrade write must not block the command that was asked for.
            }
        }
    } else {
        // No recognized "TAG:" prefix: a legacy file from before
        // aegis-secret-protect.js existed, bare plaintext JSON. Upgrade it
        // in place now rather than leaving it plaintext until the next
        // `aegis license activate` -- heartbeat/renew run far more often
        // than re-activation.
        json = raw;
        try {
            const { tag, blob } = secretProtect.protect(json);
            writePrivate(file, secretProtect.serialize(tag, blob) + '\n');
        } catch (e) {
            // Best effort: the read already succeeded, so a failed upgrade
            // write must not block the command that was actually asked for.
        }
    }
    let data;
    try {
        data = JSON.parse(json);
    } catch (e) {
        die('the credential file is unreadable: ' + file + ': ' + e.message);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        die('the credential file is malformed (expected a JSON object): ' + file);
    }
    for (const field of ['license_id', 'activation_id', 'device_secret']) {
        if (typeof data[field] !== 'string' || data[field] === '') {
            die('the credential file is malformed (missing ' + field + '): ' + file
                + ' (re-activate with: aegis license activate <license-id>)');
        }
    }
    return data;
}

function decodePayload(token) {
    const segments = String(token).split('.');
    if (segments.length !== 3 || segments[0] !== 'AEGIS1') return null;
    try {
        return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    } catch (e) {
        return null;
    }
}

// The offline verifier, as a subprocess: one implementation of "can this machine
// trust this token", the same trust list the launcher reports with. Returns
// { ok, reason } and never lets the token's content through to stdout.
function verify(file, keysFile) {
    if (!fs.existsSync(keysFile)) {
        return { ok: false, reason: 'the accepted license keys are missing: ' + keysFile };
    }
    const verifier = path.join(__dirname, 'aegis-license.js');
    const run = spawnSync(process.execPath, [verifier, 'verify', file, keysFile], { encoding: 'utf8' });
    if (run.error) return { ok: false, reason: 'could not run the license verifier: ' + run.error.message };
    if (run.status === 0) return { ok: true };
    const first = String(run.stderr || run.stdout || '').split('\n').find((l) => l.trim() !== '');
    return { ok: false, reason: (first || 'the license verifier refused the token').replace(/^aegis-license:\s*/, '') };
}

// Written beside the target and renamed over it, exactly like the activator's
// credential: a crash must not leave a truncated licence where a good one was.
function writePrivate(file, contents) {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(dir, 0o700);
    } catch (e) {
        // best effort -- on a native Windows filesystem the profile ACLs are what
        // actually restrict it, but the intent is owner-only either way.
    }
    const tmp = path.join(dir, '.' + path.basename(file) + '.' + process.pid + '.' + randomUUID() + '.tmp');
    try {
        fs.writeFileSync(tmp, contents, { mode: 0o600 });
        try {
            fs.chmodSync(tmp, 0o600);
        } catch (e) {
            // best effort -- see above
        }
        fs.renameSync(tmp, file);
    } catch (e) {
        try { fs.unlinkSync(tmp); } catch (cleanupError) { /* already gone */ }
        throw e;
    }
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
    const argv = process.argv.slice(2);
    const verb = argv[0];
    if (!verb) usage('missing the verb');
    if (!VERBS.includes(verb)) usage("unknown verb: '" + verb + "' (expected: token, renew, heartbeat or retire)");

    let apiUrl = process.env.AEGIS_LICENSE_API_URL || DEFAULT_API_URL;
    let yes = false;
    for (let i = 1; i < argv.length; i++) {
        if (argv[i] === '--url') {
            apiUrl = argv[++i];
            if (!apiUrl) usage('--url needs a value');
        } else if (argv[i] === '--yes') {
            yes = true;
        } else {
            die('unknown option: ' + argv[i] + ' (see usage)', 2);
        }
    }

    // The device credential travels in an Authorization header, so the transport
    // has to protect it (SEC-29): HTTPS, except loopback for local development.
    apiUrl = String(apiUrl).replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(apiUrl)) die('the service URL must start with http(s)://: ' + apiUrl, 2);
    let parsedUrl;
    try {
        parsedUrl = new URL(apiUrl);
    } catch (e) {
        die('the service URL is not a valid URL: ' + apiUrl, 2);
    }
    if (parsedUrl.protocol !== 'https:') {
        const host = parsedUrl.hostname.toLowerCase();
        const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
        if (!(parsedUrl.protocol === 'http:' && loopback)) {
            die('refusing a non-HTTPS service URL (' + apiUrl + '): the device credential is sent in an '
                + 'Authorization header, so the connection must be HTTPS. Plain http:// is allowed only '
                + 'for loopback (localhost, 127.0.0.1, ::1), for local development.', 2);
        }
    }

    const credentialFile = process.env.AEGIS_DEVICE_CREDENTIAL_FILE || DEFAULT_CREDENTIAL_FILE;
    const licenseFile = process.env.AEGIS_LICENSE_FILE || DEFAULT_LICENSE_FILE;
    const keysFile = process.env.AEGIS_LICENSE_KEYS_FILE
        || path.join(process.env.AEGIS_WORKSTATION_DIR ? process.env.AEGIS_WORKSTATION_DIR.replace(/\/$/, '') : path.join(os.homedir(), '.aegis', 'workstation'),
            'config', 'license-keys.json');
    const credential = readCredential(credentialFile);
    const authorization = 'Aegis-Device ' + credential.license_id + '.' + credential.activation_id + '.' + credential.device_secret;

    let r;
    try {
        if (verb === 'token') {
            // The download token (S5 piece 3): what the client hands to the registry's realm. It is
            // minted from the same device credential the lifecycle verbs use, so it dies with the
            // activation — retiring the seat revokes the token door too, with nothing to clean up
            // here.
            r = await call(apiUrl + '/v1/activations/token', 'POST', authorization);
        } else if (verb === 'renew') {
            r = await call(apiUrl + '/v1/activations/renew', 'POST', authorization);
        } else if (verb === 'heartbeat') {
            r = await call(apiUrl + '/v1/activations/heartbeat', 'POST', authorization);
        } else {
            if (!yes) {
                die("retire frees this machine's seat and deletes its license file; add --yes to confirm: "
                    + 'aegis license retire --yes', 2);
            }
            r = await call(apiUrl + '/v1/activations', 'DELETE', authorization);
        }
    } catch (e) {
        die('could not reach the licensing service at ' + apiUrl + ': ' + e.message);
    }

    if (!r.ok) die(serviceError(r.status, r.parsed));

    if (verb === 'token') {
        // The ONE thing this helper prints, and the reason `report` is not used: the caller pipes
        // stdout straight into `docker login --password-stdin`, so a trailing newline or a report
        // line would become part of the password. The device credential never leaves this process,
        // and the token lives sixty minutes.
        const token = r.parsed && typeof r.parsed.token === 'string' ? r.parsed.token : null;
        if (!token) die('the service answered without a token; there is nothing to hand the registry');
        process.stdout.write(token);
        return;
    }

    if (verb === 'heartbeat') {
        const seen = r.parsed && typeof r.parsed.last_seen_at === 'string' ? r.parsed.last_seen_at : null;
        report([
            'license_id:    ' + (r.parsed && r.parsed.license_id || credential.license_id),
            'activation_id: ' + (r.parsed && r.parsed.activation_id || credential.activation_id),
            'last_seen_at:  ' + (seen === null ? 'the service did not say' : seen),
        ]);
        return;
    }

    if (verb === 'retire') {
        // The seat is gone server-side. Whatever is left here would only claim a
        // licence the service no longer honours.
        const removed = [];
        for (const file of [licenseFile, credentialFile]) {
            try {
                if (fs.existsSync(file)) {
                    fs.rmSync(file);
                    removed.push(file);
                }
            } catch (e) {
                die('the seat was released but ' + file + ' could not be deleted: ' + e.message
                    + '. Delete it by hand: this machine is no longer licensed.');
            }
        }
        report([
            'seat released: license_id=' + (r.parsed && r.parsed.license_id || credential.license_id)
                + ' activation_id=' + (r.parsed && r.parsed.activation_id || credential.activation_id),
            'removed:       ' + (removed.length ? removed.join(' and ') : 'there was nothing local to remove'),
            'note:          the offline verifier cannot know a seat was released, which is why these files go.',
        ]);
        return;
    }

    // renew: the token the service just signed has to be one this machine can
    // verify BEFORE the licence that works today is moved aside.
    const token = r.parsed && typeof r.parsed.license_file === 'string' ? r.parsed.license_file : null;
    if (token === null || token === '') {
        die('the service answered without a license file; nothing was changed locally.');
    }
    const candidate = path.join(path.dirname(licenseFile), '.' + path.basename(licenseFile) + '.' + process.pid + '.renew.tmp');
    try {
        fs.mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });
        fs.writeFileSync(candidate, token.endsWith('\n') ? token : token + '\n', { mode: 0o600 });
    } catch (e) {
        die('cannot prepare the renewed license in ' + path.dirname(licenseFile) + ': ' + e.message);
    }
    const check = verify(candidate, keysFile);
    if (!check.ok) {
        try { fs.unlinkSync(candidate); } catch (e) { /* already gone */ }
        die("the service re-signed a license this machine cannot verify (" + check.reason
            + '); the current license file was left untouched.');
    }
    try { fs.unlinkSync(candidate); } catch (e) { /* already gone */ }

    let backup = null;
    if (fs.existsSync(licenseFile)) {
        backup = licenseFile + '.bak-' + stamp();
        try {
            fs.copyFileSync(licenseFile, backup);
            try { fs.chmodSync(backup, 0o600); } catch (e) { /* best effort */ }
        } catch (e) {
            die('the renewed license is valid but the current one could not be backed up: ' + e.message
                + '. Nothing was overwritten.');
        }
    }
    try {
        writePrivate(licenseFile, token.endsWith('\n') ? token : token + '\n');
    } catch (e) {
        die('the renewed license is valid but could not be written to ' + licenseFile + ': ' + e.message
            + (backup === null ? '' : ' (the previous file is intact at ' + backup + ')'));
    }

    const payload = decodePayload(token) || {};
    const lines = [
        'renewed:       license_id=' + (r.parsed && r.parsed.license_id || credential.license_id)
            + ' key_id=' + (payload.kid === undefined ? '?' : payload.kid),
        'expires_at:    ' + (payload.expires_at === undefined ? 'the new license does not say' : payload.expires_at),
        'written:       ' + licenseFile,
        'previous:      ' + (backup === null ? 'there was no license file to keep' : backup),
    ];
    report(lines);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
