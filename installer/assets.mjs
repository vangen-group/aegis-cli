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
  <div class="topbar-actions">
    <p class="topbar-note"><span class="dot" aria-hidden="true"></span> <span data-i18n="local">Instalador local</span></p>
    <button id="lang" class="btn btn-ghost btn-lang" title="Español / English">EN</button>
  </div>
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
  <div class="layout">
  <div class="view">
    <section class="panel" id="card-reqs" aria-labelledby="reqs-title">
      <p class="eyebrow">Step 1 of 4 &middot; Check</p>
      <h1 id="reqs-title" tabindex="-1" data-i18n="reqs-title">Verificando esta computadora</h1>
      <p class="lead" data-i18n="reqs-lead">Primero miramos virtualización, WSL2 y Docker. En Windows todo se instala dentro de tu entorno Ubuntu de WSL2 — nada queda en el host. Nada cambia en esta máquina hasta que confirmes un plan.</p>
      <ul id="prereqs" class="prereqs"><li class="prereq"><span class="dot dot-unknown"></span><span data-i18n="checking">Verificando tu máquina…</span></li></ul>
      <p class="stage-note" id="reqs-note" data-i18n="waiting">Esperando los checks…</p>
      <div class="panel-actions">
        <button id="to-plan" class="btn btn-primary" disabled data-i18n="review">Ver el plan</button>
      </div>
      <section class="card-optin" id="volume-card" aria-labelledby="volume-title">
        <h2 id="volume-title" data-i18n="vol-title">Volumen seguro LUKS</h2>
        <p class="prereq"><span class="dot dot-unknown" id="volume-dot"></span><span id="volume-state">Consultando el volumen…</span></p>
        <div id="volume-guide" hidden>
          <p class="hint" data-i18n="vol-guide-hint">Tu volumen LUKS todavía no existe. Aprovisionalo con estos pasos (en tu terminal — la frase de paso se escribe SOLO en el prompt de cryptsetup) y verificá cada uno:</p>
          <ol id="volume-steps" class="steps"></ol>
        </div>
      </section>
    </section>

    <section class="panel" id="card-plan" aria-labelledby="plan-title" hidden>
      <p class="eyebrow" data-i18n="eyebrow2">Paso 2 de 4 · Revisar</p>
      <h1 id="plan-title" tabindex="-1" data-i18n="plan-title">Confirmá el plan</h1>
      <p class="lead" data-i18n="plan-lead">Este instalador va a correr exactamente estos pasos. Leelos — nada se instala hasta que aprietes Instalar.</p>
      <pre id="plan" class="terminal">loading…</pre>
      <section class="card-optin">
        <label class="optin">
          <input type="checkbox" id="telemetry">
          <span class="optin-body">
            <strong data-i18n="tel-strong">Enviar estadísticas anónimas de uso a Vangen</strong>
            <small data-i18n="tel-small">Opt-in y apagado por defecto. Sin código, rutas ni secretos — solo qué comandos se usan.</small>
          </span>
        </label>
      </section>
      <div class="panel-actions">
        <button id="back" class="btn btn-ghost" data-i18n="back">Volver</button>
        <button id="confirm" class="btn btn-primary" disabled data-i18n="install">Instalar Aegis CLI</button>
      </div>
    </section>

    <section class="panel" id="card-run" aria-labelledby="run-title" hidden>
      <p class="eyebrow" data-i18n="eyebrow3">Paso 3 de 4 · Instalar</p>
      <h1 id="run-title" tabindex="-1" data-i18n="run-title">Instalando Aegis CLI</h1>
      <p class="lead" data-i18n="run-lead">La salida del instalador se muestra en la consola. Cerrar esta pestaña no lo detiene.</p>
      <div class="progress">
        <div class="progress-head">
          <span class="progress-title" data-i18n="progress">Progreso</span>
          <span class="progress-count" id="progress-count">Starting…</span>
        </div>
        <div role="progressbar" aria-label="Install progress"><div class="bar" id="bar"></div></div>
        <ul id="steps" class="steps"></ul>
      </div>
      <p id="next" class="next"></p>
      <div class="panel-actions">
        <button id="done" class="btn btn-primary" hidden data-i18n="finish">Terminar</button>
        <button id="retry" class="btn btn-ghost" hidden data-i18n="retry">Volver al plan</button>
      </div>
    </section>

    <section class="panel" id="card-done" aria-labelledby="done-title" hidden>
      <p class="eyebrow" data-i18n="eyebrow4">Paso 4 de 4 · Listo</p>
      <h1 id="done-title" tabindex="-1" data-i18n="done-title">Aegis CLI está instalado</h1>
      <p class="lead" id="done-lead" data-i18n="done-lead">Tu siguiente paso es el primer viaje: activá tu licencia y levantá la workstation.</p>
      <p id="next-done" class="next-command"></p>
      <div class="panel-actions">
        <button id="finish" class="btn btn-primary">Finish</button>
      </div>
    </section>
  </div>
  <aside class="console-dock" aria-label="Installer console">
    <p class="console-head"><span class="dot" aria-hidden="true"></span> Installer console</p>
    <pre id="log" class="terminal console" aria-label="Installer output">console idle — the installer output appears here once you press Install.</pre>
  </aside>
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
  el('progress-count').textContent='Running install.sh…';
  fetch('/api/confirm',{method:'POST',body:JSON.stringify({telemetry:el('telemetry').checked})});
  const t=setInterval(()=>{
    const logP=fetch('/api/log').then(r=>r.text()).then(t2=>{
      if(t2){el('log').textContent=t2;el('log').scrollTop=el('log').scrollHeight;}
      const m=/INSTALL-FINISHED rc=(\\d+)/.exec(t2);
      if(m){clearInterval(t);el('bar').classList.remove('bar-run');
        if(m[1]==='0'){el('bar').style.width='100%';go(4);
          el('next-done').textContent=(typeof pnext!=='undefined'&&pnext)||'aegis install <license-id>';}
        else{el('bar').classList.add('bar-error');el('bar').style.width='100%';
          el('progress-count').textContent='The installer failed — read the console.';
          el('retry').hidden=false;}}
    });
    fetch('/api/progress').then(r=>r.json()).then(p=>{
      // Update rows IN PLACE: rebuilding the list every poll restarts the
      // spinner's CSS animation, which read as an ugly jump (L10).
      const box=el('steps');
      const prev=(box.dataset.fingerprint||'').split(',');
      const next=(p.steps||[]).map(st=>st.status);
      const unchanged=prev.length===next.length&&prev.every((v,i)=>v===next[i]);
      if(unchanged)return;
      box.innerHTML='';
      for(const st of (p.steps||[])){
        const li=document.createElement('li');li.className='step step-'+st.status;
        const icon=document.createElement('span');icon.className='step-icon';
        if(st.status==='running'){const sp=document.createElement('span');sp.className='spinner';icon.append(sp);}
        else icon.textContent=st.status==='done'?'\u2713':st.status==='failed'?'\u2717':'\u00B7';
        const label=document.createElement('span');label.className='step-label';label.textContent=st.label;
        const t=I18N[window.__aegisLang||'es'];
        const stat=document.createElement('span');stat.className='step-status';stat.textContent=st.status==='running'?t['running']:t[st.status]||st.status;
        li.append(icon,label,stat);box.append(li);
      }
      box.dataset.fingerprint=next.join(',');
      el('bar').style.width=Math.max(6,Math.round(100*(p.done||0)/(p.total||4)))+'%';
      if(!p.finished){
        const run=(p.steps||[]).find(x=>x.status==='running');
        const t=I18N[window.__aegisLang||'es'];
        el('progress-count').textContent=t['step-of'](Math.min((p.done||0)+1,p.total||4),p.total||4)+(run?' — '+run.label.toLowerCase():'');
      }
    }).catch(()=>{});
  },400);
}
const I18N = {
  es: {'local':'Instalador local','reqs-title':'Verificando esta computadora','checking':'Verificando tu máquina…','waiting':'Esperando los checks…','review':'Ver el plan','plan-title':'Confirmá el plan','back':'Volver','install':'Instalar Aegis CLI','run-title':'Instalando Aegis CLI','progress':'Progreso','finish':'Terminar','retry':'Volver al plan','done-title':'Aegis CLI está instalado',
    'eyebrow1':'Paso 1 de 4 · Check','eyebrow2':'Paso 2 de 4 · Revisar','eyebrow3':'Paso 3 de 4 · Instalar','eyebrow4':'Paso 4 de 4 · Listo',
    'running':'en progreso','done':'hecho','pending':'pendiente','failed':'falló',
    'step-of':(a,b)=>'Paso '+a+' de '+b},
  en: {'local':'Local installer','reqs-title':'Checking this computer','checking':'Checking your machine…','waiting':'Waiting for checks…','review':'Review the plan','plan-title':'Confirm the plan','back':'Back','install':'Install Aegis CLI','run-title':'Installing Aegis CLI','progress':'Progress','finish':'Finish','retry':'Back to the plan','done-title':'Aegis CLI is installed',
    'eyebrow1':'Step 1 of 4 · Check','eyebrow2':'Step 2 of 4 · Review','eyebrow3':'Step 3 of 4 · Install','eyebrow4':'Step 4 of 4 · Done',
    'running':'in progress','done':'done','pending':'pending','failed':'failed',
    'step-of':(a,b)=>'Step '+a+' of '+b},
};
function applyLang(lang){
  const t=I18N[lang]||I18N.es;
  document.querySelectorAll('[data-i18n]').forEach(n=>{const k=n.dataset.i18n; if(t[k])n.textContent=t[k];});
  const b=el('lang'); if(b)b.textContent=lang==='es'?'EN':'ES';
}
let pnext='';
const pollLog=setInterval(()=>fetch('/api/log').then(r=>r.text()).then(t2=>{
  if(!t2)return;
  el('log').textContent=t2;el('log').scrollTop=el('log').scrollHeight;
}),500);
fetch('/api/plan').then(r=>r.json()).then(p=>{
  pnext=p.next||'';
  const planEl=el('plan');planEl.textContent='';
  for(const [i,s] of (p.sections||[]).entries()){
    const row=document.createElement('div');row.className='plan-step';
    const num=document.createElement('span');num.className='plan-num';num.textContent=String(i+1);
    const body=document.createElement('div');body.className='plan-body';
    const head=document.createElement('div');
    head.innerHTML='<strong>'+s.title+'</strong> <span class="plan-needs">needs: '+s.needs+'</span>';
    const det=document.createElement('div');det.className='plan-detail';det.textContent=s.detail;
    body.append(head,det);row.append(num,body);planEl.append(row);
  }
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
  window.__aegisLang=p.lang||'es';
  applyLang(window.__aegisLang);
  // T4: LUKS volume state — detected, never toggled. When missing, show the
  // provisioning guide with a read-only verify button per step.
  const LANG=window.__aegisLang;
  const VOL={es:{missing:'Volumen LUKS inexistente — todavía no está aprovisionado',sealed:'Volumen LUKS sellado (por diseño entre sesiones) — ejecutá ~/mount-aegis.sh cuando lo necesites',mounted:'Volumen LUKS montado en /mnt/aegis_secure',verify:'Verificar',ok:'verificado',fail:'falló',guide:'Tu volumen LUKS todavía no existe. Aprovisionalo con estos pasos (en tu terminal — la frase de paso se escribe SOLO en el prompt de cryptsetup) y verificá cada uno:'},
             en:{missing:'LUKS volume missing — not provisioned yet',sealed:'LUKS volume sealed (by design between sessions) — run ~/mount-aegis.sh when you need it',mounted:'LUKS volume mounted at /mnt/aegis_secure',verify:'Verify',ok:'verified',fail:'failed',guide:'Your LUKS volume does not exist yet. Provision it with these steps (in your terminal — the passphrase is typed ONLY at the cryptsetup prompt) and verify each one:'}};
  fetch('/api/volume/state').then(r=>r.json()).then(v=>{
    const t=VOL[LANG]||VOL.es;
    const dot=el('volume-dot'), st=el('volume-state');
    dot.className='dot '+(v.state==='mounted'?'dot-ok':v.state==='sealed'?'dot-unknown':'dot-missing');
    st.textContent=t[v.state]||v.state;
    if(v.state!=='missing')return;
    el('volume-guide').hidden=false;
    el('volume-guide').querySelector('[data-i18n=vol-guide-hint]').textContent=t.guide;
    const box=el('volume-steps');box.innerHTML='';
    for(const p of v.provisioning||[]){
      const li=document.createElement('li');li.className='step';
      const label=document.createElement('span');label.className='step-label';label.textContent=p.text;
      const btn=document.createElement('button');btn.className='btn btn-ghost btn-verify';btn.textContent=t.verify;
      const stat=document.createElement('span');stat.className='step-status';
      btn.onclick=async()=>{
        btn.disabled=true;stat.textContent='…';
        const r=await fetch('/api/volume/verify',{method:'POST',body:JSON.stringify({step:p.id})}).then(x=>x.json()).catch(()=>({ok:false}));
        stat.textContent=r.ok?t.ok:t.fail;
        stat.className='step-status '+(r.ok?'state-ok':'state-missing');
      };
      li.append(label,btn,stat);box.append(li);
    }
  }).catch(()=>{});
  el('to-plan').disabled=BLOCKERS>0;
  // The plan rendered: step 2's Install button may now fire. (Lost in the
  // staged-UI rewrite: confirm started disabled and nothing re-enabled it.)
  el('confirm').disabled=false;
  el('reqs-note').textContent=BLOCKERS>0
    ? BLOCKERS+' requirement'+(BLOCKERS>1?'s':'')+' missing — fix '+(BLOCKERS>1?'them':'it')+' and reload this page.'
    : 'Everything is in place. Continue when ready.';
});
el('to-plan').onclick=()=>go(2);
el('back').onclick=()=>go(1);
el('confirm').onclick=()=>{el('confirm').disabled=true;startRun();};
el('retry').onclick=()=>location.reload();
el('done').onclick=()=>go(4);
el('finish').onclick=()=>window.close();
el('lang').onclick=()=>{
  const cur=window.__aegisLang||'es';
  const next=cur==='es'?'en':'es';
  document.cookie='aegis_lang='+next+'; SameSite=Strict';
  location.reload();};`;
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
#volume-card{margin-top:16px;margin-bottom:0}
#volume-title{font-size:.8rem;margin-bottom:10px}
.btn-verify{padding:6px 14px;font-size:.8rem}
.step .step-label{font-size:.85rem}
.optin{display:flex;gap:12px;cursor:pointer}
.optin input{width:18px;height:18px;accent-color:var(--accent-strong);margin-top:3px;flex:none}
.optin-body strong{display:block;font-size:.92rem}
.optin-body small{color:var(--text-muted)}
.layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(11rem,2fr);gap:18px;align-items:start}
@media (max-width:56rem){.layout{grid-template-columns:1fr}}
.console-dock{position:sticky;top:16px;display:flex;flex-direction:column;min-width:0}
.console-head{display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:0 4px;
  font:600 11px/1.4 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)}
.console{min-height:16rem;max-height:32rem;font-size:11.5px}
.progress{padding:16px 18px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-1);margin-bottom:14px}
.progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.progress-title{color:var(--text-muted);font:600 11px/1.4 var(--font-mono);letter-spacing:.12em;text-transform:uppercase}
.progress-count{font:600 13px/1.4 var(--font-mono);color:var(--accent-soft)}
.progress>div[role="progressbar"]{height:10px;border-radius:999px;background:var(--bg-deep);border:1px solid var(--border-soft);overflow:hidden}
.steps{display:grid;gap:2px;margin:12px 0 0;padding:0;list-style:none}
.step{display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:12px;padding:8px 10px;border-radius:10px;border:1px solid transparent}
.step-running{border-color:#34d39933;background:#34d3990d}
.step-icon{display:grid;place-items:center;width:24px;height:24px;border:1.5px solid var(--border);border-radius:50%;font:700 12px/1 var(--font-mono);color:var(--text-faint)}
.step-done .step-icon{border-color:#6ee7b799;background:#6ee7b733;color:var(--success)}
.step-failed .step-icon{border-color:#ff718f99;background:#ff718f33;color:var(--error)}
.step-label{min-width:0;font-size:14px}
.step-status{color:var(--text-faint);font:600 10.5px/1.4 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.step-running .step-status{color:var(--accent)}
.spinner{width:12px;height:12px;border:2px solid #34d39933;border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
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
.plan-step{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-soft)}
.plan-step:last-child{border-bottom:0}
.plan-num{display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:50%;
  border:1px solid #34d39966;background:#34d3990f;color:var(--accent);
  font:700 12px/1 var(--font-mono)}
.plan-body{min-width:0}
.plan-body strong{font-size:.95rem}
.plan-needs{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:var(--radius-pill);
  border:1px solid var(--border-soft);background:#ffffff08;color:var(--text-muted);
  font:500 11px/1.5 var(--font-mono);letter-spacing:.04em}
.plan-detail{color:var(--text-muted);font-size:.88rem;margin-top:3px}
.footer{padding:0 0 28px;color:var(--text-faint);font-size:.85rem}
.footer p{margin:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;
