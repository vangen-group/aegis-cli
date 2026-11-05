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
  if (url.pathname === "/" && auth === false && !req.headers.cookie) {
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
}).listen(port, "127.0.0.1", () => console.log(`wizard ready: http://127.0.0.1:${port}`));
