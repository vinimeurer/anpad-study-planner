/* Rumo ao ANPAD — lógica da aplicação (sem dependências).
   Estado salvo em localStorage. Conteúdo vem de data.js (window.ANPAD_DATA). */
(() => {
  'use strict';
  const D = window.ANPAD_DATA;
  const KEY = 'anpad:v2';
  const TKEY = 'anpad:v2:timer';

  const MOD = D.modules;
  const ITEMS = D.items;
  const AREA_NAME = { RLM: 'Raciocínio Lógico-Matemático', EN: 'Língua Inglesa', RA: 'Raciocínio Analítico', PT: 'Língua Portuguesa' };
  const AREA_SHORT = { RLM: 'RLM', EN: 'Inglês', RA: 'Analítico', PT: 'Português' };
  const AREAS = ['RLM', 'EN', 'RA', 'PT'];
  const TYPES = Object.fromEntries(D.tipos.map(t => [t[0], t[1]]));
  const PHASE_NAME = { 1: 'Fase 1: essencial', 2: 'Fase 2: importante', 3: 'Fase 3: completar' };
  const NIVEL_NAME = { 1: 'Nível 1', 2: 'Nível 2', 3: 'Nível 3' };
  const ICONS = {
    painel: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    modulos: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    prompts: '<path d="M4 6l6 6-6 6M12 18h8"/>',
    erros: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    guia: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'
  };
  const NAV = [['painel', 'Painel'], ['modulos', 'Módulos'], ['prompts', 'Prompts'], ['erros', 'Erros'], ['guia', 'Guia']];
  const SIM_TEXT = 'Gere os 4 prompts em modo SIMULADO, 10 questões cada, e não abra o gabarito. Resolva em condições reais (sem consulta, cronometrado) e corrija a fundo com o estudo reverso. Depois registre o placar.';

  /* ---------------------------------------------------------- utilidades */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const addDays = (iso, k) => { const d = parseDate(iso); d.setDate(d.getDate() + k); return isoDate(d); };
  const fmtDM = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const clone = o => JSON.parse(JSON.stringify(o));
  const chipA = a => `<span class="chip a-${a}">${esc(a)}</span>`;
  const fh = h => (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h';
  const fmin = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad(m % 60) : ''}` : `${m} min`;

  /* ---------------------------------------------------------- estado */
  const DEF = {
    theme: 'auto', exam: '', days: null, hpd: 4, sess: 50,
    mod: {}, time: {}, habit: [], errors: [], prova: {},
    scores: [{ id: 's0', nome: 'Diagnóstico', v: {} }, { id: 's1', nome: 'Simulado 1', v: {} }, { id: 's2', nome: 'Simulado 2', v: {} }],
    params: {}, open: {}, filt: { area: '', nivel: '', pend: false, hide: false }, lastPrompt: 'RLM'
  };
  let storageOK = true;
  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || 'null');
      return Object.assign(clone(DEF), r || {});
    } catch (e) { storageOK = false; return clone(DEF); }
  }
  let S = load();
  let saveTm;
  function save() {
    clearTimeout(saveTm);
    saveTm = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); }
      catch (e) { if (storageOK) { storageOK = false; toast('Este navegador não deixou salvar os dados. O progresso vale só enquanto a aba estiver aberta.'); } }
    }, 120);
  }
  const saveNow = () => { clearTimeout(saveTm); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  window.addEventListener('beforeunload', saveNow);

  /* ---------------------------------------------------------- cálculos do plano */
  const itemH = it => it.kind === 'mod' ? MOD[it.id].h : it.h;
  const itemName = it => it.kind === 'mod' ? MOD[it.id].nome : it.name;
  const itemArea = it => it.kind === 'mod' ? MOD[it.id].area : 'SIM';
  const status = it => S.mod[it.id];
  function stats() {
    let tot = 0, done = 0, mods = 0, modsDone = 0, rem = 0;
    ITEMS.forEach(it => {
      const s = status(it);
      if (s === 'skip') return;
      const h = itemH(it); tot += h;
      if (it.kind === 'mod') mods++;
      if (s === 'done') { done += h; if (it.kind === 'mod') modsDone++; } else rem += h;
    });
    const studied = Object.values(S.time).reduce((a, b) => a + b, 0);
    return { tot, done, mods, modsDone, rem, studied, pct: tot ? Math.round(done / tot * 100) : 0 };
  }
  const nextItem = () => ITEMS.find(it => !status(it));
  function errCount(id) { return S.errors.filter(e => e.modulo === id).length; }
  function examDays() {
    if (!S.exam) return null;
    const ms = new Date(S.exam) - new Date();
    if (isNaN(ms) || ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / 864e5));
  }
  const effDays = () => (S.days != null && S.days !== '') ? +S.days : (examDays() ?? 10);
  function coverage() {
    const days = effDays(), hpd = +S.hpd || 0;
    const total = days * hpd;
    const allowed = total < 30 ? 0 : (total < 55 ? 1 : 2);
    const pendSims = ITEMS.filter(it => it.kind === 'sim' && !status(it)).length;
    const sims = Math.min(allowed, pendSims);
    const habLeft = Math.max(0, D.habito.totalH - S.habit.length * D.habito.min / 60);
    const hab = total >= 30 ? habLeft : 0;
    const avail = Math.max(0, total - sims * D.simH - hab);
    let acc = 0, covered = 0, last = -1, broke = false;
    ITEMS.forEach((it, i) => {
      if (broke || status(it)) return;
      if (it.kind === 'sim') { if (covered > 0) last = i; return; }
      acc += itemH(it);
      if (acc <= avail + 1e-9) { covered++; last = i; } else broke = true;
    });
    const pend = ITEMS.filter(it => it.kind === 'mod' && !status(it)).length;
    return { days, hpd, total, sims, hab, avail, covered, pend, last };
  }

  /* ---------------------------------------------------------- toast e cópia */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove();
    }
    toast(okMsg || 'Copiado.');
  }

  /* ---------------------------------------------------------- timer */
  let T = null;
  try { T = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { T = null; }
  const saveT_ = () => { try { if (T) localStorage.setItem(TKEY, JSON.stringify(T)); else localStorage.removeItem(TKEY); } catch (e) { /* ignore */ } };
  let AC;
  function unlockAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* ignore */ } }
  function beep() {
    try {
      unlockAudio(); if (!AC) return;
      const t0 = AC.currentTime;
      [0, .28, .56].forEach((o, i) => {
        const osc = AC.createOscillator(), g = AC.createGain();
        osc.type = 'sine'; osc.frequency.value = i === 2 ? 988 : 784;
        g.gain.setValueAtTime(.0001, t0 + o);
        g.gain.exponentialRampToValueAtTime(.3, t0 + o + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t0 + o + .24);
        osc.connect(g); g.connect(AC.destination); osc.start(t0 + o); osc.stop(t0 + o + .26);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) { /* ignore */ }
  }
  const fmtClock = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  function timerLeft() {
    if (!T) return 0;
    if (T.state === 'running') return Math.max(0, Math.round((T.endAt - Date.now()) / 1000));
    return T.left;
  }
  function credit(minutes) {
    if (!T || T.isBreak || !T.id || minutes < 1) return;
    S.time[T.id] = (S.time[T.id] || 0) + minutes; save();
    toast(`+${minutes} min registrados em ${T.id}.`);
  }
  function startSession(id, minutes) {
    const it = ITEMS.find(x => x.id === id);
    if (!it) return;
    unlockAudio();
    const mins = minutes || +S.sess || 50;
    T = { id, name: itemName(it), area: itemArea(it), total: mins * 60, endAt: Date.now() + mins * 60000, left: mins * 60, state: 'running', isBreak: false };
    saveT_(); renderDock(); rerender();
  }
  function startBreak(mins) {
    unlockAudio();
    T = { id: null, name: 'Pausa', area: 'NEU', total: mins * 60, endAt: Date.now() + mins * 60000, left: mins * 60, state: 'running', isBreak: true };
    saveT_(); renderDock();
  }
  function timerToggle() {
    if (!T || T.state === 'finished') return;
    if (T.state === 'running') { T.left = timerLeft(); T.state = 'paused'; T.endAt = null; }
    else { T.endAt = Date.now() + T.left * 1000; T.state = 'running'; unlockAudio(); }
    saveT_(); renderDock();
  }
  function timerReset() {
    if (!T) return;
    T.left = T.total; T.endAt = Date.now() + T.total * 1000; T.state = 'running'; unlockAudio();
    saveT_(); renderDock();
  }
  function timerClose() {
    if (T && T.state !== 'finished') credit(Math.floor((T.total - timerLeft()) / 60));
    T = null; saveT_(); renderDock(); document.title = baseTitle; rerender();
  }
  function renderDock() {
    const el = $('#dock');
    if (!T) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.className = 'dock a-' + (T.area || 'NEU');
    const fin = T.state === 'finished';
    el.innerHTML = `
      <div class="dk-name">${esc(T.id ? T.id + ': ' : '')}${esc(T.name)}</div>
      <div class="dk-time" id="dk-time">${fmtClock(timerLeft())}</div>
      <div class="dk-ctl">
        ${fin
          ? `<button type="button" class="btn light" data-act="timer-break">Pausa de 10 min</button><button type="button" class="btn" data-act="timer-close">Fechar</button>`
          : `<button type="button" class="btn light" data-act="timer-toggle">${T.state === 'running' ? 'Pausar' : 'Retomar'}</button>
             <button type="button" class="btn" data-act="timer-reset">Zerar</button>
             <button type="button" class="btn" data-act="timer-close">Encerrar</button>`}
      </div>
      <div class="dk-bar"><i id="dk-bar" style="width:${fin ? 100 : (100 - timerLeft() / T.total * 100)}%"></i></div>`;
  }
  const baseTitle = document.title;
  function tick() {
    if (!T || T.state !== 'running') return;
    const left = timerLeft();
    const tm = $('#dk-time'), bar = $('#dk-bar');
    if (tm) tm.textContent = fmtClock(left);
    if (bar) bar.style.width = (100 - left / T.total * 100) + '%';
    document.title = `${fmtClock(left)} · ${T.name}`;
    if (left <= 0) {
      credit(Math.round(T.total / 60));
      T.state = 'finished'; T.left = 0; T.endAt = null; saveT_();
      beep(); renderDock(); $('#dock').classList.add('finished');
      document.title = 'Tempo! · ' + baseTitle;
      toast(T.isBreak ? 'Pausa terminou. Hora de voltar.' : 'Sessão concluída. Faça uma pausa.');
      rerender();
    }
  }
  if (T && T.state === 'running' && timerLeft() <= 0) { T.state = 'finished'; T.left = 0; T.endAt = null; saveT_(); }
  setInterval(tick, 500);

  /* ---------------------------------------------------------- componentes */
  function rulerHTML(opts = {}) {
    const next = nextItem();
    const segs = ITEMS.map((it, i) => {
      const a = itemArea(it);
      const s = status(it);
      const prev = ITEMS[i - 1];
      const ph = prev && prev.phase !== it.phase;
      const h = itemH(it);
      const label = it.kind === 'sim' ? 'S' + it.id.slice(3) : (h >= 2.5 ? it.id : '');
      const tip = `${itemName(it)} (${fh(h)})${s === 'done' ? ', feito' : s === 'skip' ? ', já domino' : ''}`;
      return `<button type="button" class="rs a-${a}${it.kind === 'sim' ? ' sim' : ''}${ph ? ' ph' : ''}${s === 'done' ? ' done' : ''}${s === 'skip' ? ' skipped' : ''}${next && next.id === it.id ? ' cur' : ''}"
        style="--m:${h};--k:${i}" data-i="${i}" ${opts.mini ? 'tabindex="-1" aria-hidden="true"' : `data-act="goto-mod" data-id="${it.id}"`}
        title="${esc(tip)}" aria-label="${esc(tip)}">${esc(label)}</button>`;
    }).join('');
    const cov = opts.cov ? '<div class="cov" id="cov"><b id="cov-lbl"></b></div>' : '';
    const phases = opts.mini ? '' : `<div class="phases" id="phases" aria-hidden="true">${[1, 2, 3].map(p => `<span data-p="${p}">${esc(PHASE_NAME[p])}</span>`).join('')}</div>`;
    return `<div class="ruler${opts.mini ? ' mini' : ''}${opts.enter ? ' enter' : ''}" ${opts.mini ? '' : 'id="ruler"'}>${segs}${cov}</div>${phases}`;
  }
  function placeRulerExtras() {
    const r = $('#ruler'); if (!r) return;
    const segs = $$('.rs', r);
    const ph = $('#phases');
    if (ph) {
      $$('span', ph).forEach(sp => {
        const idx = ITEMS.findIndex(it => it.phase === +sp.dataset.p);
        const seg = segs[idx];
        if (seg) sp.style.left = Math.max(0, Math.min(seg.offsetLeft, r.offsetWidth - sp.offsetWidth)) + 'px';
      });
    }
    const cov = $('#cov'); if (!cov) return;
    const c = coverage();
    const lbl = $('#cov-lbl');
    if (c.last < 0) { cov.style.left = '0px'; cov.classList.remove('end'); }
    else {
      const seg = segs[c.last];
      const x = seg.offsetLeft + seg.offsetWidth;
      cov.style.left = x + 'px';
      cov.classList.toggle('end', x > r.offsetWidth * 0.55);
    }
    lbl.textContent = c.covered >= c.pend && c.pend > 0 ? 'seu tempo cobre tudo' : (c.pend === 0 ? 'plano concluído' : `seu tempo: ${c.covered} de ${c.pend}`);
  }
  function legendHTML() {
    return `<div class="legend">${AREAS.map(a => `<span class="a-${a}"><i></i>${esc(AREA_NAME[a])}</span>`).join('')}<span class="a-SIM"><i></i>Simulado</span><span class="a-NEU"><i></i>Já domino (fora das horas)</span></div>`;
  }
  function accordion(items) {
    return items.map(it => `<details class="acc"><summary>${esc(it.title)}</summary><div class="acc-body prose">${it.html}</div></details>`).join('');
  }

  /* detalhes de módulo (edital, pesquisar, saber fazer) */
  function modDetails(m, withTitle) {
    const terms = m.terms.map(t => `<a class="term" href="https://www.google.com/search?q=${encodeURIComponent(t)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('');
    const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(m.nome + ' aula')}`;
    return `<dl class="${withTitle ? 'kv' : ''}">
      <dt>Edital</dt><dd>${esc(m.edital)}</dd>
      <dt>Pesquisar</dt><dd><span class="terms a-${m.area}">${terms}</span>
        ${m.pnote ? `<p class="small muted" style="margin-top:.4rem">${esc(m.pnote)}</p>` : ''}
        <p class="small" style="margin-top:.4rem"><a href="${yt}" target="_blank" rel="noopener">Buscar vídeo-aulas deste módulo</a></p></dd>
      <dt>Saber fazer</dt><dd>${esc(m.saber)}</dd>
    </dl>`;
  }

  /* ---------------------------------------------------------- view: painel */
  let enterOnce = true;
  function nextCardHTML() {
    const it = nextItem();
    if (!it) return `<section class="panel next-card"><h2>Plano concluído</h2><p class="muted" style="margin-top:.5rem">Todos os itens estão marcados. Use o que sobrar para refazer os erros reincidentes e fazer um último simulado.</p><div class="next-actions"><a class="btn primary" href="#/erros">Ver registro de erros</a></div></section>`;
    if (it.kind === 'sim') {
      return `<section class="panel next-card a-SIM">
        <div class="meta"><span class="chip solid a-SIM">Checkpoint</span><span class="chip a-NEU">${fh(it.h)}</span></div>
        <h2>${esc(it.name)}</h2>
        <p class="muted">${esc(SIM_TEXT)}</p>
        <div class="next-actions">
          <a class="btn primary" href="#/prompts">Abrir prompts</a>
          <a class="btn" href="#/erros/placar">Registrar placar</a>
          <button type="button" class="btn" data-act="mod-done" data-id="${it.id}">Marcar como feito</button>
          <button type="button" class="btn ghost" data-act="mod-skip" data-id="${it.id}">Pular este checkpoint</button>
        </div></section>`;
    }
    const m = MOD[it.id];
    const studied = S.time[m.id] || 0;
    return `<section class="panel next-card a-${m.area}">
      <div class="meta">${chipA(m.area)}<span class="chip a-NEU">${NIVEL_NAME[m.nivel]}</span><span class="chip a-NEU">${fh(m.h)}</span>${studied ? `<span class="chip a-NEU">${fmin(studied)} estudados</span>` : ''}</div>
      <h2>${esc(m.id)} · ${esc(m.nome)}</h2>
      <p class="small muted">Próximo da lista. Leia a meta, pesquise os termos e estude até conseguir fazer o que está em "saber fazer".</p>
      ${modDetails(m, true)}
      <div class="next-actions">
        <button type="button" class="btn area a-${m.area}" data-act="session" data-id="${m.id}">Iniciar sessão de ${S.sess} min</button>
        <button type="button" class="btn" data-act="open-prompt" data-id="${m.id}">Abrir prompt</button>
        <button type="button" class="btn" data-act="mod-done" data-id="${m.id}">Marcar como feito</button>
        <button type="button" class="btn ghost" data-act="mod-skip" data-id="${m.id}">Já domino</button>
      </div></section>`;
  }
  function viewPainel() {
    const st = stats(), c = coverage();
    const nxt = ITEMS.filter(it => !status(it)).slice(1, 5);
    const habitTarget = Math.ceil(D.habito.totalH * 60 / D.habito.min);
    const hToday = S.habit.includes(todayISO());
    const dots = Array.from({ length: habitTarget }, (_, i) => `<i class="${i < S.habit.length ? 'on' : ''}"></i>`).join('');
    const html = `
    <header class="page-head">
      <h1>Seu plano, módulo a módulo</h1>
      <p>A régua mostra todo o conteúdo programático. Cada trecho é um módulo, com largura proporcional às horas. Siga a ordem, marque o que concluir e deixe o app calcular o que cabe no seu tempo.</p>
    </header>
    <div class="ruler-wrap" aria-label="Régua do plano">
      ${rulerHTML({ cov: true, enter: enterOnce })}
      ${legendHTML()}
    </div>
    <div class="stats">
      <div class="stat-box"><b>${st.pct}%</b><span>do plano concluído (em horas)</span></div>
      <div class="stat-box"><b>${st.modsDone}<small style="font-size:1rem;color:var(--ink-3)"> / ${st.mods}</small></b><span>módulos feitos</span></div>
      <div class="stat-box"><b>${fh(st.rem).replace(' h', '')}<small style="font-size:1rem;color:var(--ink-3)"> h</small></b><span>de estudo restantes (estimativa)</span></div>
      <div class="stat-box"><b>${fmin(Math.round(st.studied))}</b><span>de tempo registrado nas sessões</span></div>
    </div>
    <div class="dash-grid">
      ${nextCardHTML()}
      <div class="side-stack">
        <section class="panel">
          <h2>Quanto cabe no seu tempo</h2>
          <div class="calc-grid">
            <label class="field"><span>Dias até a prova</span><input type="number" min="1" max="365" inputmode="numeric" data-calc="days" value="${S.days ?? ''}" placeholder="${effDays()}"></label>
            <label class="field"><span>Horas por dia</span><input type="number" min="0.5" max="14" step="0.5" inputmode="decimal" data-calc="hpd" value="${S.hpd}"></label>
          </div>
          <div class="calc-out" id="calc-out"></div>
          <p class="small muted" style="margin-top:.6rem">Marque "já domino" nos módulos que você acerta sem estudar: as horas deles saem da conta.</p>
        </section>
        <section class="panel">
          <h2>Leitura diária em inglês</h2>
          <p class="small muted">${D.habito.min} min por dia de textos de economia e negócios. Meta: ${habitTarget} dias (cerca de ${D.habito.totalH} h).</p>
          <div class="habit-row" style="margin-top:.7rem">
            <button type="button" class="btn ${hToday ? '' : 'primary'}" data-act="habit">${hToday ? 'Leitura de hoje registrada' : 'Li hoje'}</button>
            <span class="small"><strong>${S.habit.length}</strong> de ${habitTarget} dias</span>
          </div>
          <div class="habit-dots" aria-hidden="true">${dots}</div>
        </section>
        ${nxt.length ? `<section class="panel"><h2>A seguir</h2><ul class="upnext">${nxt.map(it => `<li>${it.kind === 'mod' ? chipA(MOD[it.id].area) : '<span class="chip a-SIM">Simulado</span>'}<a href="#/modulos/${it.id}">${esc(itemName(it))}</a><span class="muted small">${fh(itemH(it))}</span></li>`).join('')}</ul></section>` : ''}
      </div>
    </div>`;
    enterOnce = false;
    return html;
  }
  function updateCalc() {
    const out = $('#calc-out'); if (!out) return;
    const c = coverage();
    const simTxt = c.sims ? `, com tempo para ${c.sims} simulado${c.sims > 1 ? 's' : ''}` : ', sem tempo reservado para simulado';
    let txt;
    if (c.pend === 0) txt = 'Todos os módulos estão marcados.';
    else if (c.covered >= c.pend) txt = `Cabe <strong>tudo</strong> (${c.pend} módulos)${simTxt}.`;
    else txt = `Cabem <strong>${c.covered} dos ${c.pend}</strong> módulos pendentes${simTxt}. Corte pelo fim da lista.`;
    out.innerHTML = `<strong>${fh(c.total).replace(' h', '')} h</strong> no total (${c.days} dias × ${String(c.hpd).replace('.', ',')} h). ${txt}`;
    placeRulerExtras();
  }

  /* ---------------------------------------------------------- view: módulos */
  function modRowHTML(it, pos, curId) {
    const s = status(it);
    if (it.kind === 'sim') {
      return `<li class="mrow simrow a-SIM${s === 'done' ? ' done' : ''}${s === 'skip' ? ' skipped' : ''}" id="m-${it.id}">
        <div class="mrow-main">
          <label class="chk"><input type="checkbox" data-act="mod-toggle" data-id="${it.id}" ${s === 'done' ? 'checked' : ''} aria-label="Marcar ${esc(it.name)} como feito"><span></span></label>
          <div class="mrow-title"><div class="line1"><h3>${esc(it.name)}</h3><span class="chip solid a-SIM">Checkpoint</span><span class="chip a-NEU">${fh(it.h)}</span></div>
            <p class="small muted" style="margin-top:.3rem;max-width:68ch">${esc(SIM_TEXT)}</p></div>
          <div class="mrow-actions"><a class="btn sm" href="#/prompts">Prompts</a><a class="btn sm" href="#/erros/placar">Placar</a></div>
        </div></li>`;
    }
    const m = MOD[it.id];
    const studied = S.time[m.id] || 0, ec = errCount(m.id);
    const open = S.open[m.id] ?? false;
    return `<li class="mrow a-${m.area}${s === 'done' ? ' done' : ''}${s === 'skip' ? ' skipped' : ''}${curId === it.id ? ' cur' : ''}" id="m-${m.id}">
      <div class="mrow-main">
        <label class="chk"><input type="checkbox" data-act="mod-toggle" data-id="${m.id}" ${s === 'done' ? 'checked' : ''} ${s === 'skip' ? 'disabled' : ''} aria-label="Marcar ${esc(m.nome)} como feito"><span></span></label>
        <div class="mrow-title">
          <div class="line1"><span class="mnum">#${it.n}</span><h3>${esc(m.nome)}</h3>${chipA(m.area)}<span class="chip a-NEU">${NIVEL_NAME[m.nivel]}</span><span class="chip a-NEU">${fh(m.h)}</span></div>
          <div class="mrow-meta"><span>${esc(m.id)}</span>${studied ? `<span>${fmin(studied)} de ${fh(m.h)} estudados</span>` : ''}${ec ? `<a class="badge-err" href="#/erros">${ec} ${ec > 1 ? 'erros' : 'erro'} no registro</a>` : ''}${s === 'skip' ? '<span>já domino</span>' : ''}</div>
        </div>
        <div class="mrow-actions">
          ${s === 'skip' ? `<button type="button" class="btn sm" data-act="mod-skip" data-id="${m.id}">Voltar a estudar</button>` :
            `<button type="button" class="btn sm" data-act="session" data-id="${m.id}">Sessão ${S.sess} min</button>
             <button type="button" class="btn sm" data-act="open-prompt" data-id="${m.id}">Prompt</button>
             <button type="button" class="btn sm ghost" data-act="mod-skip" data-id="${m.id}">Já domino</button>`}
        </div>
      </div>
      <details class="more" data-k="${m.id}"${open ? ' open' : ''}><summary>Edital, o que pesquisar e a meta</summary><div class="more-body">${modDetails(m, false)}</div></details>
    </li>`;
  }
  function viewModulos(arg) {
    if (AREAS.includes(arg)) { S.filt.area = arg; save(); }
    else if (arg && (MOD[arg] || /^SIM\d$/.test(arg))) { S.filt = { area: '', nivel: '', pend: false, hide: false }; save(); }
    const F = S.filt;
    const cur = nextItem();
    const areaChips = `<div class="grp">${[['', 'Todas as áreas']].concat(AREAS.map(a => [a, AREA_SHORT[a]])).map(([a, l]) => `<button type="button" class="fchip ${a ? 'a-' + a : ''}" data-act="f-area" data-v="${a}" aria-pressed="${F.area === a}">${esc(l)}</button>`).join('')}</div>`;
    const nivChips = `<div class="grp">${[['', 'Todos os níveis'], ['1', 'Nível 1'], ['2', 'Nível 2'], ['3', 'Nível 3']].map(([v, l]) => `<button type="button" class="fchip" data-act="f-nivel" data-v="${v}" aria-pressed="${String(F.nivel) === v}">${l}</button>`).join('')}</div>`;
    let out = '', lastPhase = 0, count = 0;
    let phaseH = {}, phaseN = {};
    const visible = ITEMS.filter(it => {
      const s = status(it);
      if (it.kind === 'sim') return !F.area && !F.nivel && !(F.pend && s) && !(F.hide && s === 'skip');
      const m = MOD[it.id];
      if (F.area && m.area !== F.area) return false;
      if (F.nivel && String(m.nivel) !== String(F.nivel)) return false;
      if (F.pend && s) return false;
      if (F.hide && s === 'skip') return false;
      return true;
    });
    visible.forEach(it => { if (it.kind === 'mod') { phaseH[it.phase] = (phaseH[it.phase] || 0) + itemH(it); phaseN[it.phase] = (phaseN[it.phase] || 0) + 1; } });
    visible.forEach(it => {
      if (it.phase !== lastPhase) {
        lastPhase = it.phase;
        out += `</ul><div class="phase-head"><h2>${esc(PHASE_NAME[it.phase])}</h2><span>${phaseN[it.phase] || 0} módulos, ${fh(phaseH[it.phase] || 0)}</span></div><ul class="mrows">`;
      }
      out += modRowHTML(it, ++count, cur && cur.id);
    });
    const intro = F.area ? `<div class="area-intro"><strong>${esc(AREA_NAME[F.area])}</strong>: ${D.areas[F.area].n} módulos, cerca de ${fh(D.areas[F.area].h)}${F.area === 'EN' ? ' mais a leitura diária' : ''}. Fontes: ${esc(D.areas[F.area].fontes)}, mais o simulado oficial e os exemplos de questões do site do Teste ANPAD. Treino: <a href="#/prompts/${F.area}">prompt desta área</a>.</div>` : '';
    return `
      <header class="page-head"><h1>Módulos</h1><p>Todo o conteúdo programático, na ordem sugerida. Abra um módulo para ver o trecho do edital, os termos para pesquisar e a meta. Os termos abrem uma busca no Google.</p></header>
      <div class="filters">${areaChips}${nivChips}
        <div class="grp"><button type="button" class="fchip" data-act="f-pend" aria-pressed="${F.pend}">Só pendentes</button><button type="button" class="fchip" data-act="f-hide" aria-pressed="${F.hide}">Esconder dominados</button></div>
      </div>
      ${intro}
      ${out ? out.replace(/^<\/ul>/, '') + '</ul>' : '<div class="empty"><h3>Nenhum módulo com esses filtros</h3><button type="button" class="btn" data-act="f-clear">Limpar filtros</button></div>'}`;
  }

  /* ---------------------------------------------------------- view: prompts */
  function pParams(p) {
    const base = { n: p.n || 10, modo: 'TREINO FOCADO', foco: '', dif: 'mista: 30% fácil, 50% média, 20% difícil', fracos: '' };
    return Object.assign(base, S.params[p.id] || {});
  }
  function buildPrompt(p) {
    let t = p.text;
    if (!p.params) return t;
    const v = pParams(p);
    const rep = (re, label, val) => { t = t.replace(new RegExp('^- ' + re + '[^:\\n]*:.*$', 'm'), () => `- ${label}: ${val}`); };
    rep('QUANTIDADE', 'QUANTIDADE', v.n);
    rep('MODO', 'MODO', v.modo);
    rep('FOCO', 'FOCO', v.modo === 'SIMULADO' ? 'não se aplica no modo SIMULADO (misture os tipos na proporção sugerida)' : (v.foco || 'misture os tipos mais frequentes da prova'));
    rep('DIFICULDADE', 'DIFICULDADE', v.dif);
    rep('MEUS PONTOS FRACOS(?: ATUAIS)?', 'MEUS PONTOS FRACOS', v.fracos || 'nenhum em especial');
    return t;
  }
  function promptHTML(text) {
    return esc(text).split('\n').map(l =>
      /^- (QUANTIDADE|MODO|FOCO|DIFICULDADE|MEUS PONTOS FRACOS)/.test(l) ? `<mark>${l}</mark>`
        : /^# /.test(l) ? `<span class="h">${l}</span>` : l).join('\n');
  }
  function updatePreview(p) {
    const t = buildPrompt(p);
    const pre = $('#prompt-pre'); if (pre) pre.innerHTML = promptHTML(t);
    const st = $('#prompt-stat'); if (st) st.textContent = `${t.split(/\s+/).length} palavras, ${t.length.toLocaleString('pt-BR')} caracteres`;
  }
  let curPrompt = null;
  function viewPrompts(id) {
    const p = D.prompts.find(x => x.id === (id || S.lastPrompt)) || D.prompts[3];
    curPrompt = p; S.lastPrompt = p.id; save();
    const cls = p.id === 'TUTOR' ? 'a-NEU' : 'a-' + p.id;
    const list = D.prompts.map(x => `<li><a class="${x.id === 'TUTOR' ? 'a-NEU' : 'a-' + x.id}" href="#/prompts/${x.id}" aria-current="${x.id === p.id}"><strong>${esc(x.name)}</strong><span>${esc(x.when)}</span></a></li>`).join('');
    let form = '';
    if (p.params) {
      const v = pParams(p);
      const difs = ['mista: 30% fácil, 50% média, 20% difícil', 'fácil', 'média', 'difícil'];
      form = `<div class="params ${cls}">
        <label class="field"><span>Quantidade de questões</span><input type="number" min="1" max="40" value="${esc(v.n)}" data-param="n"></label>
        <div class="field"><span>Modo</span>
          <div class="tabs" role="group" aria-label="Modo">
            <button type="button" data-act="param-modo" data-v="TREINO FOCADO" aria-pressed="${v.modo === 'TREINO FOCADO'}">Treino focado</button>
            <button type="button" data-act="param-modo" data-v="SIMULADO" aria-pressed="${v.modo === 'SIMULADO'}">Simulado</button>
          </div>
        </div>
        <label class="field wide"><span>Foco do treino (use o nome de um módulo)</span>
          <input type="text" value="${esc(v.foco)}" data-param="foco" placeholder="Escolha um módulo abaixo ou escreva o seu" ${v.modo === 'SIMULADO' ? 'disabled' : ''}>
          <span class="chips">${p.focos.map(f => `<button type="button" data-act="param-foco" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</span>
        </label>
        <label class="field"><span>Dificuldade</span><select data-param="dif">${difs.map(o => `<option${o === v.dif ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        <label class="field wide"><span>Meus pontos fracos (opcional)</span><textarea data-param="fracos" rows="3" placeholder="Ex.: comando em negativo, vocabulário, lógica...">${esc(v.fracos)}</textarea></label>
      </div>`;
    }
    return `
    <header class="page-head">
      <h1>Prompts para gerar questões</h1>
      <p>Um por área, no molde da prova, mais um tutor para estudo reverso. Ajuste os parâmetros, copie e cole em uma conversa nova.</p>
    </header>
    <div class="prompt-layout">
      <div>
        <ul class="plist">${list}</ul>
        <section class="panel howto">
          <h3>Como usar</h3>
          <ol>
            <li>Abra uma conversa nova para cada área e cole o prompt.</li>
            <li>Na fase 1, resolva só as questões, no papel e cronometrado.</li>
            <li>Na fase 2, envie suas respostas (<code>1-C, 2-A...</code>) ou escreva <code>GABARITO</code>.</li>
            <li>Nos simulados, use o modo Simulado, 10 questões por área, e não abra o gabarito antes.</li>
          </ol>
          <p class="small muted" style="margin-top:.7rem">Gabaritos gerados por IA podem errar, principalmente em RLM. Se a sua resolução divergir, refaça e questione.</p>
        </section>
      </div>
      <div class="${cls}">
        <h2 style="font-size:1.6rem">${esc(p.name)}</h2>
        ${form}
        <div class="preview-head">
          <div><h2>Prompt pronto</h2><span class="stat" id="prompt-stat"></span></div>
          <div class="row">
            ${p.params ? `<button type="button" class="btn sm" data-act="copy-snippet" data-text="GABARITO">Copiar GABARITO</button>
            <button type="button" class="btn sm" data-act="copy-answers">Copiar modelo de resposta</button>` : ''}
            <button type="button" class="btn area ${cls}" data-act="copy-prompt">Copiar prompt</button>
          </div>
        </div>
        <pre class="prompt ${cls}" id="prompt-pre" tabindex="0" aria-label="Texto do prompt"></pre>
      </div>
    </div>`;
  }

  /* ---------------------------------------------------------- view: erros */
  const F = { area: '', tipo: '', pend: false };
  function revStatus(e, k) {
    const due = addDays(e.date, k);
    if (e.rev[`d${k}`]) return 'done';
    return due <= todayISO() ? 'due' : 'wait';
  }
  function errItemHTML(e) {
    const chips = [1, 3, 7].map(k => {
      const st = revStatus(e, k);
      return `<button type="button" class="rev ${st}" data-act="err-rev" data-id="${e.id}" data-k="${k}" title="Revisão D+${k}, ${fmtDM(addDays(e.date, k))}" aria-pressed="${st === 'done'}">D+${k}<small>${fmtDM(addDays(e.date, k))}</small></button>`;
    }).join('');
    const mod = e.modulo && MOD[e.modulo] ? `<a class="chip a-${MOD[e.modulo].area}" href="#/modulos/${e.modulo}">${esc(e.modulo)}</a>` : '';
    return `<li class="err a-${e.area}">
      <div class="err-meta"><span>${fmtDM(e.date)}</span>${chipA(e.area)}</div>
      <div class="err-body">
        <p class="why">${esc(e.porque)}</p>
        ${e.regra ? `<p class="rule">Regra: ${esc(e.regra)}</p>` : ''}
        <div class="err-tags">${(e.tipos || []).map(t => `<span class="tg" title="${esc(TYPES[t])}">${t} ${esc(TYPES[t])}</span>`).join('')}${mod}<span class="muted small">${esc(e.origem || '')}</span>${e.reinc ? '<span class="chip" style="--c:var(--danger)">reincidente</span>' : ''}</div>
      </div>
      <div class="err-side">
        <div class="revs">${chips}</div>
        <div class="row">
          <button type="button" class="btn sm ghost" data-act="err-reinc" data-id="${e.id}">${e.reinc ? 'Tirar de reincidentes' : 'Marcar reincidente'}</button>
          <button type="button" class="btn sm ghost" data-act="err-del" data-id="${e.id}" aria-label="Apagar erro">Apagar</button>
        </div>
      </div>
    </li>`;
  }
  function errList() {
    let list = S.errors.slice();
    if (F.area) list = list.filter(e => e.area === F.area);
    if (F.tipo) list = list.filter(e => (e.tipos || []).includes(F.tipo));
    if (F.pend) list = list.filter(e => [1, 3, 7].some(k => revStatus(e, k) === 'due'));
    list.sort((a, b) => b.date.localeCompare(a.date));
    if (!S.errors.length) {
      return `<div class="empty"><h3>Nenhum erro registrado ainda</h3><p class="muted" style="max-width:52ch">Cada erro vira uma linha: o que aconteceu, o tipo e a regra para não repetir. Registre acima o primeiro erro de um treino ou leia como classificar na seção Guia.</p><a class="btn" href="#/guia/registro">Como registrar erros</a></div>`;
    }
    if (!list.length) return `<div class="empty"><h3>Nenhum erro com esses filtros</h3><button type="button" class="btn" data-act="err-clear-filters">Limpar filtros</button></div>`;
    return `<ul class="errs">${list.map(errItemHTML).join('')}</ul>`;
  }
  function viewErros(tab) {
    const tabs = `<div class="tabs" role="group" aria-label="Erros"><a href="#/erros/registro" ${tab === 'registro' ? 'aria-current="true"' : ''}>Registro de erros</a><a href="#/erros/placar" ${tab === 'placar' ? 'aria-current="true"' : ''}>Placar e diagnóstico</a></div>`;
    if (tab === 'placar') return `
      <header class="page-head"><h1>Placar e diagnóstico</h1><p>Anote os acertos do simulado diagnóstico e de cada simulado seguinte. O gráfico compara os resultados e mostra a referência de 60%.</p></header>
      ${tabs}<div style="margin-top:1.5rem">${placarHTML()}</div>`;
    const due = S.errors.reduce((a, e) => a + [1, 3, 7].filter(k => revStatus(e, k) === 'due').length, 0);
    const reinc = S.errors.filter(e => e.reinc).length;
    const byType = Object.keys(TYPES).map(t => [t, S.errors.filter(e => (e.tipos || []).includes(t)).length]);
    const maxT = Math.max(1, ...byType.map(x => x[1]));
    const typesHTML = S.errors.length ? `<div class="types" aria-label="Erros por tipo">${byType.map(([t, c]) => `<div class="type-row"><span>${t} ${esc(TYPES[t])}</span><div class="eff-track"><i style="width:${c / maxT * 100}%"></i></div><span>${c}</span></div>`).join('')}</div>` : '';
    const modOpts = AREAS.map(a => `<optgroup label="${esc(AREA_NAME[a])}">${Object.values(MOD).filter(m => m.area === a).map(m => `<option value="${m.id}">${esc(m.id)} · ${esc(m.nome)}</option>`).join('')}</optgroup>`).join('');
    return `
      <header class="page-head"><h1>Registro de erros</h1><p>Cada erro vira uma linha: tipo e regra. Revise em D+1, D+3 e D+7. O erro que volta duas vezes é reincidente. <a href="#/guia/registro">Como classificar os erros</a>.</p></header>
      ${tabs}
      <div class="stats">
        <div class="stat-box"><b>${S.errors.length}</b><span>erros registrados</span></div>
        <div class="stat-box${due ? ' alert' : ''}"><b>${due}</b><span>revisões vencidas hoje</span></div>
        <div class="stat-box"><b>${reinc}</b><span>reincidentes</span></div>
        <div class="stat-box"><b>${S.errors.length ? Math.round(S.errors.filter(e => e.rev.d1 && e.rev.d3 && e.rev.d7).length / S.errors.length * 100) : 0}%</b><span>com as 3 revisões feitas</span></div>
      </div>
      ${typesHTML}
      <details class="acc" ${S.errors.length ? '' : 'open'}>
        <summary>Registrar um erro</summary>
        <div class="acc-body">
          <form id="err-form" class="form-grid">
            <label class="field c3"><span>Data</span><input type="date" name="date" value="${todayISO()}" required></label>
            <label class="field c3"><span>Área</span><select name="area" required>${AREAS.map(a => `<option value="${a}">${esc(AREA_SHORT[a])}</option>`).join('')}</select></label>
            <label class="field c6"><span>Origem</span><input type="text" name="origem" placeholder="Simulado 1, Q7, ou o nome do livro"></label>
            <label class="field c12"><span>Módulo relacionado (opcional)</span><select name="modulo"><option value="">Nenhum</option>${modOpts}</select></label>
            <div class="field c12"><span>Tipo de erro</span><div class="tipos">${D.tipos.map(t => `<label><input type="checkbox" name="tipo" value="${t[0]}"><span>${t[0]} ${esc(t[1])}</span></label>`).join('')}</div></div>
            <label class="field c12"><span>Por que errei (uma frase)</span><input type="text" name="porque" required placeholder="Ex.: li o comando INADMISSÍVEL como se fosse admissível"></label>
            <label class="field c12"><span>Regra para não repetir</span><input type="text" name="regra" placeholder="Ex.: marque NEG ou POS no comando antes de ler o texto"></label>
            <div class="c12 row" style="margin-top:.75rem"><button type="submit" class="btn primary">Salvar erro</button></div>
          </form>
        </div>
      </details>
      <div class="filters-e">
        <select data-act="f-earea" aria-label="Filtrar por área"><option value="">Todas as áreas</option>${AREAS.map(a => `<option value="${a}"${F.area === a ? ' selected' : ''}>${esc(AREA_SHORT[a])}</option>`).join('')}</select>
        <select data-act="f-etipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${D.tipos.map(t => `<option value="${t[0]}"${F.tipo === t[0] ? ' selected' : ''}>${t[0]} ${esc(t[1])}</option>`).join('')}</select>
        <label class="row" style="gap:.4rem"><input type="checkbox" data-act="f-epend" ${F.pend ? 'checked' : ''}> Só com revisão vencida</label>
        <span style="flex:1"></span>
        <button type="button" class="btn sm" data-act="err-copy-md">Copiar como tabela Markdown</button>
        <button type="button" class="btn sm" data-act="err-export">Baixar JSON</button>
        <label class="btn sm" for="err-import">Importar JSON</label><input id="err-import" type="file" accept="application/json" hidden>
      </div>
      <div id="err-list">${errList()}</div>`;
  }

  /* placar + radar */
  const AX = [['PT', -90], ['EN', 0], ['RA', 90], ['RLM', 180]];
  function radarSVG(series) {
    const cx = 180, cy = 165, R = 105;
    const pt = (a, v) => { const r = R * v / 100, t = a * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
    const pts = vals => AX.map(([k, a]) => pt(a, Math.max(0, Math.min(100, vals[k] ?? 0))).map(n => n.toFixed(1)).join(',')).join(' ');
    const rings = [25, 50, 75, 100].map(v => `<polygon class="ring" points="${pts({ PT: v, EN: v, RA: v, RLM: v })}"/>`).join('');
    const axes = AX.map(([k, a]) => { const [x, y] = pt(a, 100); return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const anchors = { PT: ['middle', -10], EN: ['start', 5], RA: ['middle', 20], RLM: ['end', 5] };
    const short = { PT: 'Português', EN: 'Inglês', RA: 'Analítico', RLM: 'RLM' };
    const labels = AX.map(([k, a]) => { const [x, y] = pt(a, 100 + 12 / R * 100); const [an, dy] = anchors[k]; return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${an}">${short[k]}</text>`; }).join('');
    const ser = series.map(s => `<polygon class="${s.cls}" points="${pts(s.vals)}"/>`).join('');
    return `<svg class="radar" viewBox="0 0 360 330" role="img" aria-label="Gráfico de radar com o desempenho por área">${rings}${axes}${ser}${labels}</svg>`;
  }
  const filled = (v, a) => v[a] !== undefined && v[a] !== '' && v[a] !== null;
  function placarHTML() {
    const rows = S.scores.map(r => `<tr data-sid="${r.id}">
      <td><input type="text" class="name" data-sname="${r.id}" value="${esc(r.nome)}" aria-label="Nome do simulado"></td>
      ${AREAS.slice().sort((a, b) => ['PT', 'EN', 'RA', 'RLM'].indexOf(a) - ['PT', 'EN', 'RA', 'RLM'].indexOf(b)).map(a => `<td><input type="number" min="0" max="10" step="1" inputmode="numeric" data-score="${r.id}" data-a="${a}" value="${r.v[a] ?? ''}" aria-label="${esc(r.nome)}, ${AREA_SHORT[a]}, acertos de 10"></td>`).join('')}
      <td class="tot" id="tot-${r.id}"></td>
      <td><button type="button" class="btn sm ghost" data-act="score-del" data-id="${r.id}" aria-label="Remover linha">×</button></td></tr>`).join('');
    return `
      <div class="score-wrap">
        <div>
          <div class="tw"><table class="score-table">
            <thead><tr><th>Simulado</th><th>PT</th><th>EN</th><th>RA</th><th>RLM</th><th>Total</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <div class="row" style="margin-top:.7rem"><button type="button" class="btn sm" data-act="score-add">Adicionar simulado</button></div>
          <p class="small muted" style="margin-top:.6rem">Acertos de 10 questões por área (PT, EN, RA e RLM).</p>
          <ul class="hints" id="hints"></ul>
        </div>
        <div>
          <div id="radar"></div>
          <div class="radar-legend" id="radar-legend"></div>
        </div>
      </div>
      <section class="panel" style="margin-top:2rem;max-width:760px">
        <h2>Como ler o resultado</h2>
        <ul class="prose" style="padding-left:1.2rem;display:grid;gap:.4rem">${D.leitura.map(l => `<li>${l}</li>`).join('')}</ul>
      </section>`;
  }
  function updatePlacar() {
    S.scores.forEach(r => {
      const vals = AREAS.filter(a => filled(r.v, a)).map(a => +r.v[a]);
      const el = $('#tot-' + r.id); if (el) el.textContent = vals.length ? `${vals.reduce((x, y) => x + y, 0)}/${vals.length * 10}` : '';
    });
    const withData = S.scores.filter(r => AREAS.some(a => filled(r.v, a))).slice(-4);
    const series = [{ cls: 'rd-ref', vals: { PT: 60, EN: 60, RA: 60, RLM: 60 } }];
    withData.forEach((r, i) => series.push({ cls: 'rd-' + i, vals: Object.fromEntries(AREAS.map(a => [a, filled(r.v, a) ? +r.v[a] * 10 : 0])) }));
    const rd = $('#radar'); if (rd) rd.innerHTML = radarSVG(series);
    const lg = $('#radar-legend');
    if (lg) lg.innerHTML = withData.map((r, i) => `<span><i style="background:${['var(--ink)', 'var(--EN)', 'var(--PT)', 'var(--RLM)'][i]}"></i>${esc(r.nome)}</span>`).join('') + '<span><i style="background:var(--NEU)"></i>Referência de 60%</span>';
    const h = $('#hints');
    if (h) {
      const last = withData[withData.length - 1];
      h.innerHTML = last ? AREAS.filter(a => filled(last.v, a) && +last.v[a] < 6).map(a =>
        `<li>${esc(AREA_SHORT[a])} abaixo de 60% em «${esc(last.nome)}»: volte aos módulos de nível 1 dessa área e refaça os erros. <a href="#/modulos/${a}">Ver módulos de ${esc(AREA_SHORT[a])}</a>.</li>`).join('') : '';
    }
  }

  /* ---------------------------------------------------------- view: guia */
  function viewGuia(slug) {
    const notes = D.guia.concat([{ slug: 'prova', title: 'Prova e edital' }]);
    const cur = notes.find(n => n.slug === slug) || notes[0];
    const list = notes.map(n => `<li><a class="a-${n.slug === 'prova' ? 'SIM' : 'EN'}" href="#/guia/${n.slug}" aria-current="${n.slug === cur.slug}"><strong>${esc(n.title)}</strong><span>${n.slug === 'prova' ? 'Checklist do que confirmar' : 'Método de estudo'}</span></a></li>`).join('');
    let body;
    if (cur.slug === 'prova') {
      const secs = D.prova.sections.map((s, si) => {
        const done = s.items.filter((_, ii) => S.prova[`${si}:${ii}`]).length;
        return `<section class="panel" style="max-width:760px;margin-top:1rem"><h2>${esc(s.title)} <span class="muted small" style="font-family:var(--font-body);font-weight:500">(${done} de ${s.items.length})</span></h2>
          <ul class="checks">${s.items.map((h, ii) => { const on = !!S.prova[`${si}:${ii}`]; return `<li class="${on ? 'done' : ''}"><label class="chk a-PT"><input type="checkbox" data-act="prova" data-k="${si}:${ii}" ${on ? 'checked' : ''}><span></span></label><span>${h}</span></li>`; }).join('')}</ul></section>`;
      }).join('');
      body = `<div class="prose">${D.prova.intro}</div>${secs}`;
    } else {
      body = `<div class="prose">${cur.html}</div>${cur.slug === 'registro' ? '<div class="cta-row"><a class="btn primary" href="#/erros/registro">Abrir o registro de erros</a></div>' : ''}${cur.slug === 'estudar-modulo' ? '<div class="cta-row"><a class="btn primary" href="#/modulos">Ver os módulos</a></div>' : ''}`;
    }
    return `<header class="page-head"><h1>Guia</h1><p>Como estudar com método e o que confirmar sobre a prova.</p></header>
      <div class="guide-layout"><ul class="plist">${list}</ul><div><h2 style="font-size:1.7rem;margin-bottom:1rem">${esc(cur.title)}</h2>${body}</div></div>`;
  }

  /* ---------------------------------------------------------- navegação */
  const view = $('#view');
  function buildNav() {
    const link = ([k, l]) => `<a href="#/${k}" data-r="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${l}</span></a>`;
    $('#nav-rail').innerHTML = NAV.map(link).join('');
    $('#nav-tab').innerHTML = NAV.map(link).join('');
  }
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'painel';
    const [name, arg] = h.split('/');
    return { name, arg };
  }
  function route(keepScroll) {
    const { name, arg } = parseHash();
    let html = '';
    switch (name) {
      case 'painel': html = viewPainel(); break;
      case 'modulos': html = viewModulos(arg); break;
      case 'prompts': html = viewPrompts(arg); break;
      case 'erros': html = viewErros(arg === 'placar' ? 'placar' : 'registro'); break;
      case 'guia': html = viewGuia(arg); break;
      default: location.hash = '#/painel'; return;
    }
    view.innerHTML = html;
    $$('[data-r]').forEach(a => { if (a.dataset.r === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (name === 'prompts' && curPrompt) updatePreview(curPrompt);
    if (name === 'erros' && arg === 'placar') updatePlacar();
    if (name === 'painel') { updateCalc(); }
    syncChrome();
    requestAnimationFrame(placeRulerExtras);
    if (!keepScroll) window.scrollTo(0, 0);
    if (name === 'modulos' && arg && MOD[arg] || (name === 'modulos' && /^SIM\d$/.test(arg || ''))) {
      const row = document.getElementById('m-' + arg);
      if (row) {
        const dt = $('details.more', row); if (dt) dt.open = true;
        setTimeout(() => { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }, 60);
      }
    }
  }
  function rerender() { const y = window.scrollY; route(true); window.scrollTo(0, y); }

  function countdown() {
    if (!S.exam) return { rail: 'Defina a data da prova em Ajustes (opcional).', top: '' };
    const ms = new Date(S.exam) - new Date();
    if (isNaN(ms)) return { rail: '', top: '' };
    if (ms <= -864e5) return { rail: 'A prova já aconteceu.', top: 'Prova realizada' };
    if (ms <= 0) return { rail: '<strong>É hoje</strong><br>Boa prova.', top: 'Prova hoje' };
    const dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5), mm = Math.floor(ms % 36e5 / 6e4);
    const when = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(S.exam));
    return {
      rail: `Prova em <strong>${dd} ${dd === 1 ? 'dia' : 'dias'} e ${hh} h</strong><br><span class="small">${esc(when)}</span>`,
      top: dd > 0 ? `${dd}d ${hh}h para a prova` : `${hh}h ${mm}min para a prova`
    };
  }
  const THEME_LABEL = { auto: 'Tema: auto', light: 'Tema: claro', dark: 'Tema: escuro' };
  function syncChrome() {
    const c = countdown();
    $('#count-rail').innerHTML = c.rail; $('#count-top').textContent = c.top; $('#count-top').hidden = !c.top;
    const st = stats();
    $('#meter-rail').style.width = st.pct + '%';
    $('#meter-txt').textContent = `${st.pct}% do plano concluído`;
    $('#theme-btn').textContent = THEME_LABEL[S.theme];
    document.documentElement.dataset.theme = S.theme;
  }

  /* ---------------------------------------------------------- eventos */
  function errToMd() {
    const e2 = s => String(s || '').replace(/\|/g, '\\|');
    const head = '| Data | Área | Módulo | Origem | Tipo | Por que errei | Regra para não repetir | D+1 | D+3 | D+7 |\n|---|---|---|---|---|---|---|---|---|---|';
    const rows = S.errors.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e =>
      `| ${fmtDM(e.date)} | ${e.area} | ${e.modulo || ''} | ${e2(e.origem)} | ${(e.tipos || []).join('/')} | ${e2(e.porque)} | ${e2(e.regra)} | ${e.rev.d1 ? '[x]' : '[ ]'} | ${e.rev.d3 ? '[x]' : '[ ]'} | ${e.rev.d7 ? '[x]' : '[ ]'} |`);
    return head + '\n' + rows.join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mergeErrors(list) {
    let added = 0;
    list.forEach(x => {
      if (!x || !x.area || !x.porque) return;
      if (S.errors.some(e => e.area === x.area && e.origem === x.origem && e.porque === x.porque && e.date === x.date)) return;
      S.errors.push({ id: uid(), date: x.date || todayISO(), area: x.area, origem: x.origem || '', modulo: x.modulo || '', tipos: x.tipos || [], porque: x.porque, regra: x.regra || '', rev: x.rev || { d1: false, d3: false, d7: false }, reinc: !!x.reinc });
      added++;
    });
    save(); return added;
  }
  const setParams = (id, o) => { S.params[id] = Object.assign({}, S.params[id] || {}, o); save(); };

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'theme': S.theme = { auto: 'light', light: 'dark', dark: 'auto' }[S.theme]; save(); syncChrome(); break;
      case 'settings': openSettings(); break;
      case 'settings-close': $('#settings').close(); break;
      case 'goto-mod': location.hash = '#/modulos/' + id; break;
      case 'session': startSession(id); break;
      case 'timer-toggle': timerToggle(); break;
      case 'timer-reset': timerReset(); break;
      case 'timer-close': timerClose(); break;
      case 'timer-break': startBreak(10); break;
      case 'mod-done': S.mod[id] = 'done'; save(); rerender(); toast('Marcado como feito.'); break;
      case 'mod-skip': if (S.mod[id] === 'skip') delete S.mod[id]; else S.mod[id] = 'skip'; save(); rerender(); break;
      case 'habit': { const t = todayISO(); const i = S.habit.indexOf(t); if (i >= 0) S.habit.splice(i, 1); else S.habit.push(t); save(); rerender(); break; }
      case 'f-area': S.filt.area = el.dataset.v; save(); rerender(); break;
      case 'f-nivel': S.filt.nivel = el.dataset.v; save(); rerender(); break;
      case 'f-pend': S.filt.pend = !S.filt.pend; save(); rerender(); break;
      case 'f-hide': S.filt.hide = !S.filt.hide; save(); rerender(); break;
      case 'f-clear': S.filt = { area: '', nivel: '', pend: false, hide: false }; save(); rerender(); break;
      case 'open-prompt': {
        const m = MOD[id]; const p = D.prompts.find(x => x.id === m.area);
        setParams(m.area, { n: p.n, foco: m.nome, modo: 'TREINO FOCADO' });
        S.lastPrompt = m.area; save(); location.hash = '#/prompts/' + m.area;
        toast('Módulo aplicado ao campo FOCO do prompt.'); break;
      }
      case 'param-modo': setParams(curPrompt.id, { modo: el.dataset.v }); rerender(); break;
      case 'param-foco': setParams(curPrompt.id, { foco: el.dataset.v, modo: 'TREINO FOCADO' }); rerender(); break;
      case 'copy-prompt': copyText(buildPrompt(curPrompt), 'Prompt copiado. Cole em uma conversa nova.'); break;
      case 'copy-snippet': copyText(el.dataset.text, 'Copiado.'); break;
      case 'copy-answers': { const n = curPrompt ? pParams(curPrompt).n : 10; copyText(Array.from({ length: n }, (_, k) => `${k + 1}-?`).join(', '), 'Modelo de resposta copiado.'); break; }
      case 'err-del': if (confirm('Apagar este erro?')) { S.errors = S.errors.filter(e => e.id !== id); save(); rerender(); } break;
      case 'err-reinc': { const e = S.errors.find(x => x.id === id); if (e) { e.reinc = !e.reinc; save(); rerender(); } break; }
      case 'err-rev': { const e = S.errors.find(x => x.id === id); if (e) { e.rev['d' + el.dataset.k] = !e.rev['d' + el.dataset.k]; save(); rerender(); } break; }
      case 'err-clear-filters': F.area = ''; F.tipo = ''; F.pend = false; rerender(); break;
      case 'err-copy-md': copyText(errToMd(), 'Tabela copiada. Cole no Obsidian ou em um documento.'); break;
      case 'err-export': download('registro-de-erros.json', JSON.stringify(S.errors, null, 2)); break;
      case 'score-add': S.scores.push({ id: uid(), nome: `Simulado ${S.scores.length}`, v: {} }); save(); rerender(); break;
      case 'score-del': if (confirm('Remover esta linha do placar?')) { S.scores = S.scores.filter(r => r.id !== id); save(); rerender(); } break;
      case 'backup-export': download('rumo-ao-anpad-backup.json', JSON.stringify({ app: 'anpad-v2', state: S }, null, 2)); break;
      case 'reset-progress': if (confirm('Zerar módulos feitos, "já domino", tempo registrado, leitura diária e checklists? Erros e placar são mantidos.')) { S.mod = {}; S.time = {}; S.habit = []; S.prova = {}; save(); $('#settings').close(); rerender(); toast('Progresso zerado.'); } break;
      case 'reset-all': if (confirm('Apagar todos os dados deste app neste navegador?')) { S = clone(DEF); T = null; saveT_(); saveNow(); $('#settings').close(); renderDock(); rerender(); toast('Dados apagados.'); } break;
      default: break;
    }
  });

  document.addEventListener('change', ev => {
    const el = ev.target;
    const act = el.dataset && el.dataset.act;
    if (act === 'mod-toggle') {
      if (el.checked) S.mod[el.dataset.id] = 'done'; else delete S.mod[el.dataset.id];
      save(); rerender();
    } else if (act === 'prova') {
      if (el.checked) S.prova[el.dataset.k] = true; else delete S.prova[el.dataset.k];
      save(); rerender();
    } else if (act === 'f-earea') { F.area = el.value; $('#err-list').innerHTML = errList(); }
    else if (act === 'f-etipo') { F.tipo = el.value; $('#err-list').innerHTML = errList(); }
    else if (act === 'f-epend') { F.pend = el.checked; $('#err-list').innerHTML = errList(); }
    else if (el.id === 'err-import' || el.id === 'backup-file') {
      const f = el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const j = JSON.parse(r.result);
          if (el.id === 'err-import') {
            const a = mergeErrors(Array.isArray(j) ? j : []); toast(`${a} erros importados.`); rerender();
          } else if (j && j.state) {
            S = Object.assign(clone(DEF), j.state); saveNow(); $('#settings').close(); rerender(); toast('Backup restaurado.');
          } else toast('Arquivo de backup inválido.');
        } catch (e) { toast('Não consegui ler esse arquivo JSON.'); }
        el.value = '';
      };
      r.readAsText(f);
    }
  });

  document.addEventListener('input', ev => {
    const el = ev.target;
    if (el.dataset.param && curPrompt) {
      setParams(curPrompt.id, { [el.dataset.param]: el.dataset.param === 'n' ? Math.max(1, Math.min(40, +el.value || 1)) : el.value });
      updatePreview(curPrompt);
    } else if (el.dataset.calc) {
      if (el.dataset.calc === 'days') S.days = el.value === '' ? null : Math.max(1, +el.value);
      else S.hpd = Math.max(0.5, +el.value || 0.5);
      save(); updateCalc();
    } else if (el.dataset.score) {
      const row = S.scores.find(r => r.id === el.dataset.score);
      if (row) { row.v[el.dataset.a] = el.value === '' ? '' : Math.max(0, Math.min(10, Math.round(+el.value))); save(); updatePlacar(); }
    } else if (el.dataset.sname) {
      const row = S.scores.find(r => r.id === el.dataset.sname);
      if (row) { row.nome = el.value; save(); updatePlacar(); }
    }
  });

  document.addEventListener('toggle', ev => {
    const el = ev.target;
    if (el.matches && el.matches('details.more')) { S.open[el.dataset.k] = el.open; save(); }
  }, true);

  document.addEventListener('submit', ev => {
    if (ev.target.id === 'err-form') {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const e = {
        id: uid(), date: f.get('date') || todayISO(), area: f.get('area'), origem: (f.get('origem') || '').trim(), modulo: f.get('modulo') || '',
        tipos: f.getAll('tipo'), porque: (f.get('porque') || '').trim(), regra: (f.get('regra') || '').trim(),
        rev: { d1: false, d3: false, d7: false }, reinc: false
      };
      if (!e.porque) return;
      S.errors.push(e); save(); toast('Erro salvo no registro.'); rerender();
    }
  });

  /* ajustes */
  function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function openSettings() {
    $('#set-exam').value = toLocalInput(S.exam); $('#set-sess').value = String(S.sess); $('#set-theme').value = S.theme;
    $('#settings').showModal();
  }
  $('#settings-form').addEventListener('submit', () => {
    const ex = $('#set-exam').value; S.exam = ex ? new Date(ex).toISOString() : '';
    S.sess = +$('#set-sess').value || 50; S.theme = $('#set-theme').value; save(); rerender();
  });

  window.addEventListener('hashchange', () => route(false));
  window.addEventListener('resize', () => placeRulerExtras());

  /* ---------------------------------------------------------- início */
  buildNav();
  renderDock();
  if (!location.hash) history.replaceState(null, '', '#/painel');
  route(false);
  setInterval(syncChrome, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncChrome(); tick(); } });
})();
