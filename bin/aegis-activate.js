#!/usr/bin/env node
//
// aegis-activate.js -- claims a seat of a licence for THIS machine and stores
// what the licensing service hands back, used internally by bin/aegis's
// `aegis license activate`. Not a public CLI: bin/aegis is the single
// source of truth for the user-facing command and calls this script only to
// perform the one online step the offline verifier cannot.
//
// Node instead of curl because Node already runs the other host helpers
// (aegis-accounts.js, aegis-license.js, aegis-git-credential-lookup.js) and its
// built-in fetch and crypto cover the whole job -- activation adds no runtime
// dependency to the launcher (ADR 0001).
//
// What this does, in order:
//   1. Derives a machine id from the host's stable id (Windows MachineGuid or
//      Linux /etc/machine-id) hashed with the licence id (design §5: "a speed
//      bump, not a jail"). The raw id is a machine identifier and never leaves
//      the host; only the hash is sent.
//   2. POSTs it to the anonymous activation endpoint, with the activation id
//      and an Idempotency-Key this process chooses.
//   3. Stores the signed licence file and, when the service hands over a device
//      credential that actually authenticates, that credential -- to disk,
//      never to stdout.
//
// What this deliberately does NOT do:
//   - It never prints the device_secret, the response body, or the licence
//     file. The credential is written straight from this process to disk, so it
//     never passes through argv, a shell variable, or a log (SEC-24).
//   - It does not decide what the licence gates; that is the same offline
//     verifier's job and the same "not un-patchable" caveat (see T28).
//
// Usage: node aegis-activate.js <license-id> [--url <url>]
//
//   <license-id>  The id the operator issued, e.g. lic_35841fc7....
//   --url         Overrides the service base URL (env AEGIS_LICENSE_API_URL).
//
// Environment:
//   AEGIS_LICENSE_FILE           Where the signed licence token is written.
//   AEGIS_DEVICE_CREDENTIAL_FILE Where the device credential + its activation
//                                id are written.
//   AEGIS_LICENSE_API_URL        Service base URL (production default).
//
// Exit codes: 0 activated, 1 refused (service error, no credential could be
// stored), 2 bad usage.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { execFileSync } = require('child_process');

// Defaults match docs/11-aegis-cli.md §8.16: the service the licence comes
// from, and the two files that travel with the rest of this host's credentials.
const DEFAULT_API_URL = 'https://aegis-workstation-production.up.railway.app';
const DEFAULT_LICENSE_FILE = path.join(os.homedir(), '.aegis', 'license');
const DEFAULT_CREDENTIAL_FILE = path.join(os.homedir(), '.aegis', 'device.json');

const MACHINE_GUID_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography';

// Exit by setting a code and returning, not by calling process.exit(): doing
// that while the fetch keep-alive socket is still closing can trip a libuv
// assertion on Windows (UV_HANDLE_CLOSING). Setting process.exitCode and
// returning lets the event loop drain and produce the same code without racing
// the socket teardown.
class ExitSignal {
    constructor(code) { this.code = code; }
}

function die(msg, code) {
    process.stderr.write('aegis-activate: ' + msg + '\n');
    throw new ExitSignal(code || 1);
}

function usage() {
    process.stderr.write('usage: node aegis-activate.js <license-id> [--url <url>]\n');
    throw new ExitSignal(2);
}

// Windows: the MachineGuid is read through reg.exe first; the value NAME
// (MachineGuid) and type (REG_SZ) are not localised even when reg.exe's own
// labels are. PowerShell is the fallback, not the default, so a plain
// activation does not pay for a PowerShell startup.
//
// Linux: /etc/machine-id (or the older /var/lib/dbus/machine-id) is the stable
// host id. The acceptance on a Linux/DinD host used to need a fake reg.exe;
// with this fallback it activates natively. AEGIS_MACHINE_GUID is the test/ops
// override: the DinD acceptance sets it so the seat is not tied to the
// disposable container id.
function readMachineId() {
    const override = (process.env.AEGIS_MACHINE_GUID || '').trim();
    if (override) return override;
    try {
        const out = execFileSync('reg', ['query', MACHINE_GUID_KEY, '/v', 'MachineGuid'],
            { encoding: 'utf8', windowsHide: true });
        const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
        if (match) return match[1];
    } catch (e) {
        // Fall through: a missing reg.exe or an unexpected query result is not
        // fatal on its own, PowerShell can still answer the same question.
    }
    try {
        const out = execFileSync('powershell',
            ['-NoProfile', '-Command',
                "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid"],
            { encoding: 'utf8', windowsHide: true });
        const value = out.trim();
        if (value) return value;
    } catch (e) {
        // Fall through to the Linux id files.
    }
    if (process.platform !== 'win32') {
        for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
            try {
                const value = fs.readFileSync(file, 'utf8').trim();
                if (value) return value;
            } catch (e) {
                // Try the next file.
            }
        }
    }
    return null;
}

// SHA-256 of "<MachineGuid>:<licence id>", lowercase hex.
//
// Hashed WITH the licence id, as the design requires: the same machine bound to
// two licences produces two different machine ids, so one licence's activation
// never says anything about another's. The separator makes the concatenation
// unambiguous (a GUID and an id cannot be slid across the ':').
//
// Hex, not base64url: 64 characters comfortably under the service's 200-char
// machine id column, and stable across runs -- which is the whole point, since
// re-activation is recognised by this value and a value that drifted would
// spend a second seat every time.
function machineIdFor(guid, licenseId) {
    return createHash('sha256').update(guid + ':' + licenseId).digest('hex');
}

// The service mints `lic_<32 hex>` for licences and the activation id is the
// caller's to choose (ActivationEndpoints takes it from the request). This
// mirrors the licence shape exactly -- `act_` + Guid "N" -- so an id is
// recognisable in a log without a lookup, which is the stated reason for the
// `lic_` prefix in the first place.
function newActivationId() {
    return 'act_' + randomUUID().replace(/-/g, '');
}

// Bound every network call: undici's fetch has no default timeout, so a service
// that accepts the connection and then stalls would hang this command forever.
const REQUEST_TIMEOUT_MS = 15000;

// Starts an AbortController that fires after ms, and returns it with a dispose
// for the caller to clear the timer once the request is fully read. The signal
// covers the whole request, body included, because the timer is only cleared
// when the caller says so.
function abortAfter(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

function timedOut(e) {
    return e && e.name === 'AbortError';
}

async function postJson(url, body, headers) {
    const guard = abortAfter(REQUEST_TIMEOUT_MS);
    let res, text;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: guard.signal,
        });
        text = await res.text();
    } catch (e) {
        if (timedOut(e)) {
            throw new Error('timed out after ' + REQUEST_TIMEOUT_MS + ' ms');
        }
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
    return { res, parsed };
}

// Whether the credential the service just returned actually authenticates.
// Probes the device-authenticated heartbeat with it.
//
// The service mints a fresh device_secret on EVERY activation, including a
// repeat: on a repeat License.Activate returns the activation already bound to
// this machine id and hashes nothing, so the value in the response is a decoy
// that was never stored and cannot authenticate. That is why a returned secret
// is only trusted after this probe -- and why a probe that fails must never be
// allowed to overwrite a working credential. The response is drained and never
// logged (SEC-24).
async function secretAuthenticates(apiUrl, licenseId, activationId, secret) {
    const guard = abortAfter(REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(apiUrl + '/v1/activations/heartbeat', {
            method: 'POST',
            headers: { authorization: 'Aegis-Device ' + licenseId + '.' + activationId + '.' + secret },
            signal: guard.signal,
        });
        // Drain the body: only the acceptance matters, and it must not be logged.
        await res.text();
        return res.ok;
    } catch (e) {
        return false;
    } finally {
        guard.dispose();
    }
}

function readCredential(file) {
    if (!fs.existsSync(file)) return null;
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        die('the credential file is unreadable: ' + file + ': ' + e.message);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        die('the credential file is malformed (expected a JSON object): ' + file);
    }
    if (typeof data.activation_id !== 'string' || typeof data.device_secret !== 'string') {
        die('the credential file is malformed (missing activation_id/device_secret): ' + file);
    }
    return data;
}

// Same directory and mode treatment as aegis-accounts.js: 0700 for the folder,
// 0600 for the file. On a native Windows filesystem chmod is best-effort -- the
// profile's own ACLs are what actually restrict it there -- but the intent, and
// the POSIX behaviour, is owner-only.
//
// Written beside the target and renamed over it. The device credential is
// handed over exactly once, so a crash midway through an in-place write would
// leave a truncated file where a good one used to be -- and the value could not
// be recovered. rename() within one directory is atomic on the same filesystem:
// the target is either the old file or the complete new one, never a partial.
function writePrivate(file, contents) {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(dir, 0o700);
    } catch (e) {
        // best effort -- see above
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
        // Never leave the scratch file behind for a failed write.
        try { fs.unlinkSync(tmp); } catch (cleanupError) { /* already gone */ }
        throw e;
    }
}

// Only these response fields are ever surfaced, and never their secret values.
// Extracting `title`/`detail` instead of echoing the body means a 200 that
// somehow carried a credential can never end up in a log through an error path.
function serviceError(kind, status, parsed) {
    const title = parsed && typeof parsed.title === 'string' ? parsed.title : null;
    const detail = parsed && typeof parsed.detail === 'string' ? parsed.detail : null;
    const parts = ['the service refused the activation (' + kind + ' ' + status + ')'];
    if (title) parts.push(title);
    if (detail) parts.push(detail);
    return parts.join(': ');
}

function report(lines) {
    process.stdout.write(lines.join('\n') + '\n');
}

async function main() {
    const argv = process.argv.slice(2);
    const licenseId = argv[0];
    if (!licenseId || licenseId.startsWith('--')) usage();

    let apiUrl = process.env.AEGIS_LICENSE_API_URL || DEFAULT_API_URL;
    for (let i = 1; i < argv.length; i++) {
        switch (argv[i]) {
            case '--url':
                apiUrl = argv[++i];
                if (!apiUrl) usage();
                break;
            default:
                die('unknown option: ' + argv[i] + ' (see usage)', 2);
        }
    }
    apiUrl = apiUrl.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(apiUrl)) {
        die('the service URL must start with http(s)://: ' + apiUrl, 2);
    }
    // The device credential is sent in an Authorization header, so the transport
    // has to protect it: SEC-29 requires HTTPS. Plain http:// is refused except
    // for loopback, where there is no network to eavesdrop on and local
    // development against a service on this machine stays possible.
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

    const licenseFile = process.env.AEGIS_LICENSE_FILE || DEFAULT_LICENSE_FILE;
    const credentialFile = process.env.AEGIS_DEVICE_CREDENTIAL_FILE || DEFAULT_CREDENTIAL_FILE;

    const guid = readMachineId();
    if (!guid) {
        die('cannot read a machine id (Windows MachineGuid or Linux /etc/machine-id).');
    }
    const machineId = machineIdFor(guid, licenseId);

    // A fresh id and key per invocation. The key collapses a retried *request*;
    // the seat across invocations is protected by the machine id, which is what
    // the service de-duplicates on. Reusing the key across separate invocations
    // would replay the first response and hide the "credential is handed over
    // once" behaviour this command has to report honestly.
    const activationId = newActivationId();
    const idempotencyKey = randomUUID();

    let response;
    try {
        response = await postJson(apiUrl + '/v1/activations',
            { licenseId, activationId, machineId },
            { 'Idempotency-Key': idempotencyKey });
    } catch (e) {
        die('could not reach the licensing service at ' + apiUrl + ': ' + e.message);
    }
    const { res, parsed } = response;
    if (!res.ok) {
        die(serviceError('HTTP', res.status, parsed));
    }
    if (!parsed || typeof parsed !== 'object') {
        die('the service returned an unreadable response (HTTP ' + res.status + ').');
    }

    const signedLicense = parsed.license_file;
    const returnedActivationId = parsed.activation_id;
    const returnedLicenseId = parsed.license_id;
    if (typeof signedLicense !== 'string' || !signedLicense.startsWith('AEGIS1.')) {
        die('the service returned no usable signed licence.');
    }
    if (typeof returnedActivationId !== 'string' || returnedActivationId === '') {
        die('the service returned no activation id.');
    }
    // Read BEFORE writing: whether a licence was already on this machine only
    // shapes the message on a repeat; the binding itself is told apart by the
    // activation id the service echoes (see serverCreatedActivation below).
    const licenseAlreadyPresent = fs.existsSync(licenseFile);
    // The licence file is the one artefact the offline verifier reads; it is
    // written before anything can fail afterwards, so a credential problem
    // never costs the machine its entitlement.
    writePrivate(licenseFile, signedLicense.trim() + '\n');

    const existing = readCredential(credentialFile);
    const sameBinding = existing !== null && existing.activation_id === returnedActivationId;
    const deviceSecret = typeof parsed.device_secret === 'string' ? parsed.device_secret : null;

    // The service echoes the activation it actually bound. It equals the id this
    // process sent ONLY when the request created a new activation; on a repeat
    // it carries the existing activation's own id (License.Activate returns the
    // already-bound activation untouched). The service returns a device_secret
    // either way, so this difference is the only reliable signal that the value
    // in this response was minted but never hashed or stored -- and therefore
    // cannot authenticate.
    const serverCreatedActivation = returnedActivationId === activationId;

    const storeCredential = () => writePrivate(credentialFile, JSON.stringify({
        license_id: returnedLicenseId || licenseId,
        activation_id: returnedActivationId,
        device_secret: deviceSecret,
    }, null, 2) + '\n');
    const lostCredentialNote = 'aegis-activate: a device credential is handed over only once — if it '
        + 'was lost, the seat must be released before this machine can activate again.\n';

    let credentialLine;
    let statusLine;
    let exitCode = 0;
    if (serverCreatedActivation) {
        // This request created the binding, so License.Activate hashed and
        // stored exactly this secret: it is the one on record and needs no
        // second call that could only add a way to lose a once-only credential
        // to a transient error.
        if (deviceSecret) {
            storeCredential();
            statusLine = 'activated';
            credentialLine = 'stored (' + credentialFile + ')';
        } else {
            // Defensive only: the handler always returns a secret for a new
            // binding, so nothing is stored against a service that did not.
            statusLine = 'activated, no credential stored';
            credentialLine = 'not issued — the service did not return a device credential';
            exitCode = 1;
            process.stderr.write('aegis-activate: this machine is bound to the licence but holds no '
                + 'credential.\n');
            process.stderr.write(lostCredentialNote);
        }
    } else if (sameBinding) {
        // The service reused the binding already on this machine (the returned
        // activation id is not the one we sent), so the secret in this response
        // was minted but never hashed: it cannot authenticate. A value here must
        // earn its trust -- test it, and only replace the stored credential if
        // it actually works.
        if (deviceSecret && await secretAuthenticates(apiUrl, returnedLicenseId || licenseId, returnedActivationId, deviceSecret)) {
            storeCredential();
            statusLine = 'already active';
            credentialLine = 'rotated (' + credentialFile + ')';
        } else {
            statusLine = 'already active';
            credentialLine = 'kept (' + credentialFile + ') — already activated on this machine; the '
                + 'value the service returned does not authenticate (a device credential is handed '
                + 'over only once)';
        }
    } else if (licenseAlreadyPresent) {
        // No credential on disk, but a licence was already here: this machine
        // activated before and its credential is gone, so the response is a
        // re-handover of the existing binding. Test the value; only a credential
        // that actually authenticates may be stored -- anything else would be
        // pretending, which is exactly what this command must not do.
        if (deviceSecret && await secretAuthenticates(apiUrl, returnedLicenseId || licenseId, returnedActivationId, deviceSecret)) {
            storeCredential();
            statusLine = 'activated';
            credentialLine = 'stored (' + credentialFile + ')';
        } else {
            statusLine = 'activated, no credential stored';
            credentialLine = 'not issued — the value the service returned does not authenticate '
                + '(the device credential was handed over before and is issued only once)';
            exitCode = 1;
            process.stderr.write('aegis-activate: the licence file is in place, but this machine holds '
                + 'no working device credential.\n');
            process.stderr.write(lostCredentialNote);
        }
    } else {
        // Nothing local, yet the service did not create a binding for this
        // request: it reused the activation already bound to this machine id
        // (the returned activation id is not the one we sent). The seat is
        // claimed but the credential handed over when it was claimed is gone,
        // and the secret in this response was minted without being hashed or
        // stored. Writing it would report success over a value that cannot
        // authenticate -- the exact false success this branch exists to prevent.
        if (deviceSecret && await secretAuthenticates(apiUrl, returnedLicenseId || licenseId, returnedActivationId, deviceSecret)) {
            // Reachable only if a service ever starts returning a usable secret
            // on a repeat; storing it beats discarding a working credential.
            storeCredential();
            statusLine = 'activated';
            credentialLine = 'stored (' + credentialFile + ')';
        } else {
            statusLine = 'activated, no credential stored';
            credentialLine = 'not issued — this machine is already bound to the licence and its device '
                + 'credential was handed over only once; the value returned now does not authenticate';
            exitCode = 1;
            process.stderr.write('aegis-activate: the licence file is in place, but this machine holds '
                + 'no working device credential.\n');
            process.stderr.write(lostCredentialNote);
        }
    }

    report([
        'status:        ' + statusLine,
        'license_id:    ' + (returnedLicenseId || licenseId),
        'activation_id: ' + returnedActivationId,
        'license_file:  ' + licenseFile,
        'credential:    ' + credentialLine,
    ]);
    process.exitCode = exitCode;
}

main().catch((e) => {
    if (e instanceof ExitSignal) {
        process.exitCode = e.code;
        return;
    }
    process.stderr.write('aegis-activate: ' + (e && e.message ? e.message : String(e)) + '\n');
    process.exitCode = 1;
});
