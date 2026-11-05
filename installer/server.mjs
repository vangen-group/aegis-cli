// Loopback install wizard host (install-wizard T1, S6). No dependencies.
// Fixed route allowlist; the browser never sends commands or paths — the
// plan is built here and only a confirm POST starts install.sh here.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { HTML, JS, CSS } from "./assets.mjs";
import { collectPrereqs } from "./prereqs.cjs";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 7464);
// Loopback by default (S6). A dev environment may pass --host 0.0.0.0 to
// reach the wizard through a container port mapping.
const hostArg = args.indexOf("--host");
const host = hostArg === -1 ? "127.0.0.1" : args[hostArg + 1] || "127.0.0.1";
const installSh = process.env.AEGIS_INSTALLER_INSTALL_SH || "install.sh";
const cookie = randomBytes(24).toString("hex");
let log = "";
const headers = {
  "Content-Security-Policy": "default-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const plan = () => ({
  // Structured sections: each names WHAT happens and why it needs what.
  // The CLI itself needs nothing but network — Docker/virtualization are
  // requirements of the workstation image, pulled by the NEXT journey.
  sections: [
    {
      title: "Download the signed release",
      needs: "internet only",
      detail: "Fetch the latest aegis-cli release tarball from GitHub (vangen-group/aegis-cli).",
    },
    {
      title: "Verify every signature",
      needs: "cosign v3.1.3 (pinned, downloaded by install.sh)",
      detail: "Nothing is extracted or written if a signature check fails. Fails closed.",
    },
    {
      title: "Install the CLI into ~/bin",
      needs: "write access to ~/bin",
      detail: "Copies the aegis launcher. If a previous install exists it updates in place — environments, secrets and license are untouched.",
    },
    {
      title: "Then: bring up the workstation",
      needs: "Docker + virtualization — that is what the checks above verify",
      detail: "The CLI alone is ready after step 3. When you run 'aegis install <license-id>' it downloads and runs the signed workstation image — that is where Docker and virtualization are used.",
    },
  ],
  steps: [
    `bash ${installSh}   # download the latest signed aegis-cli release,`,
    "                   # verify it with cosign, then install into ~/bin",
  ],
  prereqs: collectPrereqs(),
  next: "after installing, run: aegis install <license-id>",
});
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
  if (url.pathname === "/api/plan") return send(200, JSON.stringify(plan()), "application/json");
  if (url.pathname === "/api/log") return send(200, log);
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
