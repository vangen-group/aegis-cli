// install-wizard T2: platform prerequisite detection with injectable runner
// so tests never probe the real machine. CommonJS on purpose: the launcher
// node may be old; keep the installer server surface CJS/ESM consistent
// (server.mjs imports only this file and assets.mjs).
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const HINTS = {
    virtualization:
        'enable virtualization in your BIOS/UEFI firmware (Intel VT-x / AMD-V), then run this installer again',
    wsl2: 'in an Administrator PowerShell run: dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart && dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart && wsl --update && wsl --set-default-version 2 — then RESTART Windows and verify with wsl --status (Default Version: 2). Docker Desktop needs this backend',
};

// Returns [{id,label,state:'ok'|'missing'|'unknown',hint}]. Never throws.
function collectPrereqs({ platform = process.platform, runner } = {}) {
    const run = runner || ((cmd, args) => {
        try {
            return { status: 0, stdout: execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000 }), stderr: '' };
        } catch (e) {
            return { status: e.status ?? 1, stdout: e.stdout || '', stderr: e.stderr || String(e.message || e) };
        }
    });
    if (platform === 'darwin') return []; // macOS needs no virtualization/WSL check.
    const check = (id, label, probe) => {
        let state = 'unknown';
        try {
            const r = probe(run);
            state = r ? 'ok' : 'missing';
        } catch {
            state = 'unknown';
        }
        return { id, label, state, hint: HINTS[id] };
    };
    if (platform === 'win32') {
        return [
            check('virtualization', 'Virtualization enabled in firmware', (r) =>
                /VirtualizationEnabledInFirmware\s*:\s*True/i.test(
                    r('powershell.exe', ['-NoProfile', '-Command', '(Get-ComputerInfo).HyperVRequirementVirtualizationFirmwareEnabled']).stdout
                )
            ),
            check('wsl2', 'WSL2 installed', (r) => r('wsl.exe', ['--status']).status === 0),
        ];
    }
    // Linux: the workstation later needs KVM for the sandbox.
    return [check('virtualization', 'KVM available', (r) => fs.existsSync('/dev/kvm') && r('test', ['-w', '/dev/kvm']).status === 0)];
}

module.exports = { collectPrereqs };
