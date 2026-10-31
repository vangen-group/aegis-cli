'use strict';
//
// aegis-secret-protect.js -- "protect a secret at rest" for files like
// device.json that must survive being copied off this machine (backup, zip,
// USB) without handing over a live, usable credential. A file permission
// (0600) only ever stopped another LOCAL USER from reading it, and does not
// even do that reliably on Windows/NTFS (Node's chmod there only toggles the
// read-only attribute, not a real ACL) -- it never stopped the bytes
// themselves from being useful once copied anywhere else. This module
// encrypts/stores through whatever real mechanism the OS already has, so a
// copied file is useless without the original machine (or its keyring).
//
// Tiers, in preference order, first one that works wins:
//   Windows        -- DPAPI (System.Security.Cryptography.ProtectedData) via
//                      powershell.exe, CurrentUser scope. No extra software
//                      (every Windows install has PowerShell), no interactive
//                      prompt (tied silently to the logged-in user).
//   Linux (desktop) -- libsecret / freedesktop Secret Service via
//                      `secret-tool`. No interactive prompt once the login
//                      keyring is unlocked (the normal state after a
//                      graphical login) -- same ergonomics as DPAPI.
//   Linux/macOS     -- gpg, encrypting to the user's own default secret key,
//   (gpg available)    when one already exists. May prompt via pinentry the
//                      first time; gpg-agent caches afterwards.
//   macOS           -- Keychain via the `security` CLI. (Not exercised by
//                      this product's actual clients today -- implemented
//                      for completeness, verify on a real Mac before relying
//                      on it.)
//   Fallback        -- plaintext, base64-wrapped only to keep the on-disk
//                      shape consistent. ALWAYS prints an explicit warning
//                      to stderr when this tier is used -- never a silent
//                      downgrade from whatever the previous write achieved.
//
// On-disk format: "<TAG>:<data>\n" -- a reader always knows which tier wrote
// it and unprotects accordingly, never guesses from content. A file with no
// recognized tag (no "TAG:" prefix at all) is legacy bare JSON from before
// this module existed; parse() returns null and the caller treats the raw
// content as the plaintext directly.

const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SERVICE_NAME = 'aegis-workstation-device';

const TAG_PLAIN = 'PLAIN1';
const TAG_DPAPI = 'DPAPI1';
const TAG_GPG = 'GPG1';
const TAG_SECRETTOOL = 'SECRETTOOL1';
const TAG_KEYCHAIN = 'KEYCHAIN1';
const KNOWN_TAGS = [TAG_PLAIN, TAG_DPAPI, TAG_GPG, TAG_SECRETTOOL, TAG_KEYCHAIN];

function hasCommand(cmd) {
    const probe = process.platform === 'win32'
        ? spawnSync('where', [cmd], { encoding: 'utf8' })
        : spawnSync('sh', ['-c', 'command -v ' + cmd], { encoding: 'utf8' });
    return !probe.error && probe.status === 0;
}

// Set AEGIS_SECRET_PROTECT_DEBUG=1 to see exactly why a tier failed instead
// of silently moving on to the next one -- the fallback chain is meant to
// degrade gracefully for an end user, not to hide a real bug from whoever is
// debugging it.
function debugFail(label, run) {
    if (!process.env.AEGIS_SECRET_PROTECT_DEBUG) return;
    process.stderr.write('aegis-secret-protect: [debug] ' + label + ' failed: '
        + 'error=' + (run.error ? run.error.message : 'none')
        + ' status=' + run.status
        + ' stderr=' + JSON.stringify(String(run.stderr || '').slice(0, 500)) + '\n');
}

// --- Windows: DPAPI via powershell.exe --------------------------------------
// System.Security.Cryptography.ProtectedData lives in System.Security.dll,
// which Windows PowerShell 5.1 (powershell.exe, as opposed to pwsh.exe) does
// NOT load by default -- Add-Type is required before the type resolves, or
// every call fails with "type not found" regardless of quoting.

function dpapiProtect(plaintext) {
    const script = 'Add-Type -AssemblyName System.Security; '
        + '$bytes = [System.Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); '
        + '$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, '
        + '[System.Security.Cryptography.DataProtectionScope]::CurrentUser); '
        + '[Console]::Out.Write([Convert]::ToBase64String($enc))';
    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        input: plaintext, encoding: 'utf8',
    });
    if (run.error || run.status !== 0 || !run.stdout) {
        debugFail('dpapiProtect', run);
        return null;
    }
    return run.stdout.trim();
}

function dpapiUnprotect(blob) {
    const script = 'Add-Type -AssemblyName System.Security; '
        + '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd()); '
        + '$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, '
        + '[System.Security.Cryptography.DataProtectionScope]::CurrentUser); '
        + '[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($dec))';
    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        input: blob, encoding: 'utf8',
    });
    if (run.error || run.status !== 0) {
        debugFail('dpapiUnprotect', run);
        return null;
    }
    return run.stdout;
}

// --- Linux desktop: libsecret / Secret Service via secret-tool -------------
// The "blob" written to disk is a random reference, not ciphertext: the real
// secret lives server-side in the keyring, keyed by (service, ref).

function secretToolAvailable() {
    return hasCommand('secret-tool') && !!process.env.DBUS_SESSION_BUS_ADDRESS;
}

function secretToolProtect(plaintext) {
    const ref = crypto.randomUUID();
    const run = spawnSync('secret-tool', [
        'store', '--label', 'Aegis Workstation device credential',
        'service', SERVICE_NAME, 'ref', ref,
    ], { input: plaintext, encoding: 'utf8' });
    if (run.error || run.status !== 0) {
        debugFail('secretToolProtect', run);
        return null;
    }
    return ref;
}

function secretToolUnprotect(ref) {
    const run = spawnSync('secret-tool', ['lookup', 'service', SERVICE_NAME, 'ref', ref], { encoding: 'utf8' });
    if (run.error || run.status !== 0 || !run.stdout) {
        debugFail('secretToolUnprotect', run);
        return null;
    }
    return run.stdout;
}

// --- gpg: encrypt to the user's own default secret key ----------------------

function gpgDefaultKeyFingerprint() {
    const run = spawnSync('gpg', ['--batch', '--list-secret-keys', '--with-colons'], { encoding: 'utf8' });
    if (run.error || run.status !== 0) {
        debugFail('gpgDefaultKeyFingerprint', run);
        return null;
    }
    const line = String(run.stdout).split('\n').find((l) => l.startsWith('fpr:'));
    if (!line) return null;
    const fields = line.split(':');
    return fields[9] || null;
}

function gpgProtect(plaintext) {
    const fpr = gpgDefaultKeyFingerprint();
    if (!fpr) return null;
    const run = spawnSync('gpg', [
        '--batch', '--yes', '--trust-model', 'always',
        '--encrypt', '--recipient', fpr, '--armor',
    ], { input: plaintext, encoding: 'utf8' });
    if (run.error || run.status !== 0 || !run.stdout) {
        debugFail('gpgProtect', run);
        return null;
    }
    return Buffer.from(run.stdout, 'utf8').toString('base64');
}

function gpgUnprotect(blob) {
    const armored = Buffer.from(blob, 'base64').toString('utf8');
    const run = spawnSync('gpg', ['--batch', '--yes', '--decrypt'], { input: armored, encoding: 'utf8' });
    if (run.error || run.status !== 0) {
        debugFail('gpgUnprotect', run);
        return null;
    }
    return run.stdout;
}

// --- macOS: Keychain via the `security` CLI ---------------------------------
// Not exercised by a real Mac in this product yet -- implemented for parity,
// verify end-to-end on real hardware before relying on it.

function keychainProtect(plaintext) {
    const account = os.userInfo().username;
    spawnSync('security', ['delete-generic-password', '-a', account, '-s', SERVICE_NAME], { encoding: 'utf8' });
    const run = spawnSync('security', [
        'add-generic-password', '-a', account, '-s', SERVICE_NAME, '-w', plaintext, '-U',
    ], { encoding: 'utf8' });
    if (run.error || run.status !== 0) {
        debugFail('keychainProtect', run);
        return null;
    }
    return account;
}

function keychainUnprotect(account) {
    const run = spawnSync('security', ['find-generic-password', '-a', account, '-s', SERVICE_NAME, '-w'], { encoding: 'utf8' });
    if (run.error || run.status !== 0 || !run.stdout) {
        debugFail('keychainUnprotect', run);
        return null;
    }
    return run.stdout.replace(/\n$/, '');
}

// --- Dispatch ----------------------------------------------------------------

// Returns { tag, blob }. Always succeeds -- the PLAIN1 fallback never fails
// to "protect" (it just does not), which is why every write path downstream
// can treat protect() as total and only the explicit stderr warning signals
// the degraded case.
function protect(plaintext) {
    if (process.platform === 'win32') {
        const blob = dpapiProtect(plaintext);
        if (blob) return { tag: TAG_DPAPI, blob };
    } else if (process.platform === 'darwin') {
        const blob = keychainProtect(plaintext);
        if (blob) return { tag: TAG_KEYCHAIN, blob };
        const gpgBlob = gpgProtect(plaintext);
        if (gpgBlob) return { tag: TAG_GPG, blob: gpgBlob };
    } else {
        if (secretToolAvailable()) {
            const ref = secretToolProtect(plaintext);
            if (ref) return { tag: TAG_SECRETTOOL, blob: ref };
        }
        const gpgBlob = gpgProtect(plaintext);
        if (gpgBlob) return { tag: TAG_GPG, blob: gpgBlob };
    }
    process.stderr.write(
        'aegis-secret-protect: WARNING: no secure credential store is available on this machine '
        + '(DPAPI/Keychain/libsecret/gpg) -- storing in plain text. Anyone who copies this file off '
        + 'this machine (backup, zip, USB) gets a usable credential.\n'
    );
    return { tag: TAG_PLAIN, blob: Buffer.from(plaintext, 'utf8').toString('base64') };
}

function unprotect(tag, blob) {
    switch (tag) {
        case TAG_DPAPI: {
            const out = dpapiUnprotect(blob);
            if (out === null) throw new Error('could not decrypt with Windows DPAPI (CurrentUser scope) -- wrong user or machine, or the protected data is corrupt');
            return out;
        }
        case TAG_SECRETTOOL: {
            const out = secretToolUnprotect(blob);
            if (out === null) throw new Error('could not read the secret from the system keyring (secret-tool) -- is the login keyring unlocked, and the D-Bus session reachable?');
            return out;
        }
        case TAG_GPG: {
            const out = gpgUnprotect(blob);
            if (out === null) throw new Error('could not decrypt with gpg -- is the matching secret key still available?');
            return out;
        }
        case TAG_KEYCHAIN: {
            const out = keychainUnprotect(blob);
            if (out === null) throw new Error('could not read the secret from the macOS Keychain');
            return out;
        }
        case TAG_PLAIN:
            return Buffer.from(blob, 'base64').toString('utf8');
        default:
            throw new Error('unknown protection tag: ' + tag);
    }
}

function serialize(tag, blob) {
    return tag + ':' + blob;
}

// Returns { tag, blob } for a recognized "TAG:..." prefix, or null for
// content with no such prefix (legacy bare JSON, predating this module).
function parse(content) {
    for (const tag of KNOWN_TAGS) {
        const prefix = tag + ':';
        if (content.startsWith(prefix)) {
            return { tag, blob: content.slice(prefix.length) };
        }
    }
    return null;
}

module.exports = { protect, unprotect, serialize, parse, TAG_PLAIN };
