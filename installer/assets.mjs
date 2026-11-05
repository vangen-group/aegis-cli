// Wizard page assets — inline strings, no dependencies (install-wizard T1).
// The browser never sends commands or paths: it only confirms the plan the
// server built. Security headers live in server.mjs.
export const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Aegis CLI Installer</title><link rel="stylesheet" href="/wizard.css"></head>
<body><h1>Aegis CLI</h1><p>This installer will run exactly these steps:</p>
<pre id="plan">loading…</pre>
<button id="confirm" disabled>Install</button>
<pre id="log"></pre>
<script src="/wizard.js"></script></body></html>`;
export const JS = `const el=(id)=>document.getElementById(id);
fetch('/api/plan').then(r=>r.json()).then(p=>{el('plan').textContent=p.steps.join('\\n');el('confirm').disabled=false;});
el('confirm').onclick=async()=>{el('confirm').disabled=true;
  await fetch('/api/confirm',{method:'POST'});
  const t=setInterval(()=>fetch('/api/log').then(r=>r.text()).then(t2=>{el('log').textContent=t2;
    if(t2.includes('INSTALL-FINISHED'))clearInterval(t);}),500);};`;
export const CSS = `body{font-family:monospace;max-width:52rem;margin:2rem auto;padding:0 1rem}
pre{background:#111;color:#0e0;padding:1rem;overflow:auto}
button{font-size:1.1rem;padding:.4rem 1.2rem}`;
