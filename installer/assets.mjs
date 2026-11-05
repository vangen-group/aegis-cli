// Wizard page assets — inline strings, no dependencies (install-wizard T1,
// T2, T3). The browser never sends commands or paths: it only confirms the
// plan the server built and its telemetry opt-in. Security headers live in
// server.mjs. Dark theme, local font stacks only (CSP default-src 'self'),
// inspired by gentle-shell's install wizard: card layout, status pills for
// prerequisites, terminal-style plan/log, states always carry a text label.
export const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aegis CLI — Installation Wizard</title><link rel="stylesheet" href="/wizard.css"></head>
<body>
<main class="shell">
  <header class="masthead">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">A</span>
      <div class="brand-text">
        <h1>Aegis CLI</h1>
        <p class="brand-sub">Installation wizard &middot; local &middot; nothing leaves this machine</p>
      </div>
    </div>
    <span class="pill pill-info" id="phase">Reviewing plan</span>
  </header>

  <section class="card" aria-labelledby="prereqs-title">
    <h2 id="prereqs-title">Prerequisites</h2>
    <ul id="prereqs" class="prereqs"><li class="prereq"><span class="dot dot-unknown"></span>Checking your machine…</li></ul>
  </section>

  <section class="card" aria-labelledby="plan-title">
    <h2 id="plan-title">This installer will run exactly these steps</h2>
    <pre id="plan" class="terminal">loading…</pre>
  </section>

  <section class="card card-optin">
    <label class="optin">
      <input type="checkbox" id="telemetry">
      <span class="optin-body">
        <strong>Send anonymous usage statistics to Vangen</strong>
        <small>Opt-in and off by default. No code, paths, or secrets — just which commands are used.</small>
      </span>
    </label>
  </section>

  <section class="actions">
    <button id="confirm" class="btn btn-primary" disabled>Install Aegis CLI</button>
    <p id="next" class="next"></p>
  </section>

  <section class="card card-log" aria-labelledby="log-title" hidden>
    <h2 id="log-title">Installer output</h2>
    <pre id="log" class="terminal terminal-log"></pre>
  </section>
</main>
<script src="/wizard.js"></script></body></html>`;
export const JS = `const el=(id)=>document.getElementById(id);
const MARK={ok:'\\u2713',missing:'\\u2717',unknown:'\\u003F'};
const WORD={ok:'available',missing:'missing',unknown:'unknown'};
fetch('/api/plan').then(r=>r.json()).then(p=>{
  el('plan').textContent=p.steps.join('\\n');
  el('prereqs').innerHTML='';
  for(const q of p.prereqs||[]){
    const li=document.createElement('li');li.className='prereq';
    const dot=document.createElement('span');dot.className='dot dot-'+q.state;
    const text=document.createElement('span');
    text.innerHTML='<strong>'+q.label+'</strong> — <span class="state state-'+q.state+'">'+(WORD[q.state]||q.state)+'</span>'+
      (q.state==='ok'?'':'<small class="hint">'+q.hint+'</small>');
    li.append(dot,text);el('prereqs').append(li);
  }
  if(!(p.prereqs||[]).length)el('prereqs').innerHTML='<li class="prereq"><span class="dot dot-ok"></span><span><strong>No extra prerequisites on this platform.</strong></span></li>';
  el('next').textContent=p.next||'';
  el('confirm').disabled=false;
});
el('confirm').onclick=async()=>{
  el('confirm').disabled=true;el('confirm').textContent='Installing…';
  el('phase').textContent='Installing';el('phase').className='pill pill-run';
  document.querySelector('.card-log').hidden=false;
  await fetch('/api/confirm',{method:'POST',body:JSON.stringify({telemetry:el('telemetry').checked})});
  const t=setInterval(()=>fetch('/api/log').then(r=>r.text()).then(t2=>{el('log').textContent=t2;el('log').scrollTop=el('log').scrollHeight;
    const m=/INSTALL-FINISHED rc=(\\d+)/.exec(t2);
    if(m){clearInterval(t);
      if(m[1]==='0'){el('confirm').textContent='Installed \\u2713';el('phase').textContent='Installed';el('phase').className='pill pill-ok';}
      else{el('confirm').textContent='Failed \\u2014 check the output';el('phase').textContent='Failed';el('phase').className='pill pill-err';el('confirm').disabled=false;}}}),500);};`;
export const CSS = `:root{color-scheme:dark;
--bg:#0b0f0d;--bg-deep:#050807;--surface:#111815;--surface-1:#15201b;--surface-2:#1d2b24;
--border:#22322a;--border-soft:#ffffff12;--text:#eef5f1;--text-muted:#9db3a8;--text-faint:#6d8378;
--accent:#34d399;--accent-strong:#10b981;--accent-soft:#6ee7b7;
--warning:#e0c27a;--error:#ff718f;--info:#a9c7ee;
--radius:12px;--radius-lg:16px;--ease:cubic-bezier(.4,0,.2,1);
--glow:0 10px 30px #10b98140;--shadow:0 24px 60px #00000080,0 0 40px #10b98114;
--font-sans:Inter,"SF Pro Text",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
--font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono",monospace}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;background:
  radial-gradient(1200px 500px at 50% -10%,#10b9810f,transparent 60%),var(--bg);
  color:var(--text);font:16px/1.6 var(--font-sans);-webkit-font-smoothing:antialiased;
  display:flex;justify-content:center;padding:32px 16px 64px}
.shell{width:100%;max-width:46rem;display:flex;flex-direction:column;gap:18px}
.masthead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:14px}
.brand-mark{width:44px;height:44px;border-radius:var(--radius);display:grid;place-items:center;
  background:linear-gradient(135deg,var(--accent-strong),#0d8f66);color:#04120c;font-weight:800;font-size:1.3rem;
  box-shadow:var(--glow)}
.brand-text h1{margin:0;font-size:1.25rem;letter-spacing:-.01em}
.brand-sub{margin:0;font-size:.82rem;color:var(--text-muted)}
h2{margin:0 0 12px;font-size:.95rem;color:var(--text-muted);font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:20px 22px;box-shadow:var(--shadow)}
.terminal{margin:0;padding:14px 16px;background:var(--bg-deep);border:1px solid var(--border-soft);
  border-radius:var(--radius);font:13px/1.7 var(--font-mono);color:var(--accent-soft);
  white-space:pre-wrap;word-break:break-word;max-height:16rem;overflow:auto}
.terminal-log{color:#cfe9dd}
.prereqs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.prereq{display:flex;align-items:baseline;gap:10px}
.dot{width:9px;height:9px;border-radius:999px;flex:none;position:relative;top:-1px}
.dot-ok{background:var(--accent);box-shadow:0 0 8px #10b98180}
.dot-missing{background:var(--error)}
.dot-unknown{background:var(--warning)}
.state-ok{color:var(--accent)}.state-missing{color:var(--error)}.state-unknown{color:var(--warning)}
.hint{display:block;color:var(--text-faint);font-size:.85rem;margin-top:2px}
.card-optin{padding:14px 18px}
.optin{display:flex;gap:12px;cursor:pointer}
.optin input{width:18px;height:18px;accent-color:var(--accent-strong);margin-top:3px;flex:none}
.optin-body strong{display:block;font-size:.95rem}
.optin-body small{color:var(--text-muted)}
.actions{display:flex;flex-direction:column;align-items:center;gap:10px}
.btn{font:600 1rem var(--font-sans);padding:12px 28px;border-radius:999px;border:0;cursor:pointer;
  transition:transform .15s var(--ease),box-shadow .15s var(--ease)}
.btn-primary{background:linear-gradient(135deg,var(--accent-strong),#0d8f66);color:#04120c;box-shadow:var(--glow)}
.btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 36px #10b98160}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.next{margin:0;font-size:.9rem;color:var(--text-muted)}
.pill{font-size:.78rem;font-weight:600;padding:5px 12px;border-radius:999px;border:1px solid var(--border-soft)}
.pill-info{color:var(--info);background:#a9c7ee14}
.pill-run{color:var(--warning);background:#e0c27a14}
.pill-ok{color:var(--accent);background:#10b98114}
.pill-err{color:var(--error);background:#ff718f14}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
