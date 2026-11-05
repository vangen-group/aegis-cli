// Loopback install wizard host (install-wizard T1, S6). No dependencies.
// Fixed route allowlist; the browser never sends commands or paths — the
// plan is built here and only a confirm POST starts install.sh here.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { HTML, JS, CSS } from "./assets.mjs";

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
});
createServer((req, res) => {
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
    const child = spawn("bash", [installSh], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => (log += `\nINSTALL-FINISHED rc=${code}\n`));
    log += "starting install.sh...\n";
    return send(202, "started");
  }
  send(404, "not found");
}).listen(port, "127.0.0.1", () => console.log(`wizard ready: http://127.0.0.1:${port}`));
