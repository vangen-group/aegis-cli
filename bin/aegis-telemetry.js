'use strict';
//
// Opt-in usage telemetry for the aegis launcher. OFF unless the user turned it
// on, and AEGIS_TELEMETRY=off always wins. One OTLP/HTTP JSON POST per finished
// command, to an endpoint the user chose. No dependencies: it ships next to
// bin/aegis, which is copied standalone into ~/bin.
//
// What is sent: a fixed command name, the outcome and exit code, how long it
// took, the launcher version, the OS family, a random id made when telemetry
// was enabled, and the language names/versions of the manifest. Never
// arguments, paths, project, domain, secret or account names, user or host
// names, or environment values.
//
//   aegis-telemetry.js send (--command <name> | --first <word> [--second <word>]) --exit-code <n> --duration-ms <n> [--workstation-dir <dir>]
//   aegis-telemetry.js status
//   aegis-telemetry.js enable --endpoint <url> (--token <t> | --token-stdin)
//   aegis-telemetry.js disable

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const TIMEOUT_MS = 3000;
const DURATION_BOUNDS = [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];

// The only command names that ever leave the machine. Derived from the real
// dispatchers in bin/aegis; anything else is reported as "other".
const SINGLE_COMMANDS = [
    'up', 'shell', 'herdr', 'sandbox', 'promote', 'stop', 'down', 'status', 'version', 'audit', 'install', 'update',
    'connect', 'disconnect', 'backup', 'restore', 'export', 'import',
];
const GROUP_COMMANDS = {
    // 'account' is only the licence now: 'license' is its default report and
    // the rest are aliases of the same verbs under 'license'. The old credential
    // verbs (add/list/rotate/remove/show) are gone and would classify as 'other'.
    account: ['license', 'activate', 'renew', 'heartbeat', 'retire'],
    license: ['show', 'activate', 'renew', 'heartbeat', 'retire'],
    env: ['list', 'rebuild'],
    secret: ['list', 'show', 'put', 'rm'],
    allow: ['list', 'add', 'remove', 'reload', 'denied', 'test'],
    add: ['environment', 'tool'],
    build: ['windows', 'clean'],
    remove: ['environment', 'tool'],
};
const KNOWN_LANGUAGES = ['java', 'dotnet', 'node', 'go', 'python', 'cpp'];
const VERSION_RE = /^[A-Za-z0-9._+-]{1,40}$/;

// first/second are the raw tokens typed after `aegis`; the launcher hands over
// the second one only for the grouped commands. Returns a vocabulary name.
function classifyCommand(first, second) {
    if (SINGLE_COMMANDS.includes(first)) return first;
    if (Object.prototype.hasOwnProperty.call(GROUP_COMMANDS, first) && GROUP_COMMANDS[first].includes(second)) {
        return first + ' ' + second;
    }
    return 'other';
}

function vocabulary() {
    const names = SINGLE_COMMANDS.slice();
    for (const [group, subs] of Object.entries(GROUP_COMMANDS)) for (const s of subs) names.push(group + ' ' + s);
    return names.concat(['other']);
}

function osType(platform) {
    const p = platform || process.platform;
    if (p === 'win32') return 'windows';
    if (p === 'linux' || p === 'darwin') return p;
    return 'other';
}

// {"java":["temurin-17"],"cpp":true,...} -> [{language, version}], filtered to
// the known language names and plain version strings.
function languagesFromManifest(manifest) {
    const out = [];
    if (!manifest || typeof manifest !== 'object') return out;
    for (const lang of KNOWN_LANGUAGES) {
        const v = manifest[lang];
        if (Array.isArray(v)) {
            for (const ver of v) if (typeof ver === 'string' && VERSION_RE.test(ver)) out.push({ language: lang, version: ver });
        } else if (v === true) {
            out.push({ language: lang, version: 'enabled' });
        }
    }
    return out;
}

const str = (key, value) => ({ key, value: { stringValue: String(value) } });

function buildPayload(o) {
    const nowMs = o.nowMs === undefined ? Date.now() : o.nowMs;
    const durationS = Math.max(0, Number(o.durationSeconds) || 0);
    const exitCode = Number.isInteger(o.exitCode) ? o.exitCode : 1;
    const outcome = exitCode === 0 ? 'ok' : 'error';
    const command = vocabulary().includes(o.command) ? o.command : 'other';
    const end = BigInt(nowMs) * 1000000n;
    const start = end - BigInt(Math.round(durationS * 1e9));
    const t = { startTimeUnixNano: start.toString(), timeUnixNano: end.toString() };

    let bucket = DURATION_BOUNDS.findIndex((b) => durationS <= b);
    if (bucket === -1) bucket = DURATION_BOUNDS.length;
    const bucketCounts = DURATION_BOUNDS.concat([0]).map((_, i) => (i === bucket ? '1' : '0'));

    const metrics = [
        {
            name: 'aegis.cli.commands',
            sum: {
                aggregationTemporality: 1,
                isMonotonic: true,
                dataPoints: [{
                    ...t, asInt: '1',
                    attributes: [str('command', command), str('outcome', outcome), { key: 'exit_code', value: { intValue: String(exitCode) } }],
                }],
            },
        },
        {
            name: 'aegis.cli.command.duration',
            unit: 's',
            histogram: {
                aggregationTemporality: 1,
                dataPoints: [{
                    ...t, count: '1', sum: durationS, bucketCounts, explicitBounds: DURATION_BOUNDS.slice(),
                    attributes: [str('command', command), str('outcome', outcome)],
                }],
            },
        },
    ];
    const langs = (o.languages || []);
    if (langs.length > 0) {
        metrics.push({
            name: 'aegis.workstation.language',
            gauge: {
                dataPoints: langs.map((l) => ({
                    timeUnixNano: end.toString(), asInt: '1',
                    attributes: [str('language', l.language), str('version', l.version)],
                })),
            },
        });
    }
    return {
        resourceMetrics: [{
            resource: {
                attributes: [
                    str('service.name', 'aegis-cli'),
                    str('service.version', o.version || 'unknown'),
                    str('os.type', o.osType || osType()),
                    str('host.id', o.hostId || ''),
                ],
            },
            scopeMetrics: [{ scope: { name: 'aegis-cli' }, metrics }],
        }],
    };
}

function configPath() {
    return process.env.AEGIS_TELEMETRY_FILE || path.join(os.homedir(), '.aegis', 'telemetry.json');
}

function readConfig() {
    try {
        const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
        return c && typeof c === 'object' ? c : {};
    } catch (_) {
        return {};
    }
}

function writeConfig(config) {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch (_) { /* not honored on every filesystem */ }
}

function killSwitch() {
    return String(process.env.AEGIS_TELEMETRY || '').toLowerCase() === 'off';
}

// https always; plain http only for a loopback host (local tests).
function endpointError(endpoint) {
    let u;
    try { u = new URL(endpoint); } catch (_) { return 'the endpoint is not a valid URL'; }
    if (u.protocol === 'https:') return null;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol === 'http:' && loopback) return null;
    return 'the endpoint must be https (http is accepted only for localhost)';
}

function debug(message) {
    if (process.env.AEGIS_TELEMETRY_DEBUG === '1') process.stderr.write('telemetry: ' + message + '\n');
}

// The product version: the version.json release-please ships inside the
// configuration tree (next to the repo-root source). The installed copy and
// the checkout both carry it; anything else reports "unknown".
function launcherVersion(workstationDir) {
    if (!workstationDir) return 'unknown';
    try {
        const v = JSON.parse(fs.readFileSync(path.join(workstationDir, 'version.json'), 'utf8')).version;
        return typeof v === 'string' && VERSION_RE.test(v) ? v : 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

function readLanguages() {
    const file = process.env.AEGIS_ENV_FILE || path.join(os.homedir(), '.aegis', 'environments.json');
    try { return languagesFromManifest(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { return []; }
}

// Never throws. Resolves {sent, reason, status?}.
async function send(o) {
    try {
        if (killSwitch()) return { sent: false, reason: 'kill switch' };
        const cfg = readConfig();
        if (cfg.enabled !== true || !cfg.endpoint || !cfg.token) return { sent: false, reason: 'not enabled' };
        const bad = endpointError(cfg.endpoint);
        if (bad) return { sent: false, reason: bad };
        const body = JSON.stringify(buildPayload({
            command: o.command,
            exitCode: o.exitCode,
            durationSeconds: (Number(o.durationMs) || 0) / 1000,
            version: launcherVersion(o.workstationDir),
            hostId: cfg.hostId,
            languages: readLanguages(),
        }));
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), o.timeoutMs || TIMEOUT_MS);
        try {
            const res = await fetch(cfg.endpoint.replace(/\/+$/, '') + '/v1/metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token },
                body,
                signal: ctl.signal,
            });
            return { sent: res.ok, status: res.status, reason: res.ok ? 'ok' : 'http ' + res.status };
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return { sent: false, reason: 'error: ' + (e && e.name ? e.name : 'unknown') };
    }
}

function status() {
    const cfg = readConfig();
    const lines = [];
    lines.push('telemetry: ' + (cfg.enabled === true && !killSwitch() ? 'on' : 'off'));
    if (killSwitch()) lines.push('kill switch: AEGIS_TELEMETRY=off is set, nothing is sent');
    lines.push('endpoint: ' + (cfg.endpoint || 'not set'));
    lines.push('token: ' + (cfg.token ? 'set' : 'not set'));
    if (cfg.hostId) lines.push('install id: ' + cfg.hostId);
    lines.push('config: ' + configPath());
    return lines.join('\n');
}

function enable(o) {
    const bad = endpointError(o.endpoint || '');
    if (bad) return { ok: false, message: bad };
    if (!o.token) return { ok: false, message: 'a token is required (--token-stdin is preferred)' };
    const cfg = readConfig();
    writeConfig({
        enabled: true,
        endpoint: o.endpoint.replace(/\/+$/, ''),
        token: o.token,
        hostId: cfg.hostId || crypto.randomUUID(),
    });
    return { ok: true, message: 'telemetry is on' };
}

function disable() {
    const cfg = readConfig();
    writeConfig({ enabled: false, endpoint: cfg.endpoint || '', hostId: cfg.hostId || crypto.randomUUID() });
    return { ok: true, message: 'telemetry is off (the stored token was removed)' };
}

function parseArgs(argv) {
    const o = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--token-stdin') o.tokenStdin = true;
        else if (a.startsWith('--')) { o[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; }
        else o._ = (o._ || []).concat(a);
    }
    return o;
}

function readStdin() {
    try { return fs.readFileSync(0, 'utf8').trim(); } catch (_) { return ''; }
}

async function main(argv) {
    const verb = argv[0];
    const o = parseArgs(argv.slice(1));
    if (verb === 'send') {
        const r = await send({
            command: o.command || classifyCommand(o.first, o.second), exitCode: parseInt(o.exitCode, 10), durationMs: Number(o.durationMs), workstationDir: o.workstationDir,
        });
        debug(r.sent ? 'sent' : 'not sent (' + r.reason + ')');
        return 0;
    }
    if (verb === 'status') { process.stdout.write(status() + '\n'); return 0; }
    if (verb === 'enable') {
        const token = o.tokenStdin ? readStdin() : o.token;
        const r = enable({ endpoint: o.endpoint, token });
        (r.ok ? process.stdout : process.stderr).write(r.message + '\n');
        return r.ok ? 0 : 2;
    }
    if (verb === 'disable') { process.stdout.write(disable().message + '\n'); return 0; }
    process.stderr.write('usage: aegis-telemetry.js send|status|enable|disable\n');
    return 2;
}

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, () => { process.exitCode = 0; });
}

module.exports = { buildPayload, classifyCommand, vocabulary, languagesFromManifest, launcherVersion, send, status, enable, disable, osType, endpointError, DURATION_BOUNDS };
