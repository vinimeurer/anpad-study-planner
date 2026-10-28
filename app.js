/* Rumo ao ANPAD — lógica da aplicação (sem dependências).
   Estado salvo em localStorage. Conteúdo vem de data.js (window.ANPAD_DATA). */
(() => {
  'use strict';
  const D = window.ANPAD_DATA;
  const KEY = 'anpad26:v1';
  const TKEY = 'anpad26:timer';

  const AREA_NAME = { RLM: 'Raciocínio Lógico-Matemático', EN: 'Língua Inglesa', RA: 'Raciocínio Analítico', PT: 'Língua Portuguesa' };
  const AREA_SHORT = { RLM: 'Lógico-matemático', EN: 'Inglês', RA: 'Analítico', PT: 'Português' };
  const WEIGHTS = { RLM: 35, EN: 25, RA: 22, PT: 18 };
  const TYPES = { L: 'Leitura do comando', E: 'Extrapolação', P: 'Pressa', C: 'Conteúdo ou método', V: 'Vocabulário', A: 'Aritmética', S: 'Chute' };
  const THRESH = { RLM: 4, EN: 5, RA: 6, PT: 7 };
  const HINTS = {
    RLM: 'Lógico-matemático abaixo de 4: no dia 7, a manutenção também vira RLM (lógica ou financeira, o que estiver pior), e no dia 8 a revisão mista ganha +20 min, tirados do B3.',
    EN: 'Inglês abaixo de 5: no dia 6, a manutenção passa a ser Inglês (abstract e vocabulário) com 40 min. Use o vocabulário do Caderno de Erros todo dia no B0.',
    RA: 'Analítico abaixo de 6: no dia 7, a manutenção vira RA (comandos em negativo e estrutura análoga).',
    PT: 'Português abaixo de 7: no dia 8, inclua 30 min de Português (revisão mista), tomando metade do B3.'
  };
  const ICONS = {
    hoje: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plano: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    prompts: '<path d="M4 6l6 6-6 6M12 18h8"/>',
    caderno: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    guia: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'
  };
  const NAV = [['hoje', 'Hoje'], ['plano', 'Plano'], ['prompts', 'Prompts'], ['caderno', 'Caderno'], ['guia', 'Guia']];

  /* ---------------------------------------------------------- utilidades */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  const toMin = s => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const addDays = (iso, k) => { const d = parseDate(iso); d.setDate(d.getDate() + k); return isoDate(d); };
  const fmtDM = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
  const fmtLong = iso => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(parseDate(iso));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const clone = o => JSON.parse(JSON.stringify(o));
  const chipA = a => `<span class="chip a-${a}">${a}</span>`;

  /* ---------------------------------------------------------- estado */
  const DEF = {
    theme: 'auto', hours: 4, start: '08:00', exam: D.exam,
    done: {}, dchk: {}, notes: {}, errors: [], scores: { s1: {}, s2: {} }, logi: {}, params: {}, open: {}, lastPrompt: 'RLM'
  };
  let storageOK = true;
  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || 'null');
      return Object.assign(clone(DEF), r || {});
    } catch (e) { storageOK = false; return clone(DEF); }
  }
  let S = load();
  let saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); }
      catch (e) { if (storageOK) { storageOK = false; toast('Este navegador não deixou salvar os dados. Seu progresso vale só enquanto a aba estiver aberta.'); } }
    }, 120);
  }
  const saveNow = () => { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  window.addEventListener('beforeunload', saveNow);

  /* ---------------------------------------------------------- plano: cálculos */
  const days = D.days;
  const blocksOf = d => d.blocks[String(S.hours)];
  const startOf = d => (d.kind === 'normal' || d.kind === 'rev') ? S.start : d.start;
  function timeline(d) {
    let t = toMin(startOf(d));
    return blocksOf(d).map(b => { const s = t; t += b.min; return Object.assign({}, b, { s, e: t }); });
  }
  const bkey = (d, i) => `${S.hours}:${d.n}:${i}`;
  function dayStats(d) {
    let tot = 0, done = 0, n = 0, nd = 0;
    blocksOf(d).forEach((b, i) => {
      if (b.type === 'break') return;
      tot += b.min; n++;
      if (S.done[bkey(d, i)]) { done += b.min; nd++; }
    });
    return { tot, done, n, nd, pct: tot ? Math.round(done / tot * 100) : 0 };
  }
  function overall() {
    let tot = 0, done = 0;
    days.forEach(d => { const s = dayStats(d); tot += s.tot; done += s.done; });
    return { tot, done, pct: tot ? Math.round(done / tot * 100) : 0 };
  }
  function currentDay() {
    const t = todayISO();
    const f = days.find(d => d.date === t);
    if (f) return { n: f.n, today: true };
    if (t < days[0].date) return { n: 1, today: false, rel: 'antes' };
    return { n: days.length, today: false, rel: 'depois' };
  }
  const dayTitle = d => d.title.replace(' · ', ': ').replace(/^SIMULADO/, 'Simulado');
  const blockArea = (d, b) => b.areas[0] || (d.kind === 'sim' && b.type !== 'break' ? 'SIM' : 'NEU');

  /* ---------------------------------------------------------- toast e cópia */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
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
  function startTimer(dn, i) {
    const d = days[dn - 1];
    const b = timeline(d)[i];
    if (!b) return;
    unlockAudio();
    const label = b.areas.length ? `${b.label} (${b.areas.join(' + ')})` : b.label;
    T = {
      doneKey: bkey(d, i), d: dn, i, name: `Dia ${dn}: ${b.code ? b.code + ' ' : ''}${label}`,
      area: blockArea(d, b), total: b.min * 60, endAt: Date.now() + b.min * 60000, left: b.min * 60,
      state: 'running', isBreak: b.type === 'break'
    };
    saveT_(); renderDock(); rerender();
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
  function timerClose() { T = null; saveT_(); renderDock(); document.title = baseTitle; rerender(); }
  function timerFinishMark() {
    if (T && !T.isBreak) { S.done[T.doneKey] = true; save(); }
    timerClose();
  }
  function renderDock() {
    const el = $('#dock');
    if (!T) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.classList.remove('finished');
    el.className = 'dock a-' + (T.area || 'NEU');
    const fin = T.state === 'finished';
    el.innerHTML = `
      <div class="dk-name">${esc(T.name)}</div>
      <div class="dk-time" id="dk-time">${fmtClock(timerLeft())}</div>
      <div class="dk-ctl">
        ${fin
          ? `${T.isBreak ? '' : '<button type="button" class="btn light" data-act="timer-done">Marcar como feito</button>'}<button type="button" class="btn" data-act="timer-close">Fechar</button>`
          : `<button type="button" class="btn light" data-act="timer-toggle">${T.state === 'running' ? 'Pausar' : 'Retomar'}</button>
             <button type="button" class="btn" data-act="timer-reset">Zerar</button>
             <button type="button" class="btn" data-act="timer-close">Encerrar</button>`}
      </div>
      <div class="dk-bar"><i id="dk-bar" style="width:${fin ? 100 : (100 - timerLeft() / T.total * 100)}%"></i></div>`;
  }
  const baseTitle = document.title;
  function tick() {
    if (!T) return;
    if (T.state === 'running') {
      const left = timerLeft();
      const tm = $('#dk-time'), bar = $('#dk-bar');
      if (tm) tm.textContent = fmtClock(left);
      if (bar) bar.style.width = (100 - left / T.total * 100) + '%';
      document.title = `${fmtClock(left)} · ${T.name}`;
      if (left <= 0) {
        T.state = 'finished'; T.left = 0; T.endAt = null; saveT_();
        beep(); renderDock(); $('#dock').classList.add('finished');
        document.title = 'Tempo! · ' + baseTitle;
        toast('Tempo do bloco acabou.');
        rerender();
      }
    }
  }
  if (T && T.state === 'running' && timerLeft() <= 0) { T.state = 'finished'; T.left = 0; T.endAt = null; saveT_(); }
  setInterval(tick, 500);

  /* ---------------------------------------------------------- componentes */
  function rulerHTML(d, tl, opts = {}) {
    const start = tl[0].s, end = tl[tl.length - 1].e, total = end - start;
    const segs = tl.map((b, i) => {
      const a = blockArea(d, b);
      const done = !!S.done[bkey(d, i)];
      const active = T && T.doneKey === bkey(d, i) && T.state !== 'finished';
      const wide = b.min / total >= 0.12;
      let label = '';
      if (b.type !== 'break' && wide) {
        label = b.areas.length ? b.areas.join('+') : esc(b.label.split(' ')[0]);
      }
      const tip = `${hm(b.s)} às ${hm(b.e)}: ${b.label}${b.areas.length ? ' (' + b.areas.join(' + ') + ')' : ''}`;
      return `<button type="button" class="rs a-${a}${b.type === 'break' ? ' break' : ''}${done ? ' done' : ''}${active ? ' active' : ''}"
        style="--m:${b.min};--k:${i}" ${opts.mini ? 'tabindex="-1" aria-hidden="true"' : `data-act="goto" data-i="${i}"`}
        title="${esc(tip)}" aria-label="${esc(tip)}${done ? ', feito' : ''}">${label}</button>`;
    }).join('');
    let ticks = '';
    if (!opts.mini) {
      let hs = '';
      for (let h = Math.ceil(start / 60); h * 60 < end; h++) {
        const p = (h * 60 - start) / total * 100;
        if (p > 7 && p < 93) hs += `<span style="left:${p.toFixed(2)}%">${pad(h % 24)}:00</span>`;
      }
      ticks = `<div class="ticks" aria-hidden="true"><span style="left:0">${hm(start)}</span>${hs}<span style="left:100%">${hm(end)}</span></div>`;
    }
    const now = opts.now ? '<div class="now" id="now" hidden></div>' : '';
    return `<div class="ruler${opts.mini ? ' mini ruler-static' : ''}${opts.enter ? ' enter' : ''}" ${opts.mini ? '' : 'id="ruler"'} data-start="${start}" data-end="${end}">${segs}${now}</div>${ticks}`;
  }
  function updateNow() {
    const el = $('#now'); if (!el) return;
    const r = $('#ruler'); if (!r) return;
    const s = +r.dataset.start, e = +r.dataset.end;
    const n = new Date(); const m = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
    if (m < s || m > e) { el.hidden = true; return; }
    el.hidden = false; el.style.left = ((m - s) / (e - s) * 100) + '%';
  }
  function legendHTML(areas) {
    const names = areas.map(a => `<span class="a-${a}"><i></i>${esc(AREA_NAME[a])}</span>`);
    return `<div class="legend">${names.join('')}<span class="a-NEU"><i></i>Sem área (aquecimento, fechamento, correção)</span></div>`;
  }
  function accordion(items, openFirst) {
    return items.map((it, i) => `<details class="acc"${openFirst && i === 0 ? ' open' : ''}><summary>${esc(it.title)}</summary><div class="acc-body prose">${it.html}</div></details>`).join('');
  }
  function hoursToggle() {
    return `<div class="tabs" role="group" aria-label="Carga diária"><button type="button" data-act="hours" data-v="4">4h por dia</button><button type="button" data-act="hours" data-v="6">6h por dia</button></div>`;
  }

  /* ---------------------------------------------------------- view: dia / hoje */
  let enterOnce = true;
  function viewDay(n, isHojeRoute) {
    const d = days[n - 1];
    const cur = currentDay();
    const isToday = cur.today && cur.n === n;
    const tl = timeline(d);
    const st = dayStats(d);
    const bl = blocksOf(d);
    const firstUndone = bl.findIndex((b, i) => b.type !== 'break' && !S.done[bkey(d, i)]);
    const areasSeen = [...new Set(tl.flatMap(b => b.areas))];

    let notice = '';
    if (isHojeRoute && !cur.today) {
      notice = `<p class="notice">O plano vai de ${fmtDM(days[0].date)} a ${fmtDM(days[days.length - 1].date)}. Hoje é ${fmtDM(todayISO())}, ${cur.rel === 'antes' ? 'antes do início' : 'depois do fim'}, então mostro o dia ${n}. Use as setas para navegar pelos dias.</p>`;
    } else if (!isHojeRoute && cur.today && !isToday) {
      notice = `<p class="notice">Você está vendo outro dia do plano. <a href="#/hoje">Voltar para hoje (dia ${cur.n})</a>.</p>`;
    }

    let pauta = '';
    if (d.kind === 'normal') {
      const f = d.focus;
      pauta = `<dl class="pauta">
        <div><dt>Foco 1</dt><dd>${chipA(f.f1)} ${esc(f.f1t)}</dd></div>
        <div><dt>Foco 2</dt><dd>${chipA(f.f2)} ${esc(f.f2t)}</dd></div>
        <div><dt>Manutenção</dt><dd>${chipA(f.m1)} ${esc(f.m1t)}${S.hours === 6 ? `<br>${chipA(f.m2)} ${esc(f.m2t)}` : ''}</dd></div>
      </dl>`;
    } else if (d.kind === 'sim') {
      pauta = `<dl class="pauta"><div><dt>Ordem das provas</dt><dd>${esc(d.ordem)}</dd></div></dl>`;
    }

    const items = d.deliver.map((h, j) => ({ h, j }));
    if (d.extra) items.push({ h: d.extra, j: items.length });
    const delHTML = items.map(({ h, j }) => {
      const on = !!S.dchk[`${d.n}:${j}`];
      return `<li class="${on ? 'done' : ''}"><label class="chk a-PT"><input type="checkbox" data-act="dchk" data-d="${d.n}" data-j="${j}" ${on ? 'checked' : ''}><span></span></label><span>${h}</span></li>`;
    }).join('');

    const list = tl.map((b, i) => blockHTML(d, b, i, i === firstUndone && isToday)).join('');
    const prevN = n > 1 ? n - 1 : null, nextN = n < days.length ? n + 1 : null;
    const sel = days.map(x => `<option value="${x.n}"${x.n === n ? ' selected' : ''}>Dia ${x.n}: ${x.wd} ${fmtDM(x.date)}</option>`).join('');

    const html = `
    <section class="day" data-day="${n}">
      <div class="day-top">
        <div class="row">
          <span class="day-date">${d.wdl}, ${fmtLong(d.date)}</span>
          <span class="pill">${isToday ? 'Hoje, ' : ''}dia ${n} de ${days.length}</span>
          <span class="pill">${S.hours}h por dia</span>
        </div>
        <div class="day-nav">
          <a class="icon-btn" ${prevN ? `href="#/dia/${prevN}"` : 'aria-disabled="true" style="opacity:.35;pointer-events:none"'} aria-label="Dia anterior"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M15 6l-6 6 6 6"/></svg></a>
          <select data-act="day-select" aria-label="Escolher dia">${sel}</select>
          <a class="icon-btn" ${nextN ? `href="#/dia/${nextN}"` : 'aria-disabled="true" style="opacity:.35;pointer-events:none"'} aria-label="Próximo dia"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M9 6l6 6-6 6"/></svg></a>
        </div>
      </div>
      ${notice}
      <header class="day-head">
        <h1>${esc(dayTitle(d))}</h1>
        <p class="day-goal"><b>Meta do dia:</b> ${esc(d.goal)}</p>
        ${pauta}
      </header>

      <div class="ruler-wrap" aria-label="Régua do dia">
        ${rulerHTML(d, tl, { now: isToday, enter: enterOnce })}
        ${legendHTML(areasSeen)}
      </div>

      <div class="day-grid">
        <div>
          <div class="list-head"><h2>Blocos do dia</h2><span class="small muted">${hm(tl[0].s)} às ${hm(tl[tl.length - 1].e)}</span></div>
          <ol class="blocks">${list}</ol>
        </div>
        <aside class="side">
          <section class="panel">
            <h2>Progresso do dia</h2>
            <p class="big">${st.pct}%</p>
            <div class="bar" role="progressbar" aria-valuenow="${st.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${st.pct}%"></i></div>
            <p class="small muted">${st.nd} de ${st.n} blocos. ${st.done} de ${st.tot} min de estudo.</p>
            <div class="row" style="margin-top:.8rem">
              <button type="button" class="btn sm" data-act="day-all" data-d="${n}">Marcar tudo como feito</button>
              <button type="button" class="btn sm ghost" data-act="day-none" data-d="${n}">Limpar</button>
            </div>
          </section>
          <section class="panel">
            <h2>Entregáveis</h2>
            <ul class="checks">${delHTML}</ul>
          </section>
          <section class="panel">
            <h2>Anotações do dia</h2>
            <textarea data-note="${n}" placeholder="O que travou? Qual regra você leva para amanhã?" aria-label="Anotações do dia">${esc(S.notes[n] || '')}</textarea>
          </section>
        </aside>
      </div>
    </section>`;
    enterOnce = false;
    return html;
  }

  function blockHTML(d, b, i, autoOpen) {
    const k = bkey(d, i);
    const done = !!S.done[k];
    const active = T && T.doneKey === k && T.state !== 'finished';
    const area = blockArea(d, b);
    if (b.type === 'break') {
      return `<li class="blk break a-NEU${active ? ' active' : ''}" id="blk-${i}">
        <div class="blk-time"><span class="t">${hm(b.s)}</span></div>
        <div class="blk-main">
          <div><strong>${esc(b.label)}, ${b.min} min</strong><p>${b.html}</p></div>
          <button type="button" class="btn sm" data-act="timer" data-d="${d.n}" data-i="${i}">${active ? 'Em andamento' : 'Iniciar'}</button>
        </div>
      </li>`;
    }
    const open = S.open[`${d.n}:${i}`] ?? autoOpen;
    const promptBtn = b.prompt
      ? `<button type="button" class="btn sm area a-${b.prompt.area}" data-act="open-prompt" data-area="${b.prompt.area}" data-n="${b.prompt.n}" data-foco="${esc(b.prompt.foco)}">Abrir prompt</button>`
      : '';
    return `<li class="blk a-${area}${done ? ' done' : ''}${active ? ' active' : ''}" id="blk-${i}">
      <div class="blk-time"><span class="t">${hm(b.s)}</span><span class="d">${b.min} min</span></div>
      <div class="blk-main">
        <div class="blk-head">
          <label class="chk"><input type="checkbox" data-act="toggle" data-d="${d.n}" data-i="${i}" ${done ? 'checked' : ''} aria-label="Marcar ${esc(b.label)} como feito"><span></span></label>
          <div class="blk-title">${b.code ? `<span class="code">${b.code}</span>` : ''}<h3>${esc(b.label)}</h3>${b.areas.map(chipA).join('')}</div>
          <div class="blk-actions">${promptBtn}<button type="button" class="btn sm" data-act="timer" data-d="${d.n}" data-i="${i}">${active ? 'Em andamento' : 'Iniciar timer'}</button></div>
        </div>
        ${b.theme ? `<p class="blk-theme">${esc(b.theme)}</p>` : ''}
        <details class="more" data-k="${d.n}:${i}"${open ? ' open' : ''}><summary>Como fazer</summary><div class="more-body">${b.html}</div></details>
      </div>
    </li>`;
  }

  /* ---------------------------------------------------------- view: plano */
  function effortHTML() {
    const mins = { RLM: 0, EN: 0, RA: 0, PT: 0 };
    days.forEach(d => blocksOf(d).forEach(b => {
      if (b.type === 'break' || !b.areas.length) return;
      b.areas.forEach(a => { mins[a] += b.min / b.areas.length; });
    }));
    const tot = Object.values(mins).reduce((a, b) => a + b, 0) || 1;
    const rows = ['RLM', 'EN', 'RA', 'PT'].map(a => {
      const p = mins[a] / tot * 100;
      return `<div class="eff-row a-${a}"><span>${esc(AREA_SHORT[a])}</span><div class="eff-track" title="Planejado: ${p.toFixed(0)}%. Meta de peso: ${WEIGHTS[a]}%"><i style="width:${p.toFixed(1)}%"></i><b style="left:${WEIGHTS[a]}%"></b></div><span>${p.toFixed(0)}%</span></div>`;
    }).join('');
    return `<section class="effort"><h2>Onde o tempo vai</h2>
      <p class="muted">A barra mostra o tempo que o plano de ${S.hours}h dá a cada área, entre os blocos que têm uma área definida. O traço escuro marca o peso que o diagnóstico recomendou (RLM 35%, Inglês 25%, Analítico 22%, Português 18%).</p>
      ${rows}</section>`;
  }
  function viewPlano() {
    const cur = currentDay();
    const totalMin = days.reduce((a, d) => a + blocksOf(d).reduce((x, b) => x + b.min, 0), 0);
    const rows = days.map(d => {
      const tl = timeline(d), st = dayStats(d);
      const areas = [...new Set(tl.flatMap(b => b.areas))];
      const isT = cur.today && cur.n === d.n;
      return `<li><a class="plan-day${isT ? ' today' : ''}" href="#/dia/${d.n}">
        <div class="pd-date"><strong>${d.wd} ${fmtDM(d.date)}</strong><span>${isT ? 'hoje' : 'dia ' + d.n}</span></div>
        <div><p class="pd-title">${esc(dayTitle(d))}</p><div class="pd-chips">${(d.kind === 'sim' ? ['SIM'] : d.kind === 'normal' ? [d.focus.f1, d.focus.f2] : areas).map(a => a === 'SIM' ? '<span class="chip a-SIM">simulado</span>' : chipA(a)).join('')}</div></div>
        <div class="pd-ruler">${rulerHTML(d, tl, { mini: true })}</div>
        <div class="pd-pct">${st.pct}%<small>feito</small></div>
      </a></li>`;
    }).join('');
    return `
    <header class="page-head">
      <h1>Plano de ${days.length} dias</h1>
      <p>De ${fmtDM(days[0].date)} a ${fmtDM(days[days.length - 1].date)}, com ${Math.round(totalMin / 60)}h de relógio no total. Cada linha mostra o dia inteiro como uma régua: cada trecho é um bloco, na cor da área.</p>
    </header>
    <div class="plan-bar">
      ${hoursToggle()}
      <label>Início dos dias de estudo <input type="time" data-act="start-time" value="${S.start}"></label>
    </div>
    ${legendHTML(['RLM', 'EN', 'RA', 'PT'])}
    <ol class="plan-days" style="margin-top:1.25rem">${rows}</ol>
    ${effortHTML()}`;
  }

  /* ---------------------------------------------------------- view: prompts */
  function pParams(p) {
    const base = { n: p.n || 10, modo: 'TREINO FOCADO', foco: '', dif: 'mista: 30% fácil, 50% média, 20% difícil', fracos: p.fracos || '' };
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
        <label class="field wide"><span>Foco do treino</span>
          <input type="text" value="${esc(v.foco)}" data-param="foco" placeholder="Escolha uma sugestão ou escreva o seu" ${v.modo === 'SIMULADO' ? 'disabled' : ''}>
          <span class="chips">${p.focos.map(f => `<button type="button" data-act="param-foco" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</span>
        </label>
        <label class="field"><span>Dificuldade</span><select data-param="dif">${difs.map(o => `<option${o === v.dif ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        <label class="field wide"><span>Meus pontos fracos</span><textarea data-param="fracos" rows="3">${esc(v.fracos)}</textarea></label>
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
            <li>Na fase 1, resolva só as questões, no papel e com cronômetro.</li>
            <li>Na fase 2, envie suas respostas (<code>1-C, 2-A...</code>) ou escreva <code>GABARITO</code>.</li>
            <li>Nos simulados (dias 5 e 9), use o modo Simulado na véspera e não abra o gabarito.</li>
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

  /* ---------------------------------------------------------- view: caderno */
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
    return `<li class="err a-${e.area}">
      <div class="err-meta"><span>${fmtDM(e.date)}</span>${chipA(e.area)}</div>
      <div class="err-body">
        <p class="why">${esc(e.porque)}</p>
        ${e.regra ? `<p class="rule">Regra: ${esc(e.regra)}</p>` : ''}
        <div class="err-tags">${(e.tipos || []).map(t => `<span class="tg" title="${esc(TYPES[t])}">${t} ${esc(TYPES[t])}</span>`).join('')}<span class="muted small">${esc(e.origem || '')}</span>${e.reinc ? '<span class="chip" style="--c:var(--danger)">reincidente</span>' : ''}</div>
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
      return `<div class="empty"><h3>Nenhum erro registrado ainda</h3><p class="muted">Comece importando os 20 erros do simulado de 28/10, já classificados. É a tarefa do bloco B0 do dia 1.</p><button type="button" class="btn primary" data-act="err-seed">Importar os 20 erros do simulado</button></div>`;
    }
    if (!list.length) return `<div class="empty"><h3>Nenhum erro com esses filtros</h3><button type="button" class="btn" data-act="err-clear-filters">Limpar filtros</button></div>`;
    return `<ul class="errs">${list.map(errItemHTML).join('')}</ul>`;
  }
  function viewCaderno(tab) {
    const tabs = `<div class="tabs" role="group" aria-label="Caderno"><a href="#/caderno/erros" ${tab === 'erros' ? 'aria-current="true"' : ''}>Erros</a><a href="#/caderno/placar" ${tab === 'placar' ? 'aria-current="true"' : ''}>Placar dos simulados</a></div>`;
    if (tab === 'placar') return `
      <header class="page-head"><h1>Placar dos simulados</h1><p>Registre os acertos de cada simulado. O gráfico compara com o diagnóstico de 28/10 e com a meta de cada etapa.</p></header>
      ${tabs}<div style="margin-top:1.5rem">${placarHTML()}</div>`;
    const due = S.errors.reduce((a, e) => a + [1, 3, 7].filter(k => revStatus(e, k) === 'due').length, 0);
    const reinc = S.errors.filter(e => e.reinc).length;
    const byType = Object.keys(TYPES).map(t => [t, S.errors.filter(e => (e.tipos || []).includes(t)).length]);
    const maxT = Math.max(1, ...byType.map(x => x[1]));
    const typesHTML = S.errors.length ? `<div class="types" aria-label="Erros por tipo">${byType.map(([t, c]) => `<div class="type-row a-NEU"><span>${t} ${esc(TYPES[t])}</span><div class="eff-track"><i style="width:${c / maxT * 100}%;background:var(--ink-2)"></i></div><span>${c}</span></div>`).join('')}</div>` : '';
    return `
      <header class="page-head"><h1>Caderno de erros</h1><p>Cada erro vira uma linha: tipo e regra. Revise em D+1, D+3 e D+7. O erro que volta duas vezes entra na lista de reincidentes.</p></header>
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
            <label class="field c3"><span>Área</span><select name="area" required><option value="RLM">RLM</option><option value="EN">Inglês</option><option value="RA">Raciocínio Analítico</option><option value="PT">Português</option></select></label>
            <label class="field c6"><span>Origem</span><input type="text" name="origem" placeholder="Simulado 1, Q7, ou o nome do livro"></label>
            <div class="field c12"><span>Tipo de erro</span><div class="tipos">${Object.entries(TYPES).map(([k, v]) => `<label><input type="checkbox" name="tipo" value="${k}"><span>${k} ${esc(v)}</span></label>`).join('')}</div></div>
            <label class="field c12"><span>Por que errei (uma frase)</span><input type="text" name="porque" required placeholder="Ex.: li o comando INADMISSÍVEL como se fosse admissível"></label>
            <label class="field c12"><span>Regra para não repetir</span><input type="text" name="regra" placeholder="Ex.: marque NEG ou POS no comando antes de ler o texto"></label>
            <div class="c12 row" style="margin-top:.75rem"><button type="submit" class="btn primary">Salvar erro</button></div>
          </form>
        </div>
      </details>
      <div class="filters">
        <select data-act="f-area" aria-label="Filtrar por área"><option value="">Todas as áreas</option>${['RLM', 'EN', 'RA', 'PT'].map(a => `<option value="${a}"${F.area === a ? ' selected' : ''}>${AREA_SHORT[a]}</option>`).join('')}</select>
        <select data-act="f-tipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${F.tipo === k ? ' selected' : ''}>${k} ${esc(v)}</option>`).join('')}</select>
        <label class="row" style="gap:.4rem"><input type="checkbox" data-act="f-pend" ${F.pend ? 'checked' : ''}> Só com revisão vencida</label>
        <span style="flex:1"></span>
        <button type="button" class="btn sm" data-act="err-copy-md">Copiar como tabela Markdown</button>
        <button type="button" class="btn sm" data-act="err-export">Baixar JSON</button>
        <label class="btn sm" for="err-import">Importar JSON</label><input id="err-import" type="file" accept="application/json" hidden>
        ${S.errors.length ? '' : '<button type="button" class="btn sm" data-act="err-seed">Importar os 20 erros do simulado</button>'}
      </div>
      <div id="err-list">${errList()}</div>`;
  }

  /* placar + radar */
  const AX = [['PT', -90], ['EN', 0], ['RA', 90], ['RLM', 180]];
  function radarSVG(series) {
    const cx = 180, cy = 165, R = 105;
    const pt = (a, v) => { const r = R * v / 100, t = a * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
    const pts = (vals) => AX.map(([k, a]) => pt(a, Math.max(0, Math.min(100, vals[k] ?? 0))).map(n => n.toFixed(1)).join(',')).join(' ');
    const rings = [25, 50, 75, 100].map(v => `<polygon class="ring" points="${pts({ PT: v, EN: v, RA: v, RLM: v })}"/>`).join('');
    const axes = AX.map(([k, a]) => { const [x, y] = pt(a, 100); return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const anchors = { PT: ['middle', -10], EN: ['start', 5], RA: ['middle', 20], RLM: ['end', 5] };
    const short = { PT: 'Português', EN: 'Inglês', RA: 'Analítico', RLM: 'RLM' };
    const labels = AX.map(([k, a]) => { const [x, y] = pt(a, 100 + 12 / R * 100); const [an, dy] = anchors[k]; return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${an}">${short[k]}</text>`; }).join('');
    const ser = series.map(s => `<polygon class="${s.cls}" points="${pts(s.vals)}"/>`).join('');
    return `<svg class="radar" viewBox="0 0 360 330" role="img" aria-label="Gráfico de radar com o desempenho por área">${rings}${axes}${ser}${labels}</svg>`;
  }
  function scorePct(s) { const o = {}; ['PT', 'EN', 'RA', 'RLM'].forEach(a => { const v = S.scores[s][a]; if (v !== undefined && v !== '' && v !== null) o[a] = Math.min(100, Math.max(0, +v / 10 * 100)); }); return o; }
  function placarHTML() {
    const A = ['PT', 'EN', 'RA', 'RLM'];
    const bl = D.baseline;
    const row = (key, label) => `<tr><td>${label}</td>${A.map(a => `<td><input type="number" min="0" max="10" step="1" inputmode="numeric" data-score="${key}" data-a="${a}" value="${S.scores[key][a] ?? ''}" aria-label="${label}, ${AREA_SHORT[a]}, acertos de 10"></td>`).join('')}<td class="tot" id="tot-${key}"></td></tr>`;
    return `
      <div class="score-wrap">
        <div>
          <div class="tw"><table class="score-table">
            <thead><tr><th>Simulado</th>${A.map(a => `<th>${a}</th>`).join('')}<th>Total</th></tr></thead>
            <tbody>
              <tr><td>Diagnóstico (28/10)</td>${A.map(a => `<td>${bl[a][0]}/${bl[a][1]}</td>`).join('')}<td class="tot">19/39</td></tr>
              ${row('s1', 'Simulado 1 (01/11)')}
              ${row('s2', 'Simulado 2 (05/11)')}
              <tr><td class="muted">Meta do Simulado 2</td>${A.map(a => `<td class="muted">${String(D.goals.s2[a]).replace('.', ',')}</td>`).join('')}<td class="muted">${String(A.reduce((x, a) => x + D.goals.s2[a], 0)).replace('.', ',')}</td></tr>
            </tbody>
          </table></div>
          <p class="small muted" style="margin-top:.6rem">Acertos de 10 questões por área. As metas são referência, não promessa.</p>
          <ul class="hints" id="hints"></ul>
        </div>
        <div>
          <div id="radar"></div>
          <div class="radar-legend"><span><i style="background:var(--ink)"></i>Diagnóstico</span><span><i style="background:var(--EN)"></i>Simulado 1</span><span><i style="background:var(--PT)"></i>Simulado 2</span><span><i style="background:var(--NEU)"></i>Meta do Simulado 2</span></div>
        </div>
      </div>`;
  }
  function updatePlacar() {
    const A = ['PT', 'EN', 'RA', 'RLM'];
    ['s1', 's2'].forEach(k => {
      const vals = A.map(a => S.scores[k][a]).filter(v => v !== undefined && v !== '' && v !== null);
      const el = $('#tot-' + k); if (el) el.textContent = vals.length ? `${vals.reduce((x, y) => x + +y, 0)}/${vals.length * 10}` : '';
    });
    const bl = {}; A.forEach(a => { bl[a] = D.baseline[a][0] / D.baseline[a][1] * 100; });
    const series = [{ cls: 's-goal', vals: Object.fromEntries(A.map(a => [a, D.goals.s2[a] * 10])) }, { cls: 's-base', vals: bl }];
    const p1 = scorePct('s1'), p2 = scorePct('s2');
    if (Object.keys(p1).length) series.push({ cls: 's-1', vals: p1 });
    if (Object.keys(p2).length) series.push({ cls: 's-2', vals: p2 });
    const r = $('#radar'); if (r) r.innerHTML = radarSVG(series);
    const h = $('#hints');
    if (h) {
      const items = A.filter(a => S.scores.s1[a] !== undefined && S.scores.s1[a] !== '' && +S.scores.s1[a] < THRESH[a]).map(a => `<li>${esc(HINTS[a])}</li>`);
      h.innerHTML = items.join('');
    }
  }

  /* ---------------------------------------------------------- view: guia */
  function viewGuia(tab) {
    const tabs = [['diagnostico', 'Diagnóstico'], ['dicas', 'Dicas'], ['colas', 'Colas'], ['logistica', 'Logística e ajustes']]
      .map(([k, l]) => `<a href="#/guia/${k}" ${tab === k ? 'aria-current="true"' : ''}>${l}</a>`).join('');
    let body = '';
    let title = '', sub = '';
    if (tab === 'dicas') {
      title = 'Dicas reais de estudo';
      sub = 'Só o que muda nota, com base no seu simulado e no que a pesquisa sobre aprendizagem mostra funcionar.';
      body = accordion(D.tips, true);
    } else if (tab === 'colas') {
      title = 'Colas para reescrever de memória';
      sub = 'Revise e reescreva sem olhar. Só ler não fixa.';
      body = `<label class="field search"><span>Buscar nas colas</span><input type="search" id="colas-q" placeholder="Ex.: modus tollens, however, SAC"></label>
        <div class="colas">${D.colas.map(c => `<section class="panel" data-text="${esc((c.title + ' ' + c.html.replace(/<[^>]+>/g, ' ')).toLowerCase())}"><h3>${esc(c.title)}</h3><div class="prose">${c.html}</div></section>`).join('')}</div>`;
    } else if (tab === 'logistica') {
      title = 'Logística e regras de ajuste';
      sub = 'Confira tudo nos dias 6 e 7. O que depende do edital e do Manual do Participante está marcado.';
      const done = D.logistica.filter((_, i) => S.logi[i]).length;
      body = `<section class="panel" style="max-width:760px"><h2>Checklist da prova (${done} de ${D.logistica.length})</h2>
        <ul class="checks">${D.logistica.map((h, i) => `<li class="${S.logi[i] ? 'done' : ''}"><label class="chk a-PT"><input type="checkbox" data-act="logi" data-i="${i}" ${S.logi[i] ? 'checked' : ''}><span></span></label><span>${h}</span></li>`).join('')}</ul>
        <p class="notice logi-note">${D.logisticaNote}</p></section>
        <div style="margin-top:2rem">${accordion(D.ajuste, true)}</div>`;
    } else {
      title = 'Diagnóstico do simulado de 28/10';
      sub = 'A base de todo o plano: onde você perdeu pontos e por quê.';
      const bars = ['RLM', 'EN', 'RA', 'PT'].map(a => {
        const [c, t] = D.baseline[a]; const p = Math.round(c / t * 100);
        return `<div class="gb a-${a}"><p>${esc(AREA_NAME[a])}</p><b>${c}<small>/${t}</small></b><div class="mini-bar"><i style="width:${p}%"></i></div><p style="margin-top:.4rem">${p}% de acerto. Usou ${D.usage[a]}% do tempo (${D.times[a]}).</p></div>`;
      }).join('');
      body = `<div class="guide-bars">${bars}</div>${accordion(D.diag.filter(x => x.title !== 'Placar'), true)}`;
    }
    return `<header class="page-head"><h1>${title}</h1><p>${sub}</p></header>
      <div class="tabs" role="group" aria-label="Guia">${tabs}</div>
      <div style="margin-top:1.5rem">${body}</div>`;
  }

  /* ---------------------------------------------------------- navegação */
  const view = $('#view');
  function buildNav() {
    const link = ([k, l]) => `<a href="#/${k}" data-r="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${l}</span></a>`;
    $('#nav-rail').innerHTML = NAV.map(link).join('');
    $('#nav-tab').innerHTML = NAV.map(link).join('');
  }
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'hoje';
    const [name, arg] = h.split('/');
    return { name, arg };
  }
  function route(keepScroll) {
    const { name, arg } = parseHash();
    let html = '', nav = name;
    switch (name) {
      case 'hoje': html = viewDay(currentDay().n, true); break;
      case 'dia': { const n = Math.min(days.length, Math.max(1, parseInt(arg, 10) || 1)); html = viewDay(n, false); nav = 'plano'; break; }
      case 'plano': html = viewPlano(); break;
      case 'prompts': html = viewPrompts(arg); break;
      case 'caderno': html = viewCaderno(arg === 'placar' ? 'placar' : 'erros'); break;
      case 'guia': html = viewGuia(['dicas', 'colas', 'logistica'].includes(arg) ? arg : 'diagnostico'); break;
      default: location.hash = '#/hoje'; return;
    }
    view.innerHTML = html;
    $$('[data-r]').forEach(a => { if (a.dataset.r === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const accent = { prompts: 'RA', caderno: 'RLM', guia: 'PT', hoje: 'EN', plano: 'EN' }[nav];
    $$('.tabbar a').forEach(a => a.style.setProperty('--c', `var(--${accent})`));
    if (name === 'prompts' && curPrompt) updatePreview(curPrompt);
    if (name === 'caderno' && arg === 'placar') updatePlacar();
    updateNow();
    syncChrome();
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function rerender() { const y = window.scrollY; route(true); window.scrollTo(0, y); }

  function countdown() {
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
    $$('[data-act="hours"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === S.hours)));
    const c = countdown();
    $('#count-rail').innerHTML = c.rail; $('#count-top').textContent = c.top;
    const o = overall();
    $('#meter-rail').style.width = o.pct + '%';
    $('#meter-txt').textContent = `${o.pct}% do plano de ${S.hours}h concluído`;
    $('#theme-btn').textContent = THEME_LABEL[S.theme];
    document.documentElement.dataset.theme = S.theme;
  }

  /* ---------------------------------------------------------- eventos */
  function errToMd() {
    const esc2 = s => String(s || '').replace(/\|/g, '\\|');
    const head = '| Data | Área | Origem | Tipo | Por que errei | Regra para não repetir | D+1 | D+3 | D+7 |\n|---|---|---|---|---|---|---|---|---|';
    const rows = S.errors.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e =>
      `| ${fmtDM(e.date)} | ${e.area} | ${esc2(e.origem)} | ${(e.tipos || []).join('/')} | ${esc2(e.porque)} | ${esc2(e.regra)} | ${e.rev.d1 ? '[x]' : '[ ]'} | ${e.rev.d3 ? '[x]' : '[ ]'} | ${e.rev.d7 ? '[x]' : '[ ]'} |`);
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
      if (S.errors.some(e => e.area === x.area && e.origem === x.origem && e.porque === x.porque)) return;
      S.errors.push({ id: uid(), date: x.date || todayISO(), area: x.area, origem: x.origem || '', tipos: x.tipos || [], porque: x.porque, regra: x.regra || '', rev: x.rev || { d1: false, d3: false, d7: false }, reinc: !!x.reinc });
      added++;
    });
    save(); return added;
  }

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const d = +el.dataset.d, i = +el.dataset.i;
    switch (act) {
      case 'hours': S.hours = +el.dataset.v; save(); rerender(); break;
      case 'theme': S.theme = { auto: 'light', light: 'dark', dark: 'auto' }[S.theme]; save(); syncChrome(); break;
      case 'settings': openSettings(); break;
      case 'settings-close': $('#settings').close(); break;
      case 'goto': {
        const row = document.getElementById('blk-' + el.dataset.i);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
          const dt = $('details.more', row); if (dt && !dt.open) dt.open = true;
        }
        break;
      }
      case 'timer': { const day = days[d - 1]; const k = bkey(day, i); if (T && T.doneKey === k && T.state !== 'finished') { toast('Este bloco já está no timer.'); } else startTimer(d, i); break; }
      case 'timer-toggle': timerToggle(); break;
      case 'timer-reset': timerReset(); break;
      case 'timer-close': timerClose(); break;
      case 'timer-done': timerFinishMark(); break;
      case 'day-all': { const day = days[d - 1]; blocksOf(day).forEach((b, j) => { if (b.type !== 'break') S.done[bkey(day, j)] = true; }); save(); rerender(); break; }
      case 'day-none': { const day = days[d - 1]; blocksOf(day).forEach((b, j) => { delete S.done[bkey(day, j)]; }); save(); rerender(); break; }
      case 'open-prompt': {
        const a = el.dataset.area; const p = D.prompts.find(x => x.id === a);
        S.params[a] = Object.assign({}, S.params[a] || {}, { n: +el.dataset.n, foco: el.dataset.foco, modo: 'TREINO FOCADO' });
        S.lastPrompt = a; save(); location.hash = '#/prompts/' + a;
        toast('Parâmetros do bloco aplicados ao prompt.'); break;
      }
      case 'param-modo': { const p = curPrompt; S.params[p.id] = Object.assign({}, S.params[p.id] || {}, { modo: el.dataset.v }); save(); rerender(); break; }
      case 'param-foco': { const p = curPrompt; S.params[p.id] = Object.assign({}, S.params[p.id] || {}, { foco: el.dataset.v, modo: 'TREINO FOCADO' }); save(); rerender(); break; }
      case 'copy-prompt': copyText(buildPrompt(curPrompt), 'Prompt copiado. Cole em uma conversa nova.'); break;
      case 'copy-snippet': copyText(el.dataset.text, 'Copiado.'); break;
      case 'copy-answers': { const n = curPrompt ? pParams(curPrompt).n : 10; copyText(Array.from({ length: n }, (_, k) => `${k + 1}-?`).join(', '), 'Modelo de resposta copiado.'); break; }
      case 'err-seed': { const a = mergeErrors(D.errorsSeed.map(e => Object.assign({ date: '2026-10-28' }, e))); toast(a ? `${a} erros importados.` : 'Esses erros já estão no caderno.'); rerender(); break; }
      case 'err-del': if (confirm('Apagar este erro?')) { S.errors = S.errors.filter(e => e.id !== el.dataset.id); save(); rerender(); } break;
      case 'err-reinc': { const e = S.errors.find(x => x.id === el.dataset.id); if (e) { e.reinc = !e.reinc; save(); rerender(); } break; }
      case 'err-rev': { const e = S.errors.find(x => x.id === el.dataset.id); if (e) { e.rev['d' + el.dataset.k] = !e.rev['d' + el.dataset.k]; save(); rerender(); } break; }
      case 'err-clear-filters': F.area = ''; F.tipo = ''; F.pend = false; rerender(); break;
      case 'err-copy-md': copyText(errToMd(), 'Tabela copiada. Cole no Obsidian.'); break;
      case 'err-export': download('caderno-de-erros.json', JSON.stringify(S.errors, null, 2)); break;
      case 'backup-export': download('rumo-ao-anpad-backup.json', JSON.stringify({ app: 'anpad26', state: S }, null, 2)); break;
      case 'reset-progress': if (confirm('Zerar blocos feitos, entregáveis e checklist? Erros, notas e placar são mantidos.')) { S.done = {}; S.dchk = {}; S.logi = {}; save(); $('#settings').close(); rerender(); toast('Progresso zerado.'); } break;
      case 'reset-all': if (confirm('Apagar todos os dados deste app neste navegador?')) { S = clone(DEF); T = null; saveT_(); saveNow(); $('#settings').close(); renderDock(); rerender(); toast('Dados apagados.'); } break;
      default: break;
    }
  });

  document.addEventListener('change', ev => {
    const el = ev.target;
    const act = el.dataset && el.dataset.act;
    if (act === 'toggle') {
      const day = days[+el.dataset.d - 1], k = bkey(day, +el.dataset.i);
      if (el.checked) S.done[k] = true; else delete S.done[k];
      save(); rerender();
    } else if (act === 'dchk') {
      const k = `${el.dataset.d}:${el.dataset.j}`;
      if (el.checked) S.dchk[k] = true; else delete S.dchk[k];
      save(); rerender();
    } else if (act === 'logi') {
      if (el.checked) S.logi[el.dataset.i] = true; else delete S.logi[el.dataset.i];
      save(); rerender();
    } else if (act === 'day-select') {
      location.hash = '#/dia/' + el.value;
    } else if (act === 'start-time') {
      if (el.value) { S.start = el.value; save(); rerender(); }
    } else if (act === 'f-area') { F.area = el.value; $('#err-list').innerHTML = errList(); }
    else if (act === 'f-tipo') { F.tipo = el.value; $('#err-list').innerHTML = errList(); }
    else if (act === 'f-pend') { F.pend = el.checked; $('#err-list').innerHTML = errList(); }
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
    if (el.dataset.note) { S.notes[el.dataset.note] = el.value; save(); }
    else if (el.dataset.param && curPrompt) {
      S.params[curPrompt.id] = Object.assign({}, S.params[curPrompt.id] || {}, { [el.dataset.param]: el.dataset.param === 'n' ? Math.max(1, Math.min(40, +el.value || 1)) : el.value });
      save(); updatePreview(curPrompt);
    } else if (el.dataset.score) {
      S.scores[el.dataset.score][el.dataset.a] = el.value === '' ? '' : Math.max(0, Math.min(10, Math.round(+el.value)));
      save(); updatePlacar();
    } else if (el.id === 'colas-q') {
      const q = el.value.trim().toLowerCase();
      $$('.colas .panel').forEach(p => { p.hidden = q && !p.dataset.text.includes(q); });
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
        id: uid(), date: f.get('date') || todayISO(), area: f.get('area'), origem: (f.get('origem') || '').trim(),
        tipos: f.getAll('tipo'), porque: (f.get('porque') || '').trim(), regra: (f.get('regra') || '').trim(),
        rev: { d1: false, d3: false, d7: false }, reinc: false
      };
      if (!e.porque) return;
      S.errors.push(e); save(); toast('Erro salvo no caderno.'); rerender();
    }
  });

  /* ajustes */
  function toLocalInput(iso) { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function openSettings() {
    $('#set-start').value = S.start; $('#set-exam').value = toLocalInput(S.exam); $('#set-theme').value = S.theme;
    $('#settings').showModal();
  }
  $('#settings-form').addEventListener('submit', () => {
    S.start = $('#set-start').value || S.start;
    const ex = $('#set-exam').value; if (ex) S.exam = new Date(ex).toISOString();
    S.theme = $('#set-theme').value; save(); rerender();
  });

  window.addEventListener('hashchange', () => route(false));

  /* ---------------------------------------------------------- início */
  buildNav();
  renderDock();
  if (!location.hash) history.replaceState(null, '', '#/hoje');
  route(false);
  setInterval(() => { updateNow(); syncChrome(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateNow(); syncChrome(); tick(); } });
})();
