// 共享 UI 渲染组件
export function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 蓝色线性 SVG 图标库（与底部导航同一套 1.8px 描边风格）
const SVG_HEAD = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
function _svg(cls, paths, color) {
  const style = color ? ` style="color:${color}"` : '';
  return `<svg class="${cls}"${style} ${SVG_HEAD}>${paths}</svg>`;
}
const _ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  read: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/><path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z"/>',
  star: '<path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M10 2v8l3-3 3 3V2"/>',
  bookX: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M10 2v8l3-3 3 3V2"/><path d="m14.5 13.5-5 5"/><path d="m9.5 13.5 5 5"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  sliders: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  pin: '<path d="M12 21v-7"/><path d="M12 14a6 6 0 0 1 4-5.6V3H8v5.4A6 6 0 0 1 12 14z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="10" width="4" height="8" rx="1"/><rect x="15" y="6" width="4" height="12" rx="1"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  play: '<path d="M5 3l14 9-14 9z"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/><path d="M8 23h8"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-6.2-8.5"/><path d="M21 3v6h-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7 21l-5 1 1-5Z"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  volume: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  volumeX: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6"/><path d="M17 9l6 6"/>',
  puzzle: '<path d="M19 5a2.8 2.8 0 0 1 0 4h-3v3a2.8 2.8 0 0 1 0 4 2.8 2.8 0 0 1-4 0v-3H9v3a2.8 2.8 0 0 1-4 0 2.8 2.8 0 0 1 0-4h3V9H5a2.8 2.8 0 0 1 0-4 2.8 2.8 0 0 1 4 0v3h3V5a2.8 2.8 0 0 1 4 0v3h3V5z"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6v2h8v-2c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 16v2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};
export const IC = {};
// 白色变体：用于深蓝头部/主色按钮等深色底场景
export const ICW = {};
for (const [k, v] of Object.entries(_ICONS)) {
  IC[k] = _svg('vico', v);
  IC[k + 'Sm'] = _svg('vico-sm', v);
  ICW[k] = _svg('vico', v, '#fff');
  ICW[k + 'Sm'] = _svg('vico-sm', v, '#fff');
}
export function ico(name, sm = false) { return _svg(sm ? 'vico-sm' : 'vico', _ICONS[name] || ''); }

const POS_RE = /\s*(n|v|vt|vi|adj|adv|prep|conj|pron|art|int|aux|modal|num)\./i;

export function formatPhonetic(p) {
  if (!p) return '';
  let s = p.trim();
  // 去掉末尾可能残留的 n./v./adj. 等词性标记
  s = s.replace(/\s+(n|v|vt|vi|adj|adv|prep|conj|pron|art|int|aux|modal|num)\.?$/i, '');
  // 去掉两侧空格
  s = s.trim();
  if (!s) return '';
  // 如果已经有 /.../ 则保持
  if (/^\/.*\/$/.test(s)) return s;
  return '/' + s + '/';
}

// 取单词的「常用译文」：取第一个义项（去掉词性标签与多余义项），用于英译中选项/干扰项。
// 例如 "n. 建立；设立；创办" → "建立"；"v. & n. 影响" → "影响"。
export function commonMeaning(raw) {
  if (!raw) return '';
  const norm = normalizeMeaning(raw);
  if (!norm) return '';
  const tokens = norm.split(new RegExp('(?<![A-Za-z])(?=\\s*' + POS_CLASS + ')', 'i'));
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    // 去掉开头的词性标签（n. v. 等），取其后第一个义项作为常用译文
    const body = t.replace(new RegExp('^\\s*' + POS_CLASS + '\\s*', 'i'), '').trim();
    const senses = body.split(/[；;]/).map((x) => x.trim()).filter((s) => s && /[A-Za-z\u4e00-\u9fa5]/.test(s));
    if (senses.length) return senses[0];
  }
  return '';
}

// 生成英译中选项：以「常用译文」为单位，去重、含正确答案、洗牌，返回字符串数组。
// answerMeaning: 正确单词的 meaning；poolWords: 候选单词对象数组（含 .meaning）。
export function buildEn2ZhOptions(answerMeaning, poolWords, n = 10) {
  const ans = commonMeaning(answerMeaning) || answerMeaning;
  const seen = new Set([ans]);
  const dist = [];
  for (const w of shuffle(poolWords)) {
    if (dist.length >= n - 1) break;
    const m = commonMeaning(w.meaning);
    if (!m || seen.has(m)) continue;
    seen.add(m); dist.push(m);
  }
  const opts = shuffle([ans, ...dist]);
  return opts.slice(0, Math.max(2, n));
}

const POS_CLASS = '(?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|art|int|aux|modal|num)\\.)';
// 预处理：消除重复词性标签（n. n. → n.）、把 & 连接的词性规范为可读形式
function normalizeMeaning(raw) {
  if (!raw) return '';
  let s = raw;
  // 去掉「相同词性」的重复标记：n. n. → n.
  s = s.replace(new RegExp('\\b(' + POS_CLASS + ')\\s*(?=\\1)', 'gi'), '');
  // 词性之间用 & 连接（有无空格）：v. & n. / vt.&vi. → v./n. / vt./vi.
  s = s.replace(new RegExp('\\.' + '\\s*&\\s*(?=' + POS_CLASS + ')', 'gi'), './');
  s = s.replace(new RegExp('\\.' + '\\s*&\\s*(?=' + POS_CLASS + ')', 'gi'), './');
  // 孤立的 &（如 v. & 结尾）
  s = s.replace(/\b&\b/g, '');
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function formatMeaningHTML(meaning, maxSense = 3) {
  if (!meaning) return '';
  const norm = normalizeMeaning(meaning);
  if (!norm) return '';
  const tokens = norm.split(new RegExp('(?<![A-Za-z])(?=\\s*' + POS_CLASS + ')', 'i'));
  const lines = [];
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    const m = t.match(new RegExp('^\\s*(' + POS_CLASS + ')\\s*(.*)$', 'i'));
    if (m) {
      const pos = m[1].toLowerCase();
      let senses = m[2].split(/[；;]/).map((x) => x.trim()).filter(Boolean);
      if (!senses.length) continue; // 词性后无释义则不输出孤立行
      if (senses.length > maxSense) senses = senses.slice(0, maxSense);
      lines.push(`<div class="meaning-line"><b>${pos}</b> ${escapeHtml(senses.join('；'))}</div>`);
    } else {
      let senses = t.split(/[；;]/).map((x) => x.trim()).filter(Boolean);
      if (!senses.length) continue;
      if (senses.length > maxSense) senses = senses.slice(0, maxSense);
      lines.push(`<div class="meaning-line">${escapeHtml(senses.join('；'))}</div>`);
    }
  }
  if (!lines.length) return '';
  return `<div class="meaning-lines">${lines.join('')}</div>`;
}

const FORM_LABELS = { past: '过去式', pp: '过去分词', ing: '现在分词', plural: '复数' };
const FORM_ORDER = ['past', 'pp', 'ing', 'plural'];

function inflectHTML(inflect) {
  const items = FORM_ORDER.filter((k) => inflect[k]).map((k) => {
    const forms = String(inflect[k]).split('/').map((s) => s.trim()).filter(Boolean);
    return forms.map((f) => `<span class="form-chip" data-form="${escapeHtml(f.toLowerCase())}" title="点击查看 ${escapeHtml(f)} 的原形">${FORM_LABELS[k]}<b>${escapeHtml(f)}</b></span>`).join('');
  }).join('');
  if (!items) return '';
  return `<div class="inflect"><div class="inflect-title">词形变化</div><div class="form-chips">${items}</div></div>`;
}

function collocHTML(collocations) {
  if (!collocations || !collocations.length) return '';
  const items = collocations.slice(0, 6).map((c) =>
    `<div class="colloc-item"><b>${escapeHtml(c.phrase)}</b><span>${escapeHtml(c.meaning)}</span></div>`).join('');
  return `<div class="colloc"><div class="colloc-title">常用搭配</div>${items}</div>`;
}

export function wordCardHTML(w, { showAudio = true, showNote = true, showStar = true } = {}) {
  if (!w) return '';
  const uk = formatPhonetic(w.phoneticUk || w.phonetic || '');
  const us = formatPhonetic(w.phoneticUs || '');
  // 自然拼读：优先用已存字段；纯单词若缺失则实时用 PhonicsCore 重算（保证重读音节大写）
  let ph = w.phonics || '';
  if (!ph && typeof window !== 'undefined' && window.PhonicsCore && /^[A-Za-z]+$/.test(w.word || '')) {
    ph = window.PhonicsCore.render(w.word);
  }
  const mastered = (window.APP && window.APP.progress && window.APP.progress.mastered && window.APP.progress.mastered[w.word.toLowerCase()]) ? '<span class="pill">已掌握</span>' : '';
  const formNote = w._form ? `<span class="form-note">（${escapeHtml(w._form.base)} 的${FORM_LABELS[w._form.type] || '形式'}）</span>` : '';
  const ukPart = (showAudio && uk) ? `<span class="phon-tag">英</span><span class="audio-btn mini" data-act="uk" data-word="${escapeHtml(w.word)}" title="英音">${IC.volumeSm}</span><span class="phon-uk">${uk}</span>` : (uk ? `<span class="phon-tag">英</span><span class="phon-uk">${uk}</span>` : '');
  const usPart = (showAudio && us) ? `<span class="phon-tag us">美</span><span class="audio-btn mini" data-act="us" data-word="${escapeHtml(w.word)}" title="美音">${IC.volumeSm}</span><span class="phon-us">${us}</span>` : (us ? `<span class="phon-tag us">美</span><span class="phon-us">${us}</span>` : '');
  const phonLine = (uk || us) ? `<div class="word-phon cols">${ukPart}${usPart}</div>` : '';
  const noteBtn = showNote ? `<button class="btn sm gray" data-act="note" data-word="${escapeHtml(w.word)}">+生词本</button>` : '';
  // vxiaozhi 精确助记图：有图才显示。外层 .word-pict-wrap 用 aspect-ratio 裁掉底部约 7.5%
  // （源图右下角固定带「小智晖的AI单词本」水印，位于底边 93.9%~98.1%，裁掉整条底边即彻底去除水印）。
  // 加载失败时整块移除，加载中/无图不占位。
  const pictUrl = (typeof vxImgURL === 'function') ? vxImgURL(w.word) : null;
  const pictHTML = pictUrl
    ? `<div class="word-pict-wrap"><img class="word-pict" src="${escapeHtml(pictUrl)}" alt="${escapeHtml(w.word)} 助记图" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="(this.closest('.word-pict-wrap')||this).remove()"></div>`
    : '';
  return `
  <div class="word-card" data-word="${escapeHtml(w.word)}">
    <div class="word-top">
      <div class="word-main">${escapeHtml(w.word)} ${mastered} ${formNote}</div>
    </div>
    ${pictHTML}
    ${phonLine}
    ${ph ? `<div class="phonics">拼读: ${escapeHtml(ph)}</div>` : ''}
    <div class="meaning">${formatMeaningHTML(w.meaning)}</div>
    ${w.inflect ? inflectHTML(w.inflect) : ''}
    ${w.collocations ? collocHTML(w.collocations) : ''}
    ${w.example ? `<div class="example">${escapeHtml(w.example)}<div class="cn">${escapeHtml(w.exampleCn || '')}</div></div>` : ''}
    ${showNote ? `<div class="row mt between"><span class="muted">${w.category ? '分类: ' + escapeHtml(w.category) : ''}</span>${noteBtn}</div>` : ''}
  </div>`;
}

// 绑定单词卡片内的事件（发音/收藏/词形点击）
export function bindWordCardEvents(container, c) {
  container.querySelectorAll('[data-act="uk"]').forEach((b) => b.addEventListener('click', () => c.playUK(b.dataset.word)));
  container.querySelectorAll('[data-act="us"]').forEach((b) => b.addEventListener('click', () => c.playUS(b.dataset.word)));
  container.querySelectorAll('[data-act="note"]').forEach((b) => b.addEventListener('click', () => c.toggleNotebook(b.dataset.word)));
  container.querySelectorAll('.form-chip').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (c.showWordCard) c.showWordCard(b.dataset.form);
  }));
}

// 随机选项生成（用于英译中/完形）
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(allWords, correctWord, field, n) {
  const pool = shuffle(allWords.filter((w) => w.word !== correctWord && (w[field] || '').trim()));
  return pool.slice(0, n).map((w) => w[field]);
}

// 规则复数 → 单数候选数组（仅作候选，是否采用由调用方校验词库存在性决定）
// 覆盖 -ies / -ves / -ches -shes -ses -xes -zes / -es / -s（排除 -ss 等），
// 并补齐双写辅音（quizzes → quizz → quiz）。
export function lemmatizePlural(w) {
  if (!w || w.length < 3) return [];
  const s = w.toLowerCase();
  const out = [];
  if (s.endsWith('ies') && s.length > 4) out.push(s.slice(0, -3) + 'y');
  if (s.endsWith('ves') && s.length > 3) out.push(s.slice(0, -3) + 'f'); // wolves→wolf, knives→knife
  if (s.endsWith('ches') || s.endsWith('shes') || s.endsWith('ses') || s.endsWith('xes') || s.endsWith('zes')) out.push(s.slice(0, -2));
  if (s.endsWith('es') && s.length > 3) out.push(s.slice(0, -2));
  if (s.endsWith('s') && !s.endsWith('ss') && s.length > 2) out.push(s.slice(0, -1));
  // 去重 + 双写辅音再退一级（quizzes→quizz→quiz, addresses→addres→address）
  const seen = new Set();
  const res = [];
  for (const c of out) {
    if (!seen.has(c)) { seen.add(c); res.push(c); }
    if (c.length > 3 && c[c.length - 1] === c[c.length - 2]) {
      const d = c.slice(0, -1);
      if (!seen.has(d)) { seen.add(d); res.push(d); }
    }
  }
  return res;
}

// 词库中未收录时，弹出引导跳转网易有道查询的卡片（需求6）
export function wordCardNotFoundHTML(word) {
  const w = escapeHtml(word);
  const url = 'https://www.youdao.com/result?word=' + encodeURIComponent(word) + '&lang=en';
  return `
  <div class="word-card notfound">
    <div class="word-main">${w}</div>
    <div class="meaning"><div class="meaning-line">词库中未收录该词</div></div>
    <a class="btn block youdao-link" href="${url}" target="_blank" rel="noopener">${IC.eyeSm}在网易有道查询 “${w}”</a>
    <div class="muted" style="margin-top:8px;font-size:12px">点击将在新标签页打开有道词典结果</div>
  </div>`;
}
