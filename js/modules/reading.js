import { escapeHtml, shuffle, wordCardHTML, bindWordCardEvents, formatPhonetic, formatMeaningHTML, lemmatizePlural, wordCardNotFoundHTML, commonMeaning, buildEn2ZhOptions, IC } from '../ui.js';

export default {
  render({ view, APP, ctx }) {
    const readings = (APP.library && APP.library.readings) || [];
    if (!readings.length) {
      view.innerHTML = '<div class="card">暂无阅读文章，请先导入阅读材料。</div>';
      return;
    }
    view.innerHTML = `
      <div class="section-title"><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>阅读记 · 英语故事</div>
      <div class="reading-list">
        ${readings.map((r, i) => readingCard(r, i, ctx)).join('')}
      </div>
    `;
    // 事件委托：容器级监听，避免逐卡绑定可能的静默失效
    const list = view.querySelector('.reading-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const card = e.target.closest('.reading-card');
        if (!card) return;
        const art = readings[+card.dataset.idx];
        if (!art) return;
        try {
          openReading(view, ctx, art);
        } catch (err) {
          console.error('打开阅读文章失败:', err);
          ctx.toast('打开文章失败，请重试');
        }
      });
    }
  },
};

function isMastered(word) {
  return !!(window.APP && window.APP.progress && window.APP.progress.mastered && window.APP.progress.mastered[word.toLowerCase()]);
}

function activeHighlights(reading) {
  return (reading.highlights || []).filter((h) => !isMastered(h));
}

// 难度高亮：选中难度后，高亮文章内「当前难度」与「当前难度低一级」的单词；
// 单词判定掌握后高亮消失。未选难度（全部）时沿用原人工标注高亮。
// 额外叠加「本文生词（expansion）」与「词汇加油站（extra）」始终高亮（feature 1 / 3）。
let _diffMap = null, _diffMapLib = null;
function diffMap(ctx) {
  if (_diffMap && _diffMapLib === window.APP.library) return _diffMap;
  const m = new Map();
  (window.APP.library.words || []).forEach((w) => {
    if (!w.word) return;
    // 用「有效难度」（GRE 桶已去重），避免简单词被当成 GRE 词高亮
    m.set(w.word.toLowerCase(), (ctx && ctx.difficultyOf) ? ctx.difficultyOf(w) : w.difficulty);
  });
  _diffMap = m; _diffMapLib = window.APP.library;
  return m;
}
function computeHighlights(reading, ctx) {
  const set = new Set();
  const L = ctx && ctx.difficultyLevel ? ctx.difficultyLevel() : null;
  if (L == null) {
    activeHighlights(reading).forEach((h) => set.add(h.toLowerCase()));
  } else {
    const dm = diffMap(ctx);
    const tokens = (reading.text || '').toLowerCase().match(/[a-z']+/g) || [];
    for (const tok of tokens) {
      const d = dm.get(tok);
      if (d === undefined || d === null) continue;
      if (d !== L && d !== (L - 1)) continue;
      if (isMastered(tok)) continue;
      set.add(tok);
    }
  }
  // 本文生词始终高亮
  for (const e of (reading.expansion || [])) {
    if (!isMastered(e.word)) set.add(e.word.toLowerCase());
  }
  // 词汇加油站始终显示高亮
  for (const e of (reading.extra || [])) {
    if (!isMastered(e.word)) set.add(e.word.toLowerCase());
  }
  return [...set];
}

// 当前文章所有高亮单词对应的「词对象」列表（去重、排除已掌握），用于闪记/中译英/英译中/完形填空。
function highlightWordObjects(reading, ctx) {
  const hls = computeHighlights(reading, ctx);
  const seen = new Set();
  const out = [];
  const lib = window.APP.library;
  for (const tok of hls) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const ex = (reading.expansion || []).find((e) => e.word.toLowerCase() === tok);
    if (ex) { out.push({ word: ex.word, phoneticUk: ex.phonetic, phoneticUs: '', meaning: ex.meaning, example: '', exampleCn: '', _from: 'expansion' }); continue; }
    const ex2 = (reading.extra || []).find((e) => e.word.toLowerCase() === tok);
    if (ex2) { out.push({ word: ex2.word, phoneticUk: ex2.phonetic, phoneticUs: '', meaning: ex2.meaning, example: '', exampleCn: '', _from: 'extra' }); continue; }
    const w = (lib.words || []).find((x) => x.word.toLowerCase() === tok);
    if (w) out.push(w);
  }
  return out.filter((w) => !isMastered(w.word));
}

function readingCard(r, i, ctx) {
  const hlCount = computeHighlights(r, ctx).length;
  return `
    <div class="reading-card" data-idx="${i}">
      <div class="rc-title">${escapeHtml(r.title)}</div>
      ${r.titleCn ? `<div class="rc-sub">${escapeHtml(r.titleCn)}</div>` : ''}
      <div class="rc-meta">Passage ${r.id || i + 1} · ${hlCount} 个高亮词${r.wordCount ? ` · ${r.wordCount} 词` : ''}</div>
    </div>`;
}

function openReading(view, ctx, reading) {
  let mode = 'overview';
  const setMode = (m) => { mode = m; render(); };
  function render() {
    try {
      if (mode === 'overview') return renderOverview(view, ctx, reading, setMode);
      if (mode === 'guide') return renderGuide(view, ctx, reading, setMode);
      if (mode === 'flash') return renderFlash(view, ctx, reading, setMode);
      if (mode === 'zh2en') return renderZh2En(view, ctx, reading, setMode);
      if (mode === 'en2zh') return renderEn2Zh(view, ctx, reading, setMode);
      if (mode === 'cloze') return renderCloze(view, ctx, reading, setMode);
    } catch (err) {
      console.error('阅读渲染失败:', err);
      ctx.toast('该文章渲染出错，请重试');
    }
  }
  render();
}

function modeBar(mode, setMode, reading) {
  const modes = [
    { k: 'overview', l: '文章概览' },
    { k: 'guide', l: '阅读导读' },
    { k: 'flash', l: '单词闪记' },
    { k: 'zh2en', l: '中译英' },
    { k: 'en2zh', l: '英译中' },
    { k: 'cloze', l: '完形填空' },
  ];
  return `
    <div class="reading-mode-bar">
      ${modes.map((m) => `<button class="mode-btn ${mode === m.k ? 'on' : ''}" data-mode="${m.k}">${m.l}</button>`).join('')}
    </div>`;
}

function renderTextHighlights(text, highlights, ctx) {
  if (!highlights || !highlights.length) return escapeHtml(text);
  const hls = highlights.slice().sort((a, b) => b.length - a.length);
  let safe = escapeHtml(text);
  const placeholders = [];
  for (const hl of hls) {
    const pat = '(^|[^\\p{L}\\p{N}])(' + escapeRegExp(hl) + ')(?![\\p{L}\\p{N}])';
    const re = new RegExp(pat, 'giu');
    safe = safe.replace(re, (m, before, word) => {
      const ph = `__HL_${placeholders.length}__`;
      placeholders.push({ ph, key: escapeHtml(hl.toLowerCase()), display: word });
      return before + ph;
    });
  }
  placeholders.forEach(({ ph, key, display }) => {
    safe = safe.replace(ph, `<span class="hl" data-w="${key}">${display}</span>`);
  });
  return safe;
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 把英文文本逐词包裹为可点击 span；高亮词附加 .hl
function tokenizeText(text, highlights) {
  if (!text) return '';
  const hlSet = new Set((highlights || []).map((h) => h.toLowerCase()));
  return text.replace(/[A-Za-z][A-Za-z'’-]*|[^A-Za-z'’-]+/g, (m) => {
    if (/^[A-Za-z]/.test(m)) {
      const lower = m.toLowerCase();
      const cls = hlSet.has(lower) ? 'w hl' : 'w';
      return `<span class="${cls}" data-w="${lower}">${escapeHtml(m)}</span>`;
    }
    return escapeHtml(m);
  });
}

function findWordData(ctx, key, reading) {
  return coreResolve(key, reading);
}

// 单词解析核心：屈折还原 → 主词库 → 本文拓展/加油站 → 规则复数还原
function coreResolve(key, reading) {
  const lib = window.APP.library;
  const lower = (key || '').toLowerCase().trim();
  if (!lower) return null;
  // 屈折形式（went / made / going …）→ 原形卡片，避免查找不到
  if (window.APP.formIndex && window.APP.formIndex[lower]) {
    const fi = window.APP.formIndex[lower];
    const base = (lib.words || []).find((x) => x.word.toLowerCase() === fi.base.toLowerCase());
    if (base) return Object.assign({}, base, { _form: { base: base.word, type: fi.type, form: lower } });
  }
  // 主词库精确匹配
  let w = (lib.words || []).find((x) => x.word.toLowerCase() === lower);
  if (w) return w;
  // 本文生词
  if (reading && reading.expansion) {
    const e = reading.expansion.find((x) => x.word.toLowerCase() === lower);
    if (e) return { word: e.word, phoneticUk: e.phonetic, phoneticUs: '', meaning: e.meaning, example: '', exampleCn: '', _from: 'expansion' };
  }
  // 词汇加油站
  if (reading && reading.extra) {
    const e = reading.extra.find((x) => x.word.toLowerCase() === lower);
    if (e) return { word: e.word, phoneticUk: e.phonetic, phoneticUs: '', meaning: e.meaning, example: '', exampleCn: '', _from: 'extra' };
  }
  // 规则复数还原（修复部分名词复数点不开原型卡片）
  for (const sg of lemmatizePlural(lower)) {
    if (sg && sg !== lower) {
      const base = (lib.words || []).find((x) => x.word.toLowerCase() === sg);
      if (base) return Object.assign({}, base, { _form: { base: base.word, type: 'plural', form: lower, guessed: true } });
    }
  }
  return null;
}

// 选词解析：支持词组 / 带 - 号合成词，做词形还原后查找；找不到返回 {_notfound}
function lookupPhrase(key, reading) {
  const lower = (key || '').toLowerCase().trim().replace(/['’]/g, "'");
  if (!lower) return { _notfound: true, word: key };
  // 已补充识别的短语/合成词 → 直接导向有道卡（提升识别率）
  if (window.APP.phraseSupplement && window.APP.phraseSupplement[lower]) {
    return { _notfound: true, word: key, known: true };
  }
  // 单/短语精确解析
  const single = coreResolve(lower, reading);
  if (single) return single;
  const isPhrase = /\s/.test(lower) || lower.indexOf('-') >= 0;
  if (isPhrase) {
    // 逐词词形还原后再试（如 broke down → break down）
    const reduced = lower.split(/\s+/).map((tok) => {
      const c = coreResolve(tok, reading);
      if (c && !c._notfound) return c.word.toLowerCase();
      for (const sg of lemmatizePlural(tok)) { if (sg && sg !== tok) return sg; }
      return tok;
    }).join(' ');
    if (reduced !== lower) {
      const r = coreResolve(reduced, reading);
      if (r) return Object.assign({}, r, { _form: Object.assign({}, (r._form || {}), { form: lower }) });
    }
    // 带 - 号合成词：尝试去掉末段复数 s（grown-ups → grown-up）
    if (lower.indexOf('-') >= 0) {
      const parts = lower.split('-');
      const last = parts[parts.length - 1];
      const sg = lemmatizePlural(last);
      if (sg && sg !== last) {
        const cand = parts.slice(0, -1).concat(sg).join('-');
        const r = coreResolve(cand, reading);
        if (r) return r;
      }
    }
  }
  // 未找到：短语/合成词补充进识别库（下次直接导向有道卡），并记录以便后续补全词库
  if (isPhrase && window.APP.phraseSupplement) {
    window.APP.phraseSupplement[lower] = { addedAt: Date.now() };
    try { localStorage.setItem('happy-vocab-phrase-supplement', JSON.stringify(window.APP.phraseSupplement)); } catch (e) {}
  }
  return { _notfound: true, word: key };
}

function openWordCard(ctx, key, reading) {
  // 统一走 app.js 的弹出逻辑（支持屈折形式解析）
  ctx.showWordCard(key);
}

/* ---------- 选词弹单词卡片（单击单词 / 拖选词组） ---------- */
let popEl = null;
let currentReading = null;     // 当前文章（供视图级事件委托读取）
let currentCtxRef = null;      // 当前 ctx（bindViewOnce 仅绑定一次）
let suppressNextClick = false; // 短语拖选后抑制紧随的单击
let dragState = null;
let _viewBound = false;

function onDocClick(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
function closePop() {
  if (popEl) { popEl.remove(); popEl = null; }
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('scroll', closePop, true);
  document.removeEventListener('keydown', onEsc, true);
}
function onEsc(e) { if (e.key === 'Escape') closePop(); }
function clearDrag() {
  if (dragState) { dragState.words.forEach((s) => s.classList.remove('sel')); dragState = null; }
}
function showWordPop(ctx, key, x, y, reading) {
  const w = lookupPhrase(key, reading);
  closePop();
  popEl = document.createElement('div');
  popEl.className = 'word-pop';
  popEl.innerHTML = (w && w._notfound) ? wordCardNotFoundHTML(key) : wordCardHTML(w, { showNote: true });
  document.body.appendChild(popEl);
  const r = popEl.getBoundingClientRect();
  let left = x, top = y + 10;
  if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
  if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - 10);
  popEl.style.left = Math.max(8, left) + 'px';
  popEl.style.top = Math.max(8, top) + 'px';
  bindWordCardEvents(popEl, ctx);
  document.addEventListener('click', onDocClick);
  document.addEventListener('scroll', closePop, true);
  document.addEventListener('keydown', onEsc, true);
}

// 视图级事件委托（只绑定一次）：单击单词弹卡；跨词拖拽收集词组弹卡
function bindViewOnce(view, ctx) {
  currentCtxRef = ctx;
  if (_viewBound) return;
  _viewBound = true;
  view.addEventListener('click', (e) => {
    if (suppressNextClick) { suppressNextClick = false; e.stopPropagation(); return; }
    const sp = e.target.closest('.w, .hl');
    if (!sp) return;
    openWordCard(currentCtxRef, sp.dataset.w, currentReading);
  });
  view.addEventListener('mousedown', (e) => {
    const sp = e.target.closest('.w, .hl');
    if (!sp) return;
    clearDrag();
    dragState = { words: [sp] };
    sp.classList.add('sel');
  });
  view.addEventListener('mouseover', (e) => {
    if (!dragState) return;
    const sp = e.target.closest('.w, .hl');
    if (!sp) return;
    if (dragState.words[dragState.words.length - 1] !== sp) {
      dragState.words.push(sp);
      sp.classList.add('sel');
    }
  });
  view.addEventListener('mouseup', (e) => {
    if (!dragState) return;
    const ds = dragState;
    clearDrag();
    if (ds.words.length > 1) {
      const phrase = ds.words.map((s) => s.dataset.w).join(' ');
      suppressNextClick = true;
      showWordPop(currentCtxRef, phrase, e.clientX, e.clientY, currentReading);
    }
  });
  document.addEventListener('mouseup', () => { if (dragState) clearDrag(); });
}

function bindModeButtons(view, setMode) {
  view.querySelectorAll('.mode-btn').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
}

function expChip(e) {
  return `
    <span class="exp-chip" data-w="${escapeHtml(e.word.toLowerCase())}">
      <b>${escapeHtml(e.word)}</b> <small>${escapeHtml(formatPhonetic(e.phonetic || ''))}</small>
      <em>${formatMeaningHTML(e.meaning || '')}</em>
    </span>`;
}

/* ---------- 1. 文章概览 ---------- */
function renderOverview(view, ctx, reading, setMode) {
  closePop();
  const hls = computeHighlights(reading, ctx);
  const textHtml = tokenizeText(reading.text, hls);
  const transHtml = reading.translation ? tokenizeText(reading.translation, []) : '';
  const expansion = (reading.expansion || []).map(expChip).join('');
  const extra = (reading.extra || []).map(expChip).join('');
  view.innerHTML = `
    <div class="card">
      <div class="between"><h2><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>${escapeHtml(reading.title)}</h2><button class="btn sm ghost" id="back">返回</button></div>
      ${reading.titleCn ? `<div class="rc-sub" style="margin-bottom:10px">${escapeHtml(reading.titleCn)}</div>` : ''}
      ${modeBar('overview', setMode, reading)}
    </div>
    <div class="card reading-overview">
      <div class="rtext">${textHtml}</div>
      ${transHtml ? `<div class="rtrans"><div class="rtrans-title">译文</div>${transHtml}</div>` : ''}
      ${expansion ? `<div class="rexp"><div class="rtrans-title">本文生词</div><div class="exp-chips">${expansion}</div></div>` : ''}
      ${extra ? `<div class="rexp"><div class="rtrans-title">词汇加油站</div><div class="exp-chips">${extra}</div></div>` : ''}
    </div>
  `;
  bindModeButtons(view, setMode);
  view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
  currentReading = reading;
  bindViewOnce(view, ctx);
  view.querySelectorAll('.exp-chip').forEach((c) => {
    c.addEventListener('click', () => openWordCard(ctx, c.dataset.w, reading));
  });
}

/* ---------- 2. 阅读导读 ---------- */
function renderGuide(view, ctx, reading, setMode) {
  closePop();
  const hls = computeHighlights(reading, ctx);
  const sentences = reading.sentences && reading.sentences.length
    ? reading.sentences
    : reading.text.match(/[^.!?]+[.!?]+/g).map((s) => ({ en: s.trim(), cn: '' }));
  const items = sentences.map((s) => `
    <div class="rsent">
      <div class="rsent-en">${tokenizeText(s.en, hls)}</div>
      ${s.cn ? `<div class="rsent-cn">${escapeHtml(s.cn)}</div>` : ''}
    </div>`).join('');
  view.innerHTML = `
    <div class="card">
      <div class="between"><h2><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>${escapeHtml(reading.title)}</h2><button class="btn sm ghost" id="back">返回</button></div>
      ${modeBar('guide', setMode, reading)}
    </div>
    <div class="reading-guide">${items}</div>
  `;
  bindModeButtons(view, setMode);
  view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
  currentReading = reading;
  bindViewOnce(view, ctx);
}

/* ---------- 3. 单词闪记 ---------- */
function renderFlash(view, ctx, reading, setMode) {
  const words = highlightWordObjects(reading, ctx);
  if (!words.length) { view.innerHTML = '<div class="card">本篇没有可练习的单词</div>'; return; }
  let idx = 0;
  function renderCard() {
    const e = words[idx];
    const libW = findWordData(ctx, e.word, reading);
    const w = libW || { word: e.word, phoneticUk: e.phonetic, phoneticUs: '', meaning: e.meaning, example: '', exampleCn: '' };
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2>${IC.zap}单词闪记</h2><button class="btn sm ghost" id="back">返回</button></div>
        ${modeBar('flash', setMode, reading)}
        <div class="pill" style="margin-top:10px">${idx + 1} / ${words.length}</div>
      </div>
      <div class="flash-wrap">
        <button class="flash-arrow left" id="arrowPrev" aria-label="上一个">‹</button>
        <div id="flashCard"></div>
        <button class="flash-arrow right" id="arrowNext" aria-label="下一个">›</button>
      </div>
      <div class="row mt">
        <button class="btn gray block" id="prev">上一张</button>
        <button class="btn ghost block" id="next">下一张</button>
      </div>
      <button class="btn block mt" id="done">${IC.checkSm}完成闪记</button>
    `;
    const wrap = view.querySelector('#flashCard');
    wrap.innerHTML = wordCardHTML(w, { showNote: true });
    bindWordCardEvents(wrap, ctx);
    // 自动播放英式发音
    ctx.playUK(w.word);
    const goPrev = () => { idx = (idx - 1 + words.length) % words.length; renderCard(); };
    const goNext = () => { idx = (idx + 1) % words.length; renderCard(); };
    view.querySelector('#prev').onclick = goPrev;
    view.querySelector('#next').onclick = goNext;
    const ap = view.querySelector('#arrowPrev'); if (ap) ap.onclick = goPrev;
    const an = view.querySelector('#arrowNext'); if (an) an.onclick = goNext;
    view.querySelector('#done').onclick = () => {
      // 闪记不算一次性全对，只计暴露轮次
      ctx.completeReadingSession(words.map((x) => x.word), new Set(words.map((x) => x.word)));
      setMode('overview');
    };
    bindModeButtons(view, setMode);
    view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
    view.scrollTop = 0; // 翻卡后回到顶部
  }
  renderCard();
}

/* ---------- 4. 中译英 ---------- */
function normalizeInput(s) { return (s || '').toLowerCase().replace(/[\s'’]/g, '').trim(); }
function renderZh2En(view, ctx, reading, setMode) {
  const words = highlightWordObjects(reading, ctx);
  if (!words.length) { view.innerHTML = '<div class="card">本篇没有可练习的单词</div>'; return; }
  let idx = 0, correct = 0, wrong = 0;
  const wrongWords = new Set();
  function renderQ() {
    const e = words[idx];
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2>🇨🇳 中译英</h2><button class="btn sm ghost" id="back">返回</button></div>
        ${modeBar('zh2en', setMode, reading)}
        <div class="pill" style="margin-top:10px">${idx + 1} / ${words.length}</div>
      </div>
      <div class="card">
        <div class="hint">请根据中文释义写出对应的英文单词：</div>
        <div class="meaning" style="font-size:18px;margin:16px 0">${formatMeaningHTML(e.meaning || '')}</div>
        <input type="text" class="typing" id="ans" placeholder="输入英文单词" autocomplete="off" autocorrect="off" spellcheck="false">
        <div id="feedback" class="mt" style="min-height:24px"></div>
        <button class="btn block mt" id="check">检查</button>
        <button class="btn gray block mt" id="skip" style="display:none">跳过</button>
      </div>
      <div class="card" style="text-align:center">
        <span class="pill">正确 ${correct}</span> <span class="pill">错误 ${wrong}</span>
      </div>
    `;
    const input = view.querySelector('#ans');
    input.focus();
    const check = () => {
      const val = input.value;
      const ok = normalizeInput(val) === normalizeInput(e.word);
      const fb = view.querySelector('#feedback');
      if (ok) {
        fb.innerHTML = `<span style="color:var(--ok);font-weight:700">${IC.checkSm}正确！</span>`;
        correct++;
        ctx.recordReadTask(e.word, 'zh2en', true);
      } else {
        fb.innerHTML = `<span style="color:var(--warn);font-weight:700">${IC.xSm}正确答案：${escapeHtml(e.word)}</span>`;
        wrong++;
        wrongWords.add(e.word);
        ctx.recordReadTask(e.word, 'zh2en', false);
        ctx.recordWrongQuestion({ word: e.word, type: 'zh2en', typeLabel: '中译英', prompt: e.meaning, choices: null, answer: e.word, user: val, ts: Date.now() });
      }
      view.querySelector('#check').style.display = 'none';
      const skip = view.querySelector('#skip');
      skip.style.display = 'block';
      skip.textContent = idx < words.length - 1 ? '下一题 →' : '完成';
      skip.onclick = () => {
        idx++;
        if (idx >= words.length) {
          ctx.completeReadingSession(words.map((x) => x.word), wrongWords);
          setMode('overview');
        }
        else { renderQ(); }
      };
      input.blur();
    };
    view.querySelector('#check').onclick = check;
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
    bindModeButtons(view, setMode);
    view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
  }
  renderQ();
}

/* ---------- 5. 英译中 ---------- */
function renderEn2Zh(view, ctx, reading, setMode) {
  const words = highlightWordObjects(reading, ctx).filter((e) => e.meaning);
  if (!words.length) { view.innerHTML = '<div class="card">本篇没有可练习的单词</div>'; return; }
  let idx = 0;
  const wrongWords = new Set();
  function renderQ() {
    const e = words[idx];
    const wd = findWordData(ctx, e.word, reading) || {};
    const uk = formatPhonetic(wd.phoneticUk || e.phonetic || '');
    const us = formatPhonetic(wd.phoneticUs || '');
    const pool = words.filter((x) => x.word !== e.word && x.meaning);
    // 中文选项用「常用译文」（取首义项），避免一长串义项；并去重
    const options = buildEn2ZhOptions(e.meaning, pool, 10);
    const ans = commonMeaning(e.meaning) || e.meaning;
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2>🇬🇧 英译中</h2><button class="btn sm ghost" id="back">返回</button></div>
        ${modeBar('en2zh', setMode, reading)}
        <div class="pill" style="margin-top:10px">${idx + 1} / ${words.length}</div>
      </div>
      <div class="card">
        <div class="word-main" style="text-align:center">${escapeHtml(e.word)}</div>
        <div class="word-phon cols" style="justify-content:center">
          ${uk ? `<span class="phon-tag">英</span><span class="audio-btn mini" data-act="uk" data-word="${escapeHtml(e.word)}">${IC.volumeSm}</span><span class="phon-uk">${uk}</span>` : ''}
          ${us ? `<span class="phon-tag us">美</span><span class="audio-btn mini" data-act="us" data-word="${escapeHtml(e.word)}">${IC.volumeSm}</span><span class="phon-us">${us}</span>` : ''}
        </div>
        <div class="hint mt">选出正确中文释义：</div>
        <div id="opts">${options.map((o, i) => `<button class="opt" data-i="${i}">${formatMeaningHTML(o)}</button>`).join('')}</div>
        <div id="explain" class="example mt" style="display:none"></div>
      </div>
    `;
    view.querySelector('[data-act="uk"]').onclick = () => ctx.playUK(e.word);
    view.querySelector('[data-act="us"]').onclick = () => ctx.playUS(e.word);
    const opts = view.querySelectorAll('.opt');
    opts.forEach((btn) => btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const val = options[+btn.dataset.i];
      const ok = val === ans;
      opts.forEach((b) => {
        const bv = options[+b.dataset.i];
        if (bv === e.meaning) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
        b.disabled = true;
      });
      const exp = view.querySelector('#explain');
      exp.style.display = 'block';
      exp.innerHTML = (ok ? IC.checkSm + '正确！ ' : IC.xSm + '正确答案：' + escapeHtml(e.word) + ' ') + formatMeaningHTML(e.meaning);
      if (ok) {
        ctx.recordReadTask(e.word, 'en2zh', true);
      } else {
        wrongWords.add(e.word);
        ctx.recordReadTask(e.word, 'en2zh', false);
        ctx.recordWrongQuestion({ word: e.word, type: 'en2zh', typeLabel: '英译中', prompt: e.word, choices: options, answer: ans, user: val, ts: Date.now() });
      }
      setTimeout(() => {
        idx++;
        if (idx >= words.length) {
          ctx.completeReadingSession(words.map((x) => x.word), wrongWords);
          setMode('overview');
        }
        else { renderQ(); }
      }, 900);
    }));
    bindModeButtons(view, setMode);
    view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
  }
  renderQ();
}

/* ---------- 6. 完形填空 ---------- */
function renderCloze(view, ctx, reading, setMode) {
  const words = highlightWordObjects(reading, ctx);
  if (!words.length) { view.innerHTML = '<div class="card">本篇没有可练习的单词</div>'; return; }
  // 为每个高亮词找一句包含它的原文句子
  const questions = words.map((e) => {
    const sentences = reading.sentences || [];
    const sent = sentences.find((s) => new RegExp('\\b' + escapeRegExp(e.word) + '\\b', 'i').test(s.en))
      || { en: reading.text, cn: '' };
    return { word: e.word, meaning: e.meaning, sentence: sent };
  }).filter((q) => q.sentence);
  if (!questions.length) { view.innerHTML = '<div class="card">本篇没有可用句子</div>'; return; }
  let idx = 0;
  const wrongWords = new Set();
  function renderQ() {
    const q = questions[idx];
    const pool = words.filter((x) => x.word !== q.word);
    const distract = shuffle(pool).slice(0, 3).map((x) => x.word);
    const options = shuffle([q.word, ...distract]);
    const blanked = q.sentence.en.replace(new RegExp('\\b' + escapeRegExp(q.word) + '\\b', 'i'), '______');
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2>${IC.puzzle}完形填空</h2><button class="btn sm ghost" id="back">返回</button></div>
        ${modeBar('cloze', setMode, reading)}
        <div class="pill" style="margin-top:10px">${idx + 1} / ${questions.length}</div>
      </div>
      <div class="card">
        <div class="example" style="font-size:17px;line-height:1.9">${escapeHtml(blanked)}</div>
        <div id="opts">${options.map((o, i) => `<button class="opt" data-i="${i}">${escapeHtml(o)}</button>`).join('')}</div>
        <div id="explain" class="example mt" style="display:none"></div>
      </div>
    `;
    const opts = view.querySelectorAll('.opt');
    opts.forEach((btn) => btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const val = options[+btn.dataset.i];
      const ok = val.toLowerCase() === q.word.toLowerCase();
      opts.forEach((b) => {
        const bv = options[+b.dataset.i];
        if (bv.toLowerCase() === q.word.toLowerCase()) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
        b.disabled = true;
      });
      const exp = view.querySelector('#explain');
      exp.style.display = 'block';
      exp.innerHTML = ok ? IC.checkSm + '正确！' : IC.xSm + '正确答案：' + escapeHtml(q.word);
      if (ok) {
        ctx.recordReadTask(q.word, 'cloze', true);
      } else {
        wrongWords.add(q.word);
        ctx.recordReadTask(q.word, 'cloze', false);
        ctx.recordWrongQuestion({ word: q.word, type: 'cloze', typeLabel: '完形填空', prompt: q.sentence.en, choices: options, answer: q.word, user: val, ts: Date.now() });
      }
      setTimeout(() => {
        idx++;
        if (idx >= questions.length) {
          ctx.completeReadingSession(questions.map((x) => x.word), wrongWords);
          setMode('overview');
        }
        else { renderQ(); }
      }, 1100);
    }));
    bindModeButtons(view, setMode);
    view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'reading' }));
  }
  renderQ();
}
