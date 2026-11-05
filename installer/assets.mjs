// Wizard page assets — inline strings, no dependencies (install-wizard T1,
// T2, T3, T6). The browser never sends commands or paths: it only confirms
// the plan the server built and its telemetry opt-in. Security headers live
// in server.mjs. Layout inspired by gentle-shell's install wizard: topbar
// wordmark, connected stage dots, one large centered panel per step with
// eyebrow/heading/lead, hero glow + dot grid, footer note. Identity is
// Vangen's: dark emerald security palette. Local font stacks only (CSP
// default-src 'self'); every state carries a text label.
export const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Install Aegis CLI</title>
<link rel="stylesheet" href="/wizard.css">
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>
<header class="topbar">
  <p class="wordmark"><span class="wordmark-mark" aria-hidden="true">A</span> Aegis <span class="wordmark-accent">CLI</span></p>
  <p class="topbar-note"><span class="dot" aria-hidden="true"></span> Local installer</p>
</header>
<main>
  <nav aria-label="Installation progress">
    <ol id="stepper" class="stages">
      <li class="stage stage-current" aria-current="step" data-stage="1"><span class="stage-dot" aria-hidden="true">1</span><span class="stage-label">Check</span></li>
      <li class="stage stage-upcoming" data-stage="2"><span class="stage-dot" aria-hidden="true">2</span><span class="stage-label">Review</span></li>
      <li class="stage stage-upcoming" data-stage="3"><span class="stage-dot" aria-hidden="true">3</span><span class="stage-label">Install</span></li>
      <li class="stage stage-upcoming" data-stage="4"><span class="stage-dot" aria-hidden="true">4</span><span class="stage-label">Done</span></li>
    </ol>
  </nav>
  <div class="view">
    <section class="panel" id="card-reqs" aria-labelledby="reqs-title">
      <p class="eyebrow">Step 1 of 4 &middot; Check</p>
      <h1 id="reqs-title" tabindex="-1">Checking this computer</h1>
      <p class="lead">We look at virtualization, WSL2 and Docker before anything else. Nothing changes on this machine until you confirm a plan.</p>
      <ul id="prereqs" class="prereqs"><li class="prereq"><span class="dot dot-unknown"></span>Checking your machine…</li></ul>
      <p class="stage-note" id="reqs-note">Waiting for checks…</p>
      <div class="panel-actions">
        <button id="to-plan" class="btn btn-primary" disabled>Review the plan</button>
      </div>
    </section>

    <section class="panel" id="card-plan" aria-labelledby="plan-title" hidden>
      <p class="eyebrow">Step 2 of 4 &middot; Review</p>
      <h1 id="plan-title" tabindex="-1">Confirm the plan</h1>
      <p class="lead">This installer will run exactly these steps. Read them — nothing installs until you press Install.</p>
      <pre id="plan" class="terminal">loading…</pre>
      <section class="card-optin">
        <label class="optin">
          <input type="checkbox" id="telemetry">
          <span class="optin-body">
            <strong>Send anonymous usage statistics to Vangen</strong>
            <small>Opt-in and off by default. No code, paths, or secrets — just which commands are used.</small>
          </span>
        </label>
      </section>
      <div class="panel-actions">
        <button id="back" class="btn btn-ghost">Back</button>
        <button id="confirm" class="btn btn-primary" disabled>Install Aegis CLI</button>
      </div>
    </section>

    <section class="panel" id="card-run" aria-labelledby="run-title" hidden>
      <p class="eyebrow">Step 3 of 4 &middot; Install</p>
      <h1 id="run-title" tabindex="-1">Installing Aegis CLI</h1>
      <p class="lead">The installer output streams below. Closing this tab does not stop it.</p>
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

    <section class="panel" id="card-done" aria-labelledby="done-title" hidden>
      <p class="eyebrow">Step 4 of 4 &middot; Done</p>
      <h1 id="done-title" tabindex="-1">Aegis CLI is installed</h1>
      <p class="lead" id="done-lead">Your next step is the first journey: activate your license and bring up the workstation.</p>
      <p id="next-done" class="next-command"></p>
      <div class="panel-actions">
        <button id="finish" class="btn btn-primary">Finish</button>
      </div>
    </section>
  </div>
</main>
<footer class="footer">
  <p>This page talks only to the installer running on this computer at 127.0.0.1. Closing the tab does not stop it; use <strong>Finish</strong> or press Ctrl+C in the terminal.</p>
</footer>
<script src="/wizard.js"></script></body></html>`;
export const JS = `const el=(id)=>document.getElementById(id);
const WORD={ok:'available',missing:'missing',unknown:'unknown',info:'present'};
let BLOCKERS=0;
function go(stage){
  document.querySelectorAll('.stage').forEach(s=>{
    const n=+s.dataset.stage;
    s.classList.toggle('stage-current',n===stage);
    s.classList.toggle('stage-done',n<stage);
    s.classList.toggle('stage-upcoming',n>stage);
    if(n===stage)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');
  });
  el('card-reqs').hidden=stage!==1;
  el('card-plan').hidden=stage!==2;
  el('card-run').hidden=stage!==3;
  el('card-done').hidden=stage!==4;
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
      if(m[1]==='0'){go(4);
        el('next-done').textContent=(typeof pnext!=='undefined'&&pnext)||'aegis install <license-id>';}
      else{el('bar').classList.add('bar-error');
        el('progress-label').textContent='The installer failed \\u2014 read the console.';
        el('retry').hidden=false;}
    }}),400);
}
let pnext='';
fetch('/api/plan').then(r=>r.json()).then(p=>{
  el('plan').textContent=p.steps.join('\\n');
  pnext=p.next||'';
  el('prereqs').innerHTML='';
  BLOCKERS=0;
  for(const q of p.prereqs||[]){
    if(q.state==='missing')BLOCKERS++;
    const li=document.createElement('li');li.className='prereq';
    const dot=document.createElement('span');dot.className='dot dot-'+q.state;
    const text=document.createElement('span');
    text.innerHTML='<strong>'+q.label+'</strong>'+
      (q.state==='info'?'':' — <span class="state state-'+q.state+'">'+(WORD[q.state]||q.state)+'</span>')+
      (q.state==='ok'||q.state==='info'?'':'<small class="hint">'+q.hint+'</small>');
    li.append(dot,text);el('prereqs').append(li);
  }
  if(!(p.prereqs||[]).length)el('prereqs').innerHTML='<li class="prereq"><span class="dot dot-ok"></span><span><strong>All good — nothing else is needed on this platform.</strong></span></li>';
  el('to-plan').disabled=BLOCKERS>0;
  el('reqs-note').textContent=BLOCKERS>0
    ? BLOCKERS+' requirement'+(BLOCKERS>1?'s':'')+' missing — fix '+(BLOCKERS>1?'them':'it')+' and reload this page.'
    : 'Everything is in place. Continue when ready.';
});
el('to-plan').onclick=()=>go(2);
el('back').onclick=()=>go(1);
el('confirm').onclick=()=>{el('confirm').disabled=true;startRun();};
el('retry').onclick=()=>location.reload();
el('done').onclick=()=>go(4);
el('finish').onclick=()=>window.close();`;
export const CSS = `:root{color-scheme:dark;
--bg:#0b0f0d;--bg-deep:#050807;--surface:#111815;--surface-1:#15201b;--surface-2:#1d2b24;
--border:#22322a;--border-soft:#ffffff12;--text:#eef5f1;--text-muted:#9db3a8;--text-faint:#6d8378;
--accent:#34d399;--accent-strong:#10b981;--accent-soft:#6ee7b7;
--success:#6ee7b7;--warning:#e0c27a;--error:#ff718f;--info:#a9c7ee;
--radius-sm:8px;--radius:12px;--radius-lg:16px;--radius-pill:999px;--ease:cubic-bezier(.4,0,.2,1);
--glow:0 10px 30px #10b98140;--shadow:0 24px 60px #00000080,0 0 40px #10b98114;
--font-sans:Inter,"SF Pro Text",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
--font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono",monospace}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);
  color:var(--text);font:16px/1.6 var(--font-sans);-webkit-font-smoothing:antialiased;
  scrollbar-color:var(--surface-2) transparent}
.backdrop{position:fixed;inset:0;z-index:-1;pointer-events:none}
.backdrop::after{content:"";position:absolute;inset:0;
  background-image:radial-gradient(#34d3990d 1px,#0000 1px);background-size:26px 26px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,#0000 70%);mask-image:linear-gradient(180deg,#000 0%,#0000 70%)}
.topbar,main,.footer{width:min(1040px,100% - 32px);margin-inline:auto}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0 8px}
.wordmark{display:inline-flex;align-items:center;gap:10px;margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em}
.wordmark-mark{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid #34d39966;
  border-radius:var(--radius-sm);background:linear-gradient(140deg,#34d39929,#34d3990a);color:var(--accent);
  font:700 14px/1 var(--font-mono);box-shadow:0 6px 18px #10b98126}
.wordmark-accent{color:var(--accent)}
.topbar-note{display:inline-flex;align-items:center;gap:8px;margin:0;padding:5px 12px;border:1px solid var(--border-soft);
  border-radius:var(--radius-pill);background:#ffffff08;color:var(--text-muted);
  font:500 12px/1.4 var(--font-mono);letter-spacing:.08em;text-transform:uppercase}
.dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 3px #6ee7b726}
main{flex:1;padding:24px 0 56px}
.stages{display:flex;gap:8px;margin:0 0 24px;padding:0;list-style:none}
.stage{display:flex;flex:1;align-items:center;gap:10px;min-width:0;color:var(--text-muted);
  font:600 12px/1.2 var(--font-mono);letter-spacing:.1em;text-transform:uppercase}
.stage:not(:last-child)::after{content:"";flex:1;height:1px;min-width:12px;background:var(--border)}
.stage-done:not(:last-child)::after{background:linear-gradient(90deg,#6ee7b799,#34d39966)}
.stage-dot{display:inline-grid;flex:none;place-items:center;width:28px;height:28px;border:1px solid var(--border);
  border-radius:50%;background:var(--surface);font-size:12px;letter-spacing:0}
.stage-current{color:var(--text)}
.stage-current .stage-dot{border-color:var(--accent);background:var(--accent);color:var(--bg);
  box-shadow:0 0 0 4px #34d39926,var(--glow)}
.stage-done{color:var(--success)}
.stage-done .stage-dot{border-color:#6ee7b799;background:#6ee7b726;color:var(--success)}
.stage-upcoming{color:var(--text-faint)}
.view{position:relative;isolation:isolate}
.view::before{content:"";position:absolute;inset:-120px max(-12%,calc((100% - 100vw)/2 + 16px)) -40px;z-index:-1;
  pointer-events:none;background:
  radial-gradient(38% 50% at 30% 30%,#34d39938,#0000 70%),
  radial-gradient(30% 40% at 75% 40%,#a9c7ee1f,#0000 70%);filter:blur(32px)}
.panel{position:relative;overflow:hidden;padding:clamp(24px,4.2vw,52px);border:1px solid var(--border);
  border-radius:var(--radius-lg);background:linear-gradient(180deg,#15201bf2,#111815f2);
  box-shadow:var(--shadow);animation:rise .35s var(--ease) both}
.panel::before{content:"";position:absolute;inset:0 0 auto;height:2px;
  background:linear-gradient(90deg,#0000,var(--accent),#0000);opacity:.7}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.eyebrow{margin:0 0 10px;font:600 12px/1.4 var(--font-mono);letter-spacing:.14em;
  text-transform:uppercase;color:var(--accent)}
h1{margin:0 0 8px;font-size:clamp(1.5rem,3vw,2rem);letter-spacing:-.02em}
.lead{margin:0 0 22px;color:var(--text-muted);max-width:56ch}
.terminal{margin:0 0 18px;padding:14px 16px;background:var(--bg-deep);border:1px solid var(--border-soft);
  border-radius:var(--radius);font:12.5px/1.7 var(--font-mono);color:var(--accent-soft);
  white-space:pre-wrap;word-break:break-word}
.console{max-height:22rem;overflow:auto;min-width:0;margin:0}
.prereqs{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:12px}
.prereq{display:flex;align-items:baseline;gap:10px}
.dot-ok{background:var(--success);box-shadow:0 0 8px #10b98180}
.dot-missing{background:var(--error)}
.dot-unknown{background:var(--warning)}
.state-ok{color:var(--success)}.state-missing{color:var(--error)}.state-unknown{color:var(--warning)}
.hint{display:block;color:var(--text-faint);font-size:.84rem;margin-top:2px}
.stage-note{margin:0 0 18px;font-size:.88rem;color:var(--text-muted)}
.panel-actions{display:flex;align-items:center;gap:14px}
.card-optin{padding:14px 16px;margin:0 0 18px;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--surface-1)}
.optin{display:flex;gap:12px;cursor:pointer}
.optin input{width:18px;height:18px;accent-color:var(--accent-strong);margin-top:3px;flex:none}
.optin-body strong{display:block;font-size:.92rem}
.optin-body small{color:var(--text-muted)}
.run-grid{display:grid;grid-template-columns:minmax(13rem,5fr) minmax(0,7fr);gap:18px}
@media (max-width:52rem){.run-grid{grid-template-columns:1fr}}
.progress{height:10px;border-radius:var(--radius-pill);background:var(--bg-deep);
  border:1px solid var(--border-soft);overflow:hidden}
.bar{height:100%;width:0;border-radius:var(--radius-pill);
  background:linear-gradient(90deg,var(--accent-strong),var(--accent-soft));transition:width .4s var(--ease)}
.bar-run{background:linear-gradient(90deg,var(--accent-strong),var(--accent-soft),var(--accent-strong));
  background-size:200% 100%;animation:slide 1.6s linear infinite}
@keyframes slide{to{background-position:-200% 0}}
.bar-error{background:var(--error);animation:none}
.progress-label{margin:10px 0 0;font-size:.9rem;color:var(--text-muted)}
.next{margin:8px 0 0;font-size:.85rem;color:var(--text-muted)}
.next-command{margin:0 0 22px;padding:12px 16px;border:1px dashed #34d39955;border-radius:var(--radius);
  font:600 14px/1.6 var(--font-mono);color:var(--accent-soft);background:#34d3990a}
.run-actions{display:flex;align-items:center;gap:12px;margin-top:14px}
.btn{font:600 .95rem var(--font-sans);padding:11px 26px;border-radius:var(--radius-pill);border:0;cursor:pointer;
  transition:transform .15s var(--ease),box-shadow .15s var(--ease)}
.btn-primary{background:linear-gradient(135deg,var(--accent-strong),#0d8f66);color:#04120c;box-shadow:var(--glow)}
.btn-primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 36px #10b98160}
.btn-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.btn-ghost{background:transparent;color:var(--text-muted);border:1px solid var(--border)}
.btn-ghost:hover{color:var(--text);border-color:var(--text-faint)}
.footer{padding:0 0 28px;color:var(--text-faint);font-size:.85rem}
.footer p{margin:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
