#!/usr/bin/env node
//
// aegis-license.js -- offline verifier for the AEGIS1 signed-license format
// (ADR 0001 in the licensing service), used internally by bin/aegis's
// `aegis license`. Not a public CLI: bin/aegis is the single source of
// truth for the user-facing command and calls this script only to check a
// token and print what it entitles.
//
// Node instead of openssl because Node is already how the host runs its other
// helpers (aegis-accounts.js, aegis-git-credential-lookup.js) and its crypto
// module has Ed25519 built in -- verifying a license adds no runtime
// dependency to the launcher (ADR 0001).
//
// What this does NOT do, deliberately:
//   - It does not decide what the license gates. A patched launcher can ignore
//     any answer here; the format exists to make an offline check POSSIBLE and
//     honest, not to be un-patchable (see T28 in odd/tasks).
//   - It does not re-serialise the JSON. The signature covers the exact
//     base64url text segment, so verification hashes those bytes as they
//     arrived. Parsing the JSON only reads the claims; it never re-encodes
//     anything to be checked (the canonicalisation problem ADR 0001 avoids).
//
// Usage: node aegis-license.js verify <license-file> <keys-file>
//
//   <license-file>  A file holding one AEGIS1.<payload>.<signature> token.
//   <keys-file>     JSON data: {"keys": {"<kid>": "<base64url public key>"}}.
//                   A kid absent from this set is refused, never trusted.
//
// Exit codes: 0 valid, 1 refused (bad format, unknown kid, bad signature,
// malformed payload, expired), 2 bad usage.

'use strict';

const fs = require('fs');
const { createPublicKey, verify } = require('crypto');

const PREFIX = 'AEGIS1';
const SEGMENT_COUNT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Ed25519 SubjectPublicKeyInfo header (OID 1.3.101.112). The key set holds 32
// raw bytes; Node wants DER, so the wrapper is prepended here rather than
// depending on an encoding library -- the same trick the licensing service's
// own tools/verify-license.mjs uses.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function die(msg) {
    process.stderr.write('aegis-license: ' + msg + '\n');
    process.exit(1);
}

function usage() {
    process.stderr.write('usage: node aegis-license.js verify <license-file> <keys-file>\n');
    process.exit(2);
}

// base64url without padding (RFC 4648 §5). Kept byte-for-byte compatible with
// the service's Base64Url and the reference verifier: the encoding is part of
// the format contract, so it is not taken from a convenience helper.
function fromBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64');
}

// The accepted keys, read as data so rotating one is an edit to this file and
// never to the verification logic. An absent or empty set trusts nothing --
// the fail-closed direction: a broken key set must reject, not accept.
function loadKeys(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (e) {
        die('cannot read the key set: ' + file + ': ' + e.message);
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        die('malformed key set JSON: ' + file + ': ' + e.message);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data) ||
            typeof data.keys !== 'object' || data.keys === null || Array.isArray(data.keys)) {
        die('malformed key set (expected {"keys":{"<kid>":"<base64url public key>"}}): ' + file);
    }
    const keys = new Map();
    for (const [kid, value] of Object.entries(data.keys)) {
        if (typeof value !== 'string') {
            die('key set entry "' + kid + '" must be a base64url string');
        }
        const bytes = fromBase64Url(value);
        if (bytes.length !== 32) {
            die('key set entry "' + kid + '" must be a 32-byte Ed25519 public key (got ' + bytes.length + ' bytes)');
        }
        keys.set(kid, bytes);
    }
    return keys;
}

// Checks that the claims the report needs are present and of the right kind.
// The service requires every field except activation_id; a payload that is
// missing one is refused rather than reported with an invented default, so a
// truncated or hand-edited file cannot masquerade as a valid entitlement.
function payloadProblem(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return 'the payload is not a JSON object';
    }
    if (typeof payload.v !== 'number') return 'the payload is missing "v"';
    if (typeof payload.kid !== 'string' || payload.kid === '') return 'the payload is missing "kid"';
    if (typeof payload.license_id !== 'string' || payload.license_id === '') return 'the payload is missing "license_id"';
    if (typeof payload.customer !== 'string' || payload.customer === '') return 'the payload is missing "customer"';
    if (typeof payload.seats !== 'number') return 'the payload is missing "seats"';
    if (!Array.isArray(payload.features) || payload.features.some((f) => typeof f !== 'string')) {
        return 'the payload has an invalid "features" list';
    }
    if (typeof payload.issued_at !== 'string' || Number.isNaN(Date.parse(payload.issued_at))) {
        return 'the payload has an invalid "issued_at"';
    }
    if (typeof payload.expires_at !== 'string' || Number.isNaN(Date.parse(payload.expires_at))) {
        return 'the payload has an invalid "expires_at"';
    }
    if (payload.activation_id !== undefined && typeof payload.activation_id !== 'string') {
        return 'the payload has an invalid "activation_id"';
    }
    return null;
}

// Returns { ok: true, payload } or { ok: false, reason, payload?, expired? }.
// The key is chosen from the payload's kid, so an untrusted kid is refused
// before any signature work happens.
function verifyLicense(token, keys) {
    const segments = token.split('.');
    if (segments.length !== SEGMENT_COUNT || segments[0] !== PREFIX) {
        return { ok: false, reason: 'expected ' + SEGMENT_COUNT + ' segments starting with ' + PREFIX };
    }

    // The exact text the signature covers. Everything below verifies THESE
    // bytes; nothing is re-encoded from the parsed claims.
    const signedPayload = segments[1];

    let payload;
    try {
        payload = JSON.parse(fromBase64Url(signedPayload).toString('utf8'));
    } catch (e) {
        return { ok: false, reason: 'the payload is not valid JSON' };
    }

    const problem = payloadProblem(payload);
    if (problem) {
        return { ok: false, reason: 'malformed payload: ' + problem };
    }

    const publicKeyBytes = keys.get(payload.kid);
    if (!publicKeyBytes) {
        return { ok: false, reason: "no trusted public key for key id '" + payload.kid + "'" };
    }

    let publicKey;
    try {
        publicKey = createPublicKey({
            key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
            format: 'der',
            type: 'spki',
        });
    } catch (e) {
        return { ok: false, reason: "the trusted public key for key id '" + payload.kid + "' is not usable" };
    }

    let verified = false;
    try {
        verified = verify(null, Buffer.from(signedPayload, 'utf8'), publicKey, fromBase64Url(segments[2]));
    } catch (e) {
        verified = false;
    }
    if (!verified) {
        return { ok: false, reason: 'the signature does not match the payload' };
    }

    // The signature is good, so the claims can be trusted; only now does the
    // window matter. Expiry is a property of the payload, not of the signature
    // (the service's own tests say the same -- see LicenseSigningTests).
    if (Date.now() > Date.parse(payload.expires_at)) {
        return { ok: false, expired: true, payload, reason: 'the license expired on ' + payload.expires_at };
    }

    return { ok: true, payload };
}

// Spells the window out rather than leaving the reader to subtract dates: a
// license that expired yesterday and one that expires in a year must not print
// the same "expires_at" and be left for the reader to interpret.
function describeRemaining(expiresAt) {
    const diff = expiresAt - Date.now();
    if (diff >= 0) {
        const days = Math.floor(diff / DAY_MS);
        if (days >= 1) return 'in ' + days + (days === 1 ? ' day' : ' days');
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return hours >= 1 ? 'in ' + hours + (hours === 1 ? ' hour' : ' hours') : 'in less than an hour';
    }
    const ago = Date.now() - expiresAt;
    const days = Math.floor(ago / DAY_MS);
    if (days >= 1) return 'expired ' + days + (days === 1 ? ' day' : ' days') + ' ago';
    const hours = Math.floor(ago / (60 * 60 * 1000));
    return hours >= 1 ? 'expired ' + hours + (hours === 1 ? ' hour' : ' hours') + ' ago' : 'expired less than an hour ago';
}

function report(payload, status) {
    const lines = [
        'status:      ' + status,
        'license_id:  ' + payload.license_id,
        'customer:    ' + payload.customer,
        'seats:       ' + payload.seats,
        'features:    ' + (payload.features.length ? payload.features.join(', ') : '(none)'),
        'key_id:      ' + payload.kid,
        'issued_at:   ' + payload.issued_at,
        'expires_at:  ' + payload.expires_at,
        'expires_in:  ' + describeRemaining(Date.parse(payload.expires_at)),
    ];
    if (payload.activation_id) {
        // Sits with the identity lines, not at the end, so "which machine" is
        // read together with "which license".
        lines.splice(6, 0, 'activation:  ' + payload.activation_id);
    }
    return lines.join('\n') + '\n';
}

function main() {
    const argv = process.argv.slice(2);
    if (argv[0] !== 'verify') usage();
    const licenseFile = argv[1];
    const keysFile = argv[2];
    if (!licenseFile || !keysFile) usage();

    const keys = loadKeys(keysFile);

    let token;
    try {
        token = fs.readFileSync(licenseFile, 'utf8').trim();
    } catch (e) {
        die('cannot read the license file: ' + licenseFile + ': ' + e.message);
    }
    if (!token) {
        die('the license file is empty: ' + licenseFile);
    }

    const result = verifyLicense(token, keys);

    if (!result.ok && result.expired) {
        // The payload IS authentic; it is the window that closed. Printing the
        // entitlement (not just a refusal) is what makes that difference
        // visible instead of a bare "invalid".
        process.stdout.write(report(result.payload, 'expired'));
        process.stderr.write('aegis-license: ' + result.reason + '\n');
        process.exit(1);
    }
    if (!result.ok) {
        process.stderr.write('aegis-license: ' + result.reason + '\n');
        process.exit(1);
    }

    process.stdout.write(report(result.payload, 'valid'));
    process.exit(0);
}

main();
