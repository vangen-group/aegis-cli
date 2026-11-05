// Wizard page assets — inline strings, no dependencies (install-wizard T1,
// T2, T3, T6). The browser never sends commands or paths: it only confirms
// the plan the server built and its telemetry opt-in. Security headers live
// in server.mjs. Dark theme, local font stacks only (CSP default-src
// 'self'), inspired by gentle-shell's install wizard: staged stepper,
// console + progress side by side, status pills, text labels on every state.
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
    <span class="pill pill-info" id="phase">Stage 1 · Requirements</span>
  </header>

  <ol class="stepper" id="stepper">
    <li class="stage stage-active" data-stage="1"><span class="stage-num">1</span><span class="stage-label">Requirements</span></li>
    <li class="stage" data-stage="2"><span class="stage-num">2</span><span class="stage-label">Review plan</span></li>
    <li class="stage" data-stage="3"><span class="stage-num">3</span><span class="stage-label">Install</span></li>
    <li class="stage" data-stage="4"><span class="stage-num">4</span><span class="stage-label">Done</span></li>
  </ol>

  <section class="card" id="card-reqs" aria-labelledby="prereqs-title">
    <h2 id="prereqs-title">Requirements on this machine</h2>
    <ul id="prereqs" class="prereqs"><li class="prereq"><span class="dot dot-unknown"></span>Checking your machine…</li></ul>
    <div class="stage-nav">
      <button id="to-plan" class="btn btn-primary" disabled>Review the plan</button>
      <p class="stage-note" id="reqs-note">Waiting for checks…</p>
    </div>
  </section>

  <section class="card" id="card-plan" aria-labelledby="plan-title" hidden>
    <h2 id="plan-title">This installer will run exactly these steps</h2>
    <pre id="plan" class="terminal">loading…</pre>
    <section class="card card-optin">
      <label class="optin">
        <input type="checkbox" id="telemetry">
        <span class="optin-body">
          <strong>Send anonymous usage statistics to Vangen</strong>
          <small>Opt-in and off by default. No code, paths, or secrets — just which commands are used.</small>
        </span>
      </label>
    </section>
    <div class="stage-nav">
      <button id="back" class="btn btn-ghost">Back</button>
      <button id="confirm" class="btn btn-primary" disabled>Install Aegis CLI</button>
    </div>
  </section>

  <section class="card" id="card-run" aria-labelledby="run-title" hidden>
    <h2 id="run-title">Installing</h2>
    <div class="run-grid">
      <div class="run-progress">
        <div class="progress" role="progressbar" aria-label="Install progress"><div class="bar" id="bar"></div></div>
        <p class="progress-label" id="progress-label">Starting…</p>
        <p id="next" class="next"></p>
        <div class="run-actions">
          <button id="done" class="btn btn-primary" hidden>Finish</button>
          <button id="retry" class="btn btn-ghost" hidden>Back to the plan</button>
        </div>
      </div>
      <pre id="log" class="terminal console" aria-label="Installer output"></pre>
    </div>
  </section>
</main>
<script src="/wizard.js"></script></body></html>`;
export const JS = `const el=(id)=>document.getElementById(id);
const MARK={ok:'\\u2713',missing:'\\u2717',unknown:'\\u003F'};
const WORD={ok:'available',missing:'missing',unknown:'unknown'};
let BLOCKERS=0;
function go(stage){
  document.querySelectorAll('.stage').forEach(s=>{
    const n=+s.dataset.stage;
    s.classList.toggle('stage-active',n===stage);
    s.classList.toggle('stage-done',n<stage);
  });
  el('phase').textContent=['','Stage 1 \\u00b7 Requirements','Stage 2 \\u00b7 Review plan','Stage 3 \\u00b7 Installing','Stage 4 \\u00b7 Done'][stage];
  el('phase').className='pill '+(stage===4?'pill-ok':stage===3?'pill-run':'pill-info');
  el('card-reqs').hidden=stage!==1;
  el('card-plan').hidden=stage!==2;
  el('card-run').hidden=stage!==3&&stage!==4;
}
function startRun(){
  go(3);
  el('bar').style.width='8%';el('bar').classList.add('bar-run');
  el('progress-label').textContent='Running install.sh…';
  fetch('/api/confirm',{method:'POST',body:JSON.stringify({telemetry:el('telemetry').checked})});
  let lines=0;
  const t=setInterval(()=>fetch('/api/log').then(r=>r.text()).then(t2=>{
    el('log').textContent=t2;el('log').scrollTop=el('log').scrollHeight;
    const n=t2.split('\\n').length;
    if(n>lines)el('bar').style.width=Math.min(92,8+n*2)+'%';
    lines=n;
    const m=/INSTALL-FINISHED rc=(\\d+)/.exec(t2);
    if(m){clearInterval(t);
      el('bar').style.width='100%';el('bar').classList.remove('bar-run');
      if(m[1]==='0'){go(4);el('progress-label').textContent='Aegis CLI is installed.';
        el('phase').textContent='Installed';el('phase').className='pill pill-ok';
        el('done').hidden=false;}
      else{el('bar').classList.add('bar-error');
        el('progress-label').textContent='The installer failed \\u2014 read the console.';
        el('phase').textContent='Failed';el('phase').className='pill pill-err';
        el('retry').hidden=false;}
    }}),400);
}
fetch('/api/plan').then(r=>r.json()).then(p=>{
  el('plan').textContent=p.steps.join('\\n');
  el('prereqs').innerHTML='';
  BLOCKERS=0;
  for(const q of p.prereqs||[]){
    if(q.state!=='ok')BLOCKERS++;
    const li=document.createElement('li');li.className='prereq';
    const dot=document.createElement('span');dot.className='dot dot-'+q.state;
    const text=document.createElement('span');
    text.innerHTML='<strong>'+q.label+'</strong> — <span class="state state-'+q.state+'">'+(WORD[q.state]||q.state)+'</span>'+
      (q.state==='ok'?'':'<small class="hint">'+q.hint+'</small>');
    li.append(dot,text);el('prereqs').append(li);
  }
  if(!(p.prereqs||[]).length)el('prereqs').innerHTML='<li class="prereq"><span class="dot dot-ok"></span><span><strong>All good \\u2014 nothing else is needed on this platform.</strong></span></li>';
  el('to-plan').disabled=BLOCKERS>0;
  el('reqs-note').textContent=BLOCKERS>0
    ? BLOCKERS+' requirement'+(BLOCKERS>1?'s':'')+' missing — fix '+(BLOCKERS>1?'them':'it')+' and reload this page.'
    : 'Everything is in place.';
  el('next').textContent=p.next||'';
});
el('to-plan').onclick=()=>go(2);
el('back').onclick=()=>go(1);
el('confirm').onclick=()=>{el('confirm').disabled=true;startRun();};
el('retry').onclick=()=>location.reload();
el('done').onclick=()=>window.close();`;
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
  display:flex;justify-content:center;padding:28px 16px 64px}
.shell{width:100%;max-width:54rem;display:flex;flex-direction:column;gap:16px}
.masthead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:14px}
.brand-mark{width:42px;height:42px;border-radius:var(--radius);display:grid;place-items:center;
  background:linear-gradient(135deg,var(--accent-strong),#0d8f66);color:#04120c;font-weight:800;font-size:1.25rem;
  box-shadow:var(--glow)}
.brand-text h1{margin:0;font-size:1.2rem;letter-spacing:-.01em}
.brand-sub{margin:0;font-size:.8rem;color:var(--text-muted)}
h2{margin:0 0 14px;font-size:.85rem;color:var(--text-muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.stepper{list-style:none;display:flex;gap:6px;margin:0;padding:0}
.stage{flex:1;display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;
  border:1px solid var(--border);background:var(--surface);color:var(--text-faint);font-size:.8rem}
.stage-num{width:20px;height:20px;border-radius:999px;display:grid;place-items:center;flex:none;
  border:1px solid var(--border);font-size:.72rem;font-weight:700}
.stage-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage-active{color:var(--text);border-color:#10b98155;background:#10b9810f}
.stage-active .stage-num{background:var(--accent-strong);border-color:var(--accent-strong);color:#04120c}
.stage-done{color:var(--accent);border-color:var(--border)}
.stage-done .stage-num{border-color:var(--accent);color:var(--accent)}
.stage-done .stage-label::after{content:" \\u2713"}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:20px 22px;box-shadow:var(--shadow)}
.terminal{margin:0;padding:14px 16px;background:var(--bg-deep);border:1px solid var(--border-soft);
  border-radius:var(--radius);font:12.5px/1.7 var(--font-mono);color:var(--accent-soft);
  white-space:pre-wrap;word-break:break-word}
.console{max-height:22rem;overflow:auto;min-width:0}
.prereqs{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:12px}
.prereq{display:flex;align-items:baseline;gap:10px}
.dot{width:9px;height:9px;border-radius:999px;flex:none;position:relative;top:-1px}
.dot-ok{background:var(--accent);box-shadow:0 0 8px #10b98180}
.dot-missing{background:var(--error)}
.dot-unknown{background:var(--warning)}
.state-ok{color:var(--accent)}.state-missing{color:var(--error)}.state-unknown{color:var(--warning)}
.hint{display:block;color:var(--text-faint);font-size:.84rem;margin-top:2px}
.card-optin{padding:14px 16px;margin-top:16px}
.optin{display:flex;gap:12px;cursor:pointer}
.optin input{width:18px;height:18px;accent-color:var(--accent-strong);margin-top:3px;flex:none}
.optin-body strong{display:block;font-size:.92rem}
.optin-body small{color:var(--text-muted)}
.stage-nav{display:flex;align-items:center;gap:14px;margin-top:4px}
.stage-note{margin:0;font-size:.85rem;color:var(--text-faint)}
.actions,.run-actions{display:flex;align-items:center;gap:12px}
.btn{font:600 .95rem var(--font-sans);padding:10px 24px;border-radius:999px;border:0;cursor:pointer;
  transition:transform .15s var(--ease),box-shadow .15s var(--ease)}
.btn-primary{background:linear-gradient(135deg,var(--accent-strong),#0d8f66);color:#04120c;box-shadow:var(--glow)}
.btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 36px #10b98160}
.btn-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.btn-ghost{background:transparent;color:var(--text-muted);border:1px solid var(--border)}
.btn-ghost:hover{color:var(--text);border-color:var(--text-faint)}
.next{margin:6px 0 0;font-size:.85rem;color:var(--text-muted)}
.run-grid{display:grid;grid-template-columns:minmax(13rem,5fr) minmax(0,7fr);gap:16px}
@media (max-width:52rem){.run-grid{grid-template-columns:1fr}}
.progress{height:10px;border-radius:999px;background:var(--bg-deep);border:1px solid var(--border-soft);overflow:hidden}
.bar{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,var(--accent-strong),var(--accent-soft));
  transition:width .4s var(--ease)}
.bar-run{background:linear-gradient(90deg,var(--accent-strong),var(--accent-soft),var(--accent-strong));
  background-size:200% 100%;animation:slide 1.6s linear infinite}
@keyframes slide{to{background-position:-200% 0}}
.bar-error{background:var(--error);animation:none}
.progress-label{margin:10px 0 0;font-size:.9rem;color:var(--text-muted)}
.pill{font-size:.78rem;font-weight:600;padding:5px 12px;border-radius:999px;border:1px solid var(--border-soft)}
.pill-info{color:var(--info);background:#a9c7ee14}
.pill-run{color:var(--warning);background:#e0c27a14}
.pill-ok{color:var(--accent);background:#10b98114}
.pill-err{color:var(--error);background:#ff718f14}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
