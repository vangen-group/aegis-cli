// install-wizard T2/T6/T7: platform prerequisite detection with injectable
// runner so tests never probe the real machine. AEGIS_INSTALLER_DEMO=1
// simulates everything green so the full wizard flow can be walked without
// the real prerequisites. CommonJS on purpose: the launcher node may be old.
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const HINTS = {
    virtualization: {
        es: 'habilitá la virtualización en el BIOS/UEFI (Intel VT-x / AMD-V) y volvé a correr este instalador',
        en: 'enable virtualization in your BIOS/UEFI firmware (Intel VT-x / AMD-V), then run this installer again',
    },
    wsl2: {
        es: 'en PowerShell como Administrador ejecutá: dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart && dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart && wsl --update && wsl --set-default-version 2 — después REINICIÁ Windows y verificá con wsl --status (Default Version: 2). Docker Desktop necesita este backend',
        en: 'in an Administrator PowerShell run: dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart && dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart && wsl --update && wsl --set-default-version 2 — then RESTART Windows and verify with wsl --status (Default Version: 2). Docker Desktop needs this backend',
    },
    docker: {
        es: 'instalá Docker Desktop (docker.com) — en Windows activá primero el backend WSL2; después abrilo y volvé a correr este instalador',
        en: 'install Docker Desktop (docker.com) — on Windows enable the WSL2 backend first; then start it and run this installer again',
    },
    dockerLinux: {
        es: 'instalá Docker Engine para tu distribución (docs.docker.com/engine/install) y arrancá el servicio, después volvé a correr este instalador',
        en: 'install Docker Engine for your distribution (docs.docker.com/engine/install) and start the service, then run this installer again',
    },
    aegis: {
        es: 'ya está instalado — el instalador lo actualiza en el lugar (tus entornos, secretos y licencia quedan intactos)',
        en: 'already installed — the installer will update it in place (your environments, secrets and license are untouched)',
    },
};

// docker info answers both "installed" and "running" in one probe.
const dockerProbe = (r) => r('docker', ['info']).status === 0;

// T7: an existing aegis install is information, not a blocker. install.sh
// reinstalls flat into ~/bin, leaving every config/secrets file untouched.
const SHIPPED_VERSION = (() => {
    // The version THIS installer ships, stamped at bundle build time
    // (VERSION travels next to install.sh). In-repo runs read the repo's.
    try {
        return fs.readFileSync(require('node:path').join(__dirname, '..', 'VERSION'), 'utf8').trim().split(/\s/)[0];
    } catch {
        return '';
    }
})();
const aegisCheck = (r, lang = 'es') => {
    const out = r('aegis', ['--version']);
    if (out.status !== 0) {
        return { ok: true, label: lang === 'es' ? `Aegis CLI todavía no está instalado — este instalador instala ${SHIPPED_VERSION || 'la última release'}` : `Aegis CLI not installed yet — this installer installs ${SHIPPED_VERSION || 'the latest release'}` };
    }
    // NOTE: 'aegis --version' reports the WORKSTATION launcher version, not
    // the CLI release — say so, and name the version this installer ships.
    const installed = out.stdout.trim().replace(/^aegis\s*/i, '');
    const ships = SHIPPED_VERSION ? ` — this installer ships CLI ${SHIPPED_VERSION}` : '';
    if (lang === 'es') {
        return { ok: true, state: 'info', label: `Aegis launcher ${installed} instalado — este instalador trae CLI ${SHIPPED_VERSION || 'la última release'} y actualiza en el lugar; nada tuyo se toca` };
    }
    return { ok: true, state: 'info', label: `Aegis launcher ${installed} installed — this installer ships CLI ${SHIPPED_VERSION || 'the latest release'} and updates in place; nothing of yours is touched` };
};

// Returns [{id,label,state:'ok'|'missing'|'unknown'|'info',hint}]. Never throws.
function collectPrereqs({ platform = process.platform, runner, lang = 'es', demo = process.env.AEGIS_INSTALLER_DEMO === '1' } = {}) {
    const hintOf = (id) => (HINTS[id] && (HINTS[id][lang] || HINTS[id].en)) || '';
    if (demo) {
        return [
            { id: 'virtualization', label: { es: 'Virtualización activa en el firmware', en: 'Virtualization enabled in firmware' }, state: 'ok', hint: HINTS.virtualization[lang] || HINTS.virtualization.en },
            { id: 'wsl2', label: 'WSL2 installed', state: 'ok', hint: HINTS.wsl2[lang] || HINTS.wsl2.en },
            { id: 'docker', label: { es: 'Docker Desktop corriendo', en: 'Docker Desktop running' }, state: 'ok', hint: HINTS.docker[lang] || HINTS.docker.en },
            { id: 'aegis', label: 'Aegis CLI 0.0.0-demo is already installed — the installer updates it in place', state: 'info', hint: HINTS.aegis },
        ];
    }
    const run = runner || ((cmd, args) => {
        try {
            return { status: 0, stdout: execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000 }), stderr: '' };
        } catch (e) {
            return { status: e.status ?? 1, stdout: e.stdout || '', stderr: e.stderr || String(e.message || e) };
        }
    });
    const check = (id, label, probe, hint) => {
        const lab = label && typeof label === 'object' ? (label[lang] || label.en) : label;
        let state = 'unknown';
        let resolvedLabel = label;
        try {
            const r = probe(run);
            state = r.state || (r ? 'ok' : 'missing');
            if (r.label) resolvedLabel = r.label;
        } catch {
            state = 'unknown';
        }
        return { id, label: lab || resolvedLabel, state, hint: hintOf(id) || hint };
    };
    if (platform === 'windows-wsl') {
        // The .cmd relaunched us inside the WSL2 Ubuntu distro: virtualization
        // is already proven (we would not be here otherwise) and /dev/kvm is
        // not exposed to WSL2 guests, so demanding it here would block every
        // valid setup. Docker (Desktop with WSL2 backend, or Engine) is the
        // real requirement.
        return [
            {
                id: 'virtualization',
                label: lang === 'es'
                    ? 'Virtualización activa — estás corriendo dentro de WSL2'
                    : 'Virtualization is active — you are running inside WSL2',
                state: 'ok',
                hint: hintOf('virtualization'),
            },
            check('docker', 'Docker Desktop running (WSL2 backend)', dockerProbe, HINTS.docker),
            check('aegis', '', (r) => aegisCheck(r, lang), hintOf('aegis')),
        ];
    }
    if (platform === 'darwin') {
        // macOS needs no virtualization/WSL check — Docker Desktop only.
        return [check('docker', { es: 'Docker Desktop corriendo', en: 'Docker Desktop running' }, dockerProbe), check('aegis', '', (r) => aegisCheck(r, lang), hintOf('aegis'))];
    }
    if (platform === 'win32') {
        return [
            check('virtualization', { es: 'Virtualización activa en el firmware', en: 'Virtualization enabled in firmware' }, (r) =>
                /VirtualizationEnabledInFirmware\s*:\s*True/i.test(
                    r('powershell.exe', ['-NoProfile', '-Command', '(Get-ComputerInfo).HyperVRequirementVirtualizationFirmwareEnabled']).stdout
                )
            ),
            check('wsl2', { es: 'WSL2 instalado', en: 'WSL2 installed' }, (r) => r('wsl.exe', ['--status']).status === 0),
            check('docker', { es: 'Docker Desktop corriendo', en: 'Docker Desktop running' }, dockerProbe),
            check('aegis', '', (r) => aegisCheck(r, lang), hintOf('aegis')),
        ];
    }
    // Linux: the workstation later needs KVM for the sandbox, and Docker
    // Engine (not Docker Desktop — that product does not exist here).
    return [
        check('virtualization', { es: 'KVM disponible', en: 'KVM available' }, (r) => fs.existsSync('/dev/kvm') && r('test', ['-w', '/dev/kvm']).status === 0),
        check('docker', { es: 'Docker Engine corriendo', en: 'Docker Engine running' }, dockerProbe, HINTS.dockerLinux),
        check('aegis', '', (r) => aegisCheck(r, lang), hintOf('aegis')),
    ];
}

module.exports = { collectPrereqs };
