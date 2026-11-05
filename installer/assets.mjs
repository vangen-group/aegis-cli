// Wizard page assets — inline strings, no dependencies (install-wizard T1,
// T2, T3). The browser never sends commands or paths: it only confirms the
// plan the server built and its telemetry opt-in. Security headers live in
// server.mjs.
export const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Aegis CLI Installer</title><link rel="stylesheet" href="/wizard.css"></head>
<body><h1>Aegis CLI</h1><p>Prerequisites:</p><pre id="prereqs"></pre>
<p>This installer will run exactly these steps:</p>
<pre id="plan">loading…</pre>
<label><input type="checkbox" id="telemetry"> Send anonymous usage statistics to Vangen (opt-in, off by default)</label><br>
<button id="confirm" disabled>Install</button>
<p id="next"></p>
<pre id="log"></pre>
<script src="/wizard.js"></script></body></html>`;
export const JS = `const el=(id)=>document.getElementById(id);
fetch('/api/plan').then(r=>r.json()).then(p=>{
  el('plan').textContent=p.steps.join('\\n');
  el('prereqs').textContent=(p.prereqs||[]).map(q=>{
    const mark=q.state==='ok'?'[ok]':q.state==='missing'?'[X]':'[?]';
    return q.state==='ok'?mark+' '+q.label:mark+' '+q.label+' — '+q.hint;}).join('\\n');
  el('next').textContent=p.next||'';
  el('confirm').disabled=false;
});
el('confirm').onclick=async()=>{el('confirm').disabled=true;
  await fetch('/api/confirm',{method:'POST',body:JSON.stringify({telemetry:el('telemetry').checked})});
  const t=setInterval(()=>fetch('/api/log').then(r=>r.text()).then(t2=>{el('log').textContent=t2;
    if(t2.includes('INSTALL-FINISHED'))clearInterval(t);}),500);};`;
export const CSS = `body{font-family:monospace;max-width:52rem;margin:2rem auto;padding:0 1rem}
pre{background:#111;color:#0e0;padding:1rem;overflow:auto}
button{font-size:1.1rem;padding:.4rem 1.2rem}
p#next{color:#070;font-weight:bold}`;
