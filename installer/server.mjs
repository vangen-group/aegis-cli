// Loopback install wizard host (install-wizard T1, S6). No dependencies.
// Fixed route allowlist; the browser never sends commands or paths — the
// plan is built here and only a confirm POST starts install.sh here.
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { HTML, JS, CSS } from "./assets.mjs";
import { collectPrereqs } from "./prereqs.cjs";
import { volumeState, verifyStep, PROVISIONING, paths } from "./volume.cjs";
import { runStep, cleanupTestVolume, isTest, provisionAllScript } from "./provision.cjs";
import { writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 7464);
// Loopback by default (S6). A dev environment may pass --host 0.0.0.0 to
// reach the wizard through a container port mapping.
const hostArg = args.indexOf("--host");
const host = hostArg === -1 ? "127.0.0.1" : args[hostArg + 1] || "127.0.0.1";
const installSh = process.env.AEGIS_INSTALLER_INSTALL_SH || dirname(fileURLToPath(import.meta.url)) + "/../install.sh";
const cookie = randomBytes(24).toString("hex");
let log = "";
const headers = {
  "Content-Security-Policy": "default-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
// T9: the plan is platform-specific. On Windows the .cmd relaunches inside
// WSL2, so a "linux" process there is really the WSL2 Ubuntu environment
// (detected via /proc/version) — its plan differs from a native Linux one.
// AEGIS_INSTALLER_PLATFORM overrides detection for tests and demos.
function detectPlatform() {
  if (process.env.AEGIS_INSTALLER_PLATFORM) return process.env.AEGIS_INSTALLER_PLATFORM;
  if (process.platform !== "linux") return process.platform;
  try {
    if (/microsoft/i.test(readFileSync("/proc/version", "utf8"))) return "windows-wsl";
  } catch {}
  return "linux";
}
const T = (es, en) => ({ es, en });
const COMMON = [
  {
    title: T("Descargar el release firmado", "Download the signed release"),
    needs: T("solo internet", "internet only"),
    detail: T("Trae el último tarball de aegis-cli desde GitHub (vangen-group/aegis-cli).",
              "Fetch the latest aegis-cli release tarball from GitHub (vangen-group/aegis-cli)."),
  },
  {
    title: T("Verificar todas las firmas", "Verify every signature"),
    needs: T("cosign v3.1.3 (pinned, lo baja install.sh)", "cosign v3.1.3 (pinned, downloaded by install.sh)"),
    detail: T("Si una verificación de firma falla, no se extrae ni se escribe nada. Falla cerrado.",
              "Nothing is extracted or written if a signature check fails. Fails closed."),
  },
];
const INSTALL_STEP = (where) => ({
  title: T("Instalar el CLI en ~/bin", "Install the CLI into ~/bin"),
  needs: T("permiso de escritura en ~/bin", "write access to ~/bin"),
  detail: T(`Copia el launcher de aegis a ~/bin ${where.es}. Si ya había una instalación la actualiza en el lugar — entornos, secretos y licencia quedan intactos.`,
            `Copies the aegis launcher into ~/bin ${where.en}. If a previous install exists it updates in place — environments, secrets and license are untouched.`),
});
const WORKSTATION_STEP = (where) => ({
  title: T("Después: levantar la workstation", "Then: bring up the workstation"),
  needs: T("Docker + virtualización — eso es lo que verifican los checks de arriba", "Docker + virtualization — that is what the checks above verify"),
  detail: T(`El CLI solo ya está listo tras el paso 3. Cuando corras 'aegis install <license-id>' descarga y ejecuta la imagen firmada de la workstation — ahí es donde se usan Docker y la virtualización. ${where.es}`,
            `The CLI alone is ready after step 3. When you run 'aegis install <license-id>' it downloads and runs the signed workstation image — that is where Docker and virtualization are used. ${where.en}`),
});
const PLANS = {
  "windows-wsl": {
    sections: [...COMMON,
      INSTALL_STEP({ es: "dentro de este entorno Ubuntu de WSL2 — nada se escribe en el host Windows; el host solo tuvo el zip",
                     en: "inside this WSL2 Ubuntu environment — nothing is written to the Windows host, the host only had the zip" }),
      WORKSTATION_STEP({ es: "Todo vive dentro del distro Ubuntu de WSL2; eliminar el distro elimina todo Aegis.",
                         en: "Everything lives inside the WSL2 Ubuntu distro; removing it removes all of Aegis." }),
    ],
    prereqsPlatform: "windows-wsl",
  },
  darwin: {
    sections: [...COMMON,
      INSTALL_STEP({ es: "(~/bin en macOS)", en: "(~/bin on macOS)" }),
      WORKSTATION_STEP({ es: "La workstation corre como contenedores en Docker Desktop en tu Mac.",
                         en: "The workstation runs as containers in Docker Desktop on your Mac." }),
    ],
    prereqsPlatform: "darwin",
  },
  linux: {
    sections: [...COMMON,
      INSTALL_STEP({ es: "en tu máquina Linux", en: "on your Linux machine" }),
      WORKSTATION_STEP({ es: "La workstation corre como contenedores en tu Docker Engine.",
                         en: "The workstation runs as containers in your Docker Engine." }),
    ],
    prereqsPlatform: "linux",
  },
};
const PLATFORM = detectPlatform();
// i18n: the language cookie decides hints and UI strings. Spanish is the
// default (owner decision); the wizard's toggle sets the cookie and reloads.

const planLang = (cookieHeader) => /(?:^|;)\s*aegis_lang=en(?:;|$)/.test(cookieHeader || "") ? "en" : "es";
const plan = (lang) => {
  const p = PLANS[PLATFORM] || PLANS.linux;
  const pick = (t) => (typeof t === "object" ? t[lang] || t.en : t);
  const sections = p.sections.map((sec) => ({
    title: pick(sec.title), needs: pick(sec.needs), detail: pick(sec.detail),
  }));
  const vol = volumeState();
  if (vol.state === "missing") {
    // The volume stage comes BEFORE the CLI install (owner decision): the
    // client provisions first, then installs.
    sections.splice(2, 0, {
      title: lang === "es" ? "Crear tu volumen seguro LUKS" : "Create your secure LUKS volume",
      needs: lang === "es" ? "una frase de paso (solo tuya, se escribe en la consola)" : "a passphrase (yours only, typed in the console)",
      detail: lang === "es"
        ? "El wizard ejecuta los 5 pasos de aprovisionamiento (imagen, loop, formato LUKS, montaje) — la frase de paso se escribe SOLO en la consola y nunca atraviesa el wizard."
        : "The wizard runs the 5 provisioning steps (image, loop, LUKS format, mount) — the passphrase is typed ONLY in the console and never crosses the wizard.",
    });
  }
  return {
    platform: PLATFORM,
    lang,
    sections,
    steps: [
      `bash ${installSh}   # download the latest signed aegis-cli release,`,
      "                   # verify it with cosign, then install into ~/bin",
    ],
    prereqs: collectPrereqs({ platform: p.prereqsPlatform, lang }),
    next: "after installing, run: aegis install <license-id>",
  };
};
// T3: the telemetry opt-in chosen on the last screen is persisted next to
// the server so the release tooling can read it. Default is off.
const bundleDir = dirname(fileURLToPath(import.meta.url)) + "/";
const writeTelemetryChoice = (optIn) => {
  try {
    writeFileSync(`${bundleDir}telemetry-choice.json`, JSON.stringify({ telemetry: optIn === true, at: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (code, body, type = "text/plain") => {
    res.writeHead(code, { ...headers, "Content-Type": type });
    res.end(body);
  };
  const auth = (req.headers.cookie || "").includes(`aegis_install=${cookie}`);
  const isPage = url.pathname === "/" || url.pathname === "/wizard.js" || url.pathname === "/wizard.css";
  if (!auth && isPage) {
    // No session, or a stale one (server restarted while the tab stayed
    // open): re-issue a fresh session instead of locking the tab out. API
    // routes keep the 403 — only a confirmed session can start the install.
    res.writeHead(200, { ...headers, "Content-Type": "text/html", "Set-Cookie": `aegis_install=${cookie}; HttpOnly; SameSite=Strict` });
    return res.end(HTML);
  }
  if (!auth) return send(403, "forbidden");
  if (url.pathname === "/") return send(200, HTML, "text/html; charset=utf-8");
  if (url.pathname === "/wizard.js") return send(200, JS, "text/javascript");
  if (url.pathname === "/wizard.css") return send(200, CSS, "text/css");
  if (url.pathname === "/api/plan") return send(200, JSON.stringify(plan(planLang(req.headers.cookie))), "application/json");
  if (url.pathname === "/api/log") return send(200, log);
  // T4: LUKS secure volume — state detection and READ-ONLY verification of
  // the provisioning steps. The passphrase never touches this server.
  if (url.pathname === "/api/volume/state") {
    // S8 supersedes the old dev-only gate: clients DO provision — the wizard
    // executes the steps for them (stdio inherit). Everyone gets the list;
    // the dev flag only kept the old read-only flow around.
    return send(200, JSON.stringify({
      ...volumeState(),
      provisioning: PROVISIONING().map((p) => ({ id: p.id, text: p[planLang(req.headers.cookie)] || p.en })),
    }), "application/json");
  }
  // T14: provision ALL steps sequentially, install-style: one POST, markers
  // logged per step (the volume progress endpoint parses them), stdin
  // inherited so cryptsetup/sudo prompt the user DIRECTLY on the console.
  // T14b: ONE sudo session for the whole provisioning — repeated per-step
  // sudo prompts raced with the log piping and broke authentication. The
  // root script echoes [step] markers; the passphrase dialog runs on the
  // console as the user (provisionAllScript), never through this server.
  if (url.pathname === "/api/volume/provision-all" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let consent = false;
      try { consent = JSON.parse(body || "{}").consent === true; } catch {}
      // One run at a time; a FAILED run may be retried (it rolled back).
      const last = log.slice(log.lastIndexOf("provision-all running"));
      if (log.includes("provision-all running") && !/provision-all failed/.test(last)) return send(409, "already running");
      send(202, "started");
      const lang = planLang(req.headers.cookie);
      log += "provision-all running\n";
      const script = provisionAllScript({ consent, lang });
      // The dialog owns the console (stdin/stdout/stderr inherited, so it is
      // the terminal's foreground job); markers and root output arrive on
      // fd 3. It runs as the user — only its root half uses sudo -n.
      const child = spawn("sh", ["-c", script], { stdio: ["inherit", "inherit", "inherit", "pipe"] });
      child.stdio[3]?.on("data", (d) => (log += d));
      child.on("close", (code) => {
        log += code === 0 ? "provision-all done\n" : `provision-all failed (rc=${code})\n`;
      });
      return;
    });
    return;
  }
  // Volume progress: same marker protocol, volume step ids.
  if (url.pathname === "/api/volume/progress") {
    const VSTEPS = [
      ["create-image", { es: "Crear la imagen", en: "Create the image" }],
      ["associate-loop", { es: "Asociar el dispositivo loop", en: "Associate the loop device" }],
      ["format-luks", { es: "Formatear LUKS (frase de paso en la consola)", en: "Format LUKS (passphrase on the console)" }],
      ["open-mount", { es: "Abrir, formatear y montar", en: "Open, format and mount" }],
    ];
    const lang = planLang(req.headers.cookie);
    // Only the latest run counts (a retried run starts a fresh marker trail).
    const run = log.slice(Math.max(0, log.lastIndexOf("provision-all running")));
    const finishedIds = [...run.matchAll(/\[step\] (?:finished|skipped) ([a-z-]+)/g)].map((m) => m[1]);
    const startedIds = [...run.matchAll(/\[step\] started ([a-z-]+)/g)].map((m) => m[1]);
    // UX: the banner shows ONLY while the console is really waiting for the
    // user ([await] passphrase … [await] done), not for the whole step.
    const failedRun = /provision-all failed/.test(run);
    const awaiting = !failedRun && run.lastIndexOf("[await] passphrase") > run.lastIndexOf("[await] done");
    const consolePrompt = awaiting ? {
      es: "Tu consola te está esperando: escribí tu frase de paso y repetila. No se ve al escribir — es normal.",
      en: "Your console is waiting: type your passphrase and repeat it. Nothing shows as you type — that is expected.",
    }[lang] || null : null;
    const reason = (run.match(/\[fail\] ([a-z-]+)/g) || []).pop()?.slice(7);
    const FAIL_TEXT = {
      passphrase: { es: "Las frases no coincidieron o eran muy cortas. Tocá Reintentar.", en: "The passphrases did not match or were too short. Press Retry." },
      consent: { es: "Falta tu consentimiento para formatear.", en: "Formatting consent is missing." },
      exists: { es: "Ya existe una imagen del volumen: no se tocó. Recargá la página para ver sus opciones.", en: "A volume image already exists: it was left untouched. Reload the page to see its options." },
      sudo: { es: "Tu sesión de sudo no está activa: cerrá el instalador y volvé a abrirlo.", en: "Your sudo session is not active: close the installer and open it again." },
      loop: { es: "No se pudo asociar el dispositivo loop. No se formateó nada; tocá Reintentar.", en: "Could not associate the loop device. Nothing was formatted; press Retry." },
    };
    // Unknown failure: show the root tool's own last message (its stderr
    // arrives on the same pipe) instead of pointing the user elsewhere.
    const detail = run.split("\n").map((l) => l.trim()).filter((l) => l && !/^(\[|provision-all|LOOP=)/.test(l)).pop() || "";
    const error = failedRun ? (FAIL_TEXT[reason]?.[lang] || (lang === "es" ? "Falló un paso" : "A step failed") + (detail ? ": " + detail.slice(0, 200) : ".")) : null;
    const steps = VSTEPS.map(([id, l]) => ({
      id, label: l[lang] || l.en,
      status: finishedIds.includes(id) ? "done" : startedIds.includes(id) ? (failedRun ? "failed" : "running") : "pending",
    }));
    const done = steps.filter((x) => x.status === "done").length;
    return send(200, JSON.stringify({ steps, done, total: steps.length, running: run.startsWith("provision-all running") && !run.includes("provision-all done") && !failedRun, consolePrompt, error }), "application/json");
  }
  // T12 (S8): run a provisioning step FOR the client. stdio inherit means
  // cryptsetup/sudo prompt the user DIRECTLY in the installer console — the
  // passphrase never crosses the browser or this server.
  if (url.pathname === "/api/volume/provision" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let step = "", consent = false;
      try { const b = JSON.parse(body || "{}"); step = b.step || ""; consent = b.consent === true; } catch {}
      // stdin inherited (cryptsetup/sudo prompts are answered on the TTY),
      // stdout/stderr piped so the browser console dock shows the progress.
      // T13 fix: the loop device only exists AFTER associate-loop runs —
      // resolve it live instead of using the <LOOP> placeholder.
      let env = process.env;
      if (step === "format-luks" || step === "open-mount") {
        try {
          const { img } = paths();
          const loop = execFileSync("sudo", ["losetup", "-j", img, "--output", "NAME", "--noheadings"], { encoding: "utf8" }).split("\n")[0].trim();
          if (loop) {
            // The argv is built from this env (provision.cjs commandsFor),
            // so it must be set on the process, not just the child.
            process.env.AEGIS_VOLUME_LOOP = loop;
            env = { ...process.env, AEGIS_VOLUME_LOOP: loop };
          }
        } catch {}
      }
      const r = runStep(step, { consent, spawnFn: (argv, opts) => {
        const child = spawn(argv[0], argv.slice(1), { stdio: ["inherit", "pipe", "pipe"], env });
        child.stdout?.on("data", (d) => (log += d));
        child.stderr?.on("data", (d) => (log += d));
        child.on("close", (code) => (log += `[step] ${step} exit ${code}\n`));
        return child;
      } });
      if (!r.ok) return send(400, r.error || "refused");
      return send(202, JSON.stringify({ step, started: true }), "application/json");
    });
    return;
  }
  // T13: remove the TEST volume (umount + luksClose + losetup -d + rm) —
  // guarded inside cleanupTestVolume to refuse any non-test path.
  if (url.pathname === "/api/volume/cleanup" && req.method === "POST") {
    const r = cleanupTestVolume({ spawnFn: (argv, opts) => spawn(argv[0], argv.slice(1), opts) });
    if (!r.ok) return send(400, r.error || "refused");
    return send(202, JSON.stringify({ cleanup: true }), "application/json");
  }
  if (url.pathname === "/api/volume/verify" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let id = "";
      try { id = JSON.parse(body || "{}").step || ""; } catch {}
      if (!PROVISIONING().some((p) => p.id === id)) return send(400, "unknown step");
      const r = verifyStep(id);
      return send(200, JSON.stringify({ step: id, ...r }), "application/json");
    });
    return;
  }
  if (url.pathname === "/api/progress") {
    // T10: install.sh logs an explicit [step] started/finished protocol; the
    // first started-but-not-finished step is running (gentle-shell's rule).
    const lang = planLang(req.headers.cookie);
    const STEPS = [
      ["resolve-platform", ["Resolver la plataforma", "Resolve platform"]],
      ["acquire-cosign", ["Obtener cosign v3.1.3 (verificado por checksum)", "Get cosign v3.1.3 (checksum-verified)"]],
      ["resolve-release", ["Resolver el release", "Resolve the release"]],
      ["download", ["Descargar el release firmado de aegis-cli", "Download the signed aegis-cli release"]],
      ["verify", ["Verificar todas las firmas", "Verify every signature"]],
      ["extract-install", ["Instalar el CLI en ~/bin", "Install the CLI into ~/bin"]],
    ].map(([id, l]) => [id, l[lang] || l[1]]);
    // S7: a resumed run logs 'skipped <id>' for steps the journal already
    // finished — those count as done too.
    const finishedIds = [...log.matchAll(/\[step\] (?:finished|skipped) ([a-z-]+)/g)].map((m) => m[1]);
    const startedIds = [...log.matchAll(/\[step\] started ([a-z-]+)/g)].map((m) => m[1]);
    const steps = STEPS.map(([id, label]) => ({
      id, label,
      status: finishedIds.includes(id) ? "done" : startedIds.includes(id) ? "running" : "pending",
    }));
    const done = steps.filter((x) => x.status === "done").length;
    const finished = /INSTALL-FINISHED rc=(\d+)/.exec(log);
    return send(200, JSON.stringify({
      steps, done, total: steps.length,
      finished: Boolean(finished),
      outcome: finished ? (finished[1] === "0" ? "ok" : "failed") : null,
    }), "application/json");
  }
  if (url.pathname === "/api/confirm" && req.method === "POST") {
    if (log) return send(409, "already started");
    let telemetry = false;
    try {
      const body = await new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => resolve(d));
        req.on("error", () => resolve(""));
      });
      telemetry = JSON.parse(body || "{}").telemetry === true;
    } catch {
      return send(400, "bad body");
    }
    writeTelemetryChoice(telemetry);
    const child = spawn("bash", [installSh], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => (log += `\nINSTALL-FINISHED rc=${code}\n`));
    log += "starting install.sh...\n";
    return send(202, "started");
  }
  send(404, "not found");
}).listen(port, host, () => console.log(`wizard ready: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`));
