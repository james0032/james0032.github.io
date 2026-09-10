import { runStudy } from '../study.js';
import { escapeHtml, wordCardHTML, bindWordCardEvents, IC } from '../ui.js';

function isMastered(word) {
  return !!(window.APP && window.APP.progress && window.APP.progress.mastered && window.APP.progress.mastered[word.toLowerCase()]);
}

/* ---------- 分类扩展数据（考频/词根/相似/象形）懒加载 ---------- */
let _tax = null;
let _taxPromise = null;
function loadTax() {
  if (_tax) return Promise.resolve(_tax);
  if (!_taxPromise) {
    _taxPromise = fetch('/data/taxonomy.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((t) => { _tax = t; return t; })
      .catch((e) => { _taxPromise = null; throw e; });
  }
  return _taxPromise;
}

// 象形记精确配图清单：单词 -> vxiaozhi 助记图 URL。
// 数据来源 https://github.com/vxiaozhi/vocabulary-book-by-deepseek（已上线 https://word.vxiaozhi.com），
// 每个单词由 AI 按其词义生成一张助记图像，按「字母/单词.jpg」命名，对应精准、远优于 emoji/语义标签取图。
// 清单由 tools/build_vxiaozhi_pict.js 依据本词库与 vxiaozhi 词表交集生成（word -> 远程图 URL），这里只读取。
let _pictImgs = null; // Map<wordLower, url>
function loadPictImages() {
  if (_pictImgs) return Promise.resolve(_pictImgs);
  _pictImgs = new Map();
  return fetch('/data/pict_images.json?v=20260910e')
    .then((r) => (r.ok ? r.json() : {}))
    .then((obj) => { Object.entries(obj || {}).forEach(([w, url]) => _pictImgs.set(String(w).toLowerCase(), url)); return _pictImgs; })
    .catch(() => _pictImgs);
}
// 取单词的 vxiaozhi 精确助记图 URL（无则 null），供象形记优先显示
function vxImgURL(w) {
  if (!_pictImgs || !w) return null;
  return _pictImgs.get(String(w).toLowerCase()) || null;
}

let _wmap = null;
function wordMap(APP) {
  if (!_wmap) {
    _wmap = new Map();
    for (const w of (APP.library.words || [])) _wmap.set(w.word.toLowerCase(), w);
  }
  return _wmap;
}
function resolveWords(APP, list) {
  const m = wordMap(APP);
  return (list || []).map((k) => m.get(String(k).toLowerCase())).filter(Boolean);
}
const FREQ_TIERS = [
  { k: 'hot', name: '高频核心', desc: '词频榜前 3000 · 考试最常考', test: (r) => r <= 3000 },
  { k: 'mid', name: '常用进阶', desc: '词频榜 3001-6000 · 阅读常客', test: (r) => r > 3000 && r <= 6000 },
  { k: 'low', name: '低频扩展', desc: '词频榜 6000 以后 · 拔高词汇', test: (r) => r > 6000 },
  { k: 'off', name: '榜外生词', desc: '未进入万词榜 · 专业/超纲词', test: () => true },
];
const PICT_ICONS = { '动物与自然': '🐻', '食物与饮品': '🍎', '人物与身体': '🧑', '物品与工具': '🔧', '活动与运动': '⚽', '旅行与地点': '✈', '情感与表情': '😀', '符号': '🔣', '图标简笔': '🖍️', '义符': '🔤', '其他': '✨' };
// 象形记总数：emoji 图记 + 线性图标简笔
function pictTotal(tax) { return Object.keys(tax.pict || {}).length + Object.keys(tax.pictIcon || {}).length; }
// 线性图标简笔 SVG（phosphor 为填充型，其余为描边型，分别处理以保证都能渲染）
function iconSvg(v) {
  if (!v) return '';
  const [coll, , body, iw, ih] = v;
  const stroke = coll !== 'ph';
  return `<svg class="p-svg" viewBox="0 0 ${iw || 24} ${ih || 24}" fill="${stroke ? 'none' : 'currentColor'}" stroke="${stroke ? 'currentColor' : 'none'}" stroke-width="${stroke ? 1.8 : 0}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
// 人教版高中册顺序（与听写模块保持一致），用于单元排序与分组
const HS_BOOKS = ['必修一', '必修二', '必修三', '选必一', '选必二', '选必三', '选必四'];
function hsUnitSortKey(u) {
  if (!u) return [99, 99];
  const wm = /^(.+?)\s*Welcome\s*Unit$/i.exec(u);
  if (wm) return [HS_BOOKS.indexOf(wm[1]), -1];
  const m = /^([^U]+)U(\d+)$/.exec(u);
  if (!m) return [99, 99];
  return [HS_BOOKS.indexOf(m[1]), Number(m[2])];
}
// 收集高中各单元单词，按「册 -> 单元」分组（Welcome Unit 置于该册最前）
function hsUnitGroups(APP) {
  const byUnit = {};
  for (const w of (APP.library.words || [])) {
    const p = w.pep;
    if (p && p.band === '高中' && p.unit) (byUnit[p.unit] = byUnit[p.unit] || []).push(w);
  }
  const books = {};
  for (const u of Object.keys(byUnit)) {
    const sk = hsUnitSortKey(u);
    const m = /^(.+?)\s*Welcome\s*Unit$/i.exec(u);
    const book = m ? m[1] : (u.replace(/U\d+$/, '') || '其他');
    if (!books[book]) books[book] = { order: sk[0], units: [] };
    books[book].units.push({ unit: u, words: byUnit[u], sk });
  }
  const list = Object.keys(books).map((b) => books[b]).sort((a, b) => a.order - b.order);
  list.forEach((bk) => bk.units.sort((a, b) => a.sk[0] - b.sk[0] || a.sk[1] - b.sk[1]));
  return list;
}

export default {
  render({ view, APP, ctx }) {
    const words = (APP.library && APP.library.words) || [];
    const groups = {};
    words.forEach((w) => {
      const cat = w.category || '未分类';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(w);
    });
    const cats = Object.keys(groups).sort((a, b) => {
      if (a === '未分类') return 1;
      if (b === '未分类') return -1;
      return a.localeCompare(b, 'zh-CN');
    });
    if (!cats.length) {
      view.innerHTML = '<div class="card">词库暂无数据，请到「导入」添加单词。</div>';
      return;
    }
    // 高中分单元：统计单元数与待练数
    const hsGroups = hsUnitGroups(APP);
    let hsUnits = 0, hsActive = 0;
    hsGroups.forEach((bk) => bk.units.forEach((u) => {
      hsUnits++;
      hsActive += u.words.filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w)).length;
    }));
    const TAX_CARDS = [
      { kind: 'unit', icon: IC.bookSm, name: '单元记', desc: hsUnits + ' 个教材单元', badge: hsActive ? hsActive + ' 词待练' : '按册逐单元练' },
      { kind: 'pict', icon: '🧩', name: '象形记', desc: '图像联想记忆', badge: '加载中…' },
      { kind: 'roots', icon: IC.bookOpenSm, name: '词根记', desc: '词根词缀拆词', badge: '加载中…' },
      { kind: 'freq', icon: IC.chartSm, name: '考频记', desc: '按考试词频分层', badge: '加载中…' },
      { kind: 'similar', icon: IC.targetSm, name: '相似记', desc: '易混词对比记', badge: '加载中…' },
    ];
    view.innerHTML = `
      <div class="section-title"><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>分类记 · 共 ${cats.length} 个分类 / ${words.length} 词</div>
      <div class="tax-grid">
        ${TAX_CARDS.map((c) => `
        <div class="cat-card tax-card" data-tax="${c.kind}">
          <div class="c-name">${c.icon}${c.name}</div>
          <div class="c-count">${c.desc}</div>
          <span class="badge" data-taxbadge="${c.kind}">${c.badge}</span>
        </div>`).join('')}
      </div>
      <div class="section-title" style="margin-top:18px">${IC.grid}主题分类</div>
      <div class="cat-grid">
        ${cats.map((c) => {
          const all = groups[c];
          const active = all.filter((w) => !isMastered(w.word));
          const activeDiff = active.filter((w) => ctx.matchDifficulty(w));
          const masteredCount = all.length - active.length;
          const badge = activeDiff.length ? `${activeDiff.length} 词待练` : '当前难度无待练';
          return `
          <div class="cat-card" data-cat="${escapeHtml(c)}">
            <div class="c-name">${escapeHtml(c)}</div>
            <div class="c-count">${all.length} 词${masteredCount ? ` · 已掌握 ${masteredCount}` : ''}</div>
            <span class="badge">${badge}</span>
          </div>`;
        }).join('')}
      </div>
    `;
    view.querySelectorAll('.cat-card').forEach((card) => {
      if (card.dataset.tax) {
        card.addEventListener('click', () => openTaxSub(view, ctx, APP, card.dataset.tax));
        return;
      }
      card.addEventListener('click', () => {
        const cat = card.dataset.cat;
        const active = groups[cat].filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
        if (!active.length) { ctx.toast('该分类在当前难度下暂无待练单词 🎉'); return; }
        openCategory(view, ctx, cat, active);
      });
    });
    // 异步填充五张入口卡的统计
    loadTax().then((tax) => {
      const m = wordMap(APP);
      const act = (k) => resolveWords(APP, k).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
      const set = (kind, text) => {
        const el = view.querySelector(`[data-taxbadge="${kind}"]`);
        if (el) el.textContent = text;
      };
      if (!view.isConnected) return;
      set('pict', pictTotal(tax) + ' 词有图记');
      set('roots', (tax.roots || []).length + ' 组词根词缀');
      const fc = FREQ_TIERS.map((t) => {
        const ws = Object.entries(tax.freq || {}).filter(([w, r]) => byWordIn(m, w) && t.test(r));
        return act(ws.map(([w]) => w)).length;
      }).reduce((a, b) => a + b, 0);
      set('freq', fc + ' 词待练');
      const sc = (tax.similar || []).filter((g) => act(g).length >= 2).length;
      set('similar', sc + ' 组易混词');
    }).catch(() => {
      ['pict', 'roots', 'freq', 'similar'].forEach((k) => {
        const el = view.querySelector(`[data-taxbadge="${k}"]`);
        if (el) el.textContent = '数据未加载';
      });
    });
  },
};

function byWordIn(m, w) { return m.has(w); }

/* ---------- 扩展子模块：单元记/象形记/词根记/考频记/相似记 ---------- */
function openTaxSub(view, ctx, APP, kind) {
  if (kind === 'unit') return openHSUnits(view, ctx, APP);
  view.innerHTML = '<div class="card">分类数据加载中…</div>';
  loadTax().then((tax) => {
    if (!view.isConnected) return;
    if (kind === 'roots') renderRoots(view, ctx, APP, tax, 'all');
    else if (kind === 'similar') renderSimilar(view, ctx, APP, tax);
    else if (kind === 'freq') renderFreq(view, ctx, APP, tax);
    else if (kind === 'pict') loadPictImages().then(() => renderPictCats(view, ctx, APP, tax)).catch(() => renderPictCats(view, ctx, APP, tax));
  }).catch(() => {
    view.innerHTML = '<div class="card">扩展分类数据加载失败，请通过服务器（而非本地文件）访问后重试。</div>';
  });
}
function backMain() { return () => window.dispatchEvent(new CustomEvent('goto', { detail: 'category' })); }

function renderRoots(view, ctx, APP, tax, filter) {
  const back = backMain();
  const types = [['all', '全部'], ['pre', '前缀'], ['root', '词根'], ['suf', '后缀']];
  const list = (tax.roots || []).filter((g) => filter === 'all' || !filter || g.t === filter);
  view.innerHTML = `
    <div class="section-title">${IC.bookOpen}词根记 · ${list.length} 组</div>
    <div class="card">
      <div class="between"><h2>词根词缀 · 拆词速记</h2><button class="btn sm ghost" id="back">返回分类</button></div>
      <p class="hint" style="margin-top:4px">掌握一个词根 = 串记一族单词。数据来源：开源英语词根库（1061 条）精选 + 词库匹配。</p>
      <div class="reading-mode-bar" style="margin-top:8px">
        ${types.map(([k, n]) => `<button class="mode-btn ${filter === k ? 'on' : ''}" data-rt="${k}">${n}</button>`).join('')}
      </div>
    </div>
    <div class="cat-grid">
      ${list.map((g) => {
        const act = resolveWords(APP, g.words).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
        return `<div class="cat-card" data-root="${escapeHtml(g.k)}" data-cn="${escapeHtml(g.cn)}">
          <div class="c-name">${escapeHtml(g.k)} <span class="rt-type t-${g.t}">${g.t === 'pre' ? '前缀' : g.t === 'suf' ? '后缀' : '词根'}</span></div>
          <div class="c-count">${escapeHtml(g.cn)}${g.en ? ' · ' + escapeHtml(g.en) : ''}</div>
          <span class="badge">${g.words.length} 词 · 待练 ${act.length}</span>
        </div>`;
      }).join('')}
    </div>`;
  view.querySelector('#back').onclick = back;
  view.querySelectorAll('[data-rt]').forEach((b) => b.addEventListener('click', () => renderRoots(view, ctx, APP, tax, b.dataset.rt)));
  view.querySelectorAll('.cat-card[data-root]').forEach((card) => {
    card.addEventListener('click', () => {
      const g = (tax.roots || []).find((x) => x.k === card.dataset.root);
      if (!g) return;
      const act = resolveWords(APP, g.words).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
      if (!act.length) { ctx.toast('该词根在当前难度下暂无待练单词 🎉'); return; }
      openCategory(view, ctx, `词根 ${g.k} · ${g.cn}`, act, () => renderRoots(view, ctx, APP, tax, filter));
    });
  });
  view.scrollTop = 0;
}

function renderSimilar(view, ctx, APP, tax) {
  const back = backMain();
  const groups = (tax.similar || [])
    .map((g) => ({ g, act: resolveWords(APP, g).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w)) }))
    .filter((x) => x.act.length >= 2);
  view.innerHTML = `
    <div class="section-title">${IC.target}相似记 · ${groups.length} 组易混词</div>
    <div class="card">
      <div class="between"><h2>相似词 · 对比速记</h2><button class="btn sm ghost" id="back">返回分类</button></div>
      <p class="hint" style="margin-top:4px">拼写只差一个字母的「双胞胎词」集中对比，一遍记牢、不再混淆（编辑距离算法自动聚类）。</p>
    </div>
    <div class="cat-grid">
      ${groups.map(({ g, act }) => `
      <div class="cat-card" data-sim="${escapeHtml(g.join(','))}">
        <div class="c-name sim-names">${g.map((w) => escapeHtml(w)).join('<i class="sep">/</i>')}</div>
        <span class="badge">${g.length} 词 · 待练 ${act.length}</span>
      </div>`).join('')}
    </div>`;
  view.querySelector('#back').onclick = back;
  view.querySelectorAll('.cat-card[data-sim]').forEach((card) => {
    card.addEventListener('click', () => {
      const g = card.dataset.sim.split(',');
      const act = resolveWords(APP, g).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
      if (act.length < 2) { ctx.toast('这组词在当前难度下暂无可练单词 🎉'); return; }
      openCategory(view, ctx, '相似记 · ' + g.slice(0, 3).join(' / ') + (g.length > 3 ? '…' : ''), act, () => renderSimilar(view, ctx, APP, tax));
    });
  });
  view.scrollTop = 0;
}

function renderFreq(view, ctx, APP, tax) {
  const back = backMain();
  const m = wordMap(APP);
  const tiers = FREQ_TIERS.map((t) => {
    let entries;
    if (t.k === 'off') {
      entries = [...m.keys()].filter((w) => !(tax.freq || {})[w]);
      entries.sort((a, b) => ((m.get(a).difficulty || 9) - (m.get(b).difficulty || 9)) || a.localeCompare(b));
    } else {
      entries = Object.entries(tax.freq || {}).filter(([w, r]) => m.has(w) && t.test(r))
        .sort((a, b) => a[1] - b[1]).map(([w]) => w);
    }
    const act = resolveWords(APP, entries).filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
    return { ...t, words: entries, act };
  });
  view.innerHTML = `
    <div class="section-title">${IC.chart}考频记 · 按考试词频分层</div>
    <div class="card">
      <div class="between"><h2>考频分层 · 先啃高频词</h2><button class="btn sm ghost" id="back">返回分类</button></div>
      <p class="hint" style="margin-top:4px">依据 Google 万词频榜（开源语料统计）为词库标注考频层级：排名越靠前，考试出现概率越高。</p>
    </div>
    <div class="cat-grid">
      ${tiers.map((t) => `
      <div class="cat-card" data-tier="${t.k}">
        <div class="c-name">${t.name}</div>
        <div class="c-count">${t.desc}</div>
        <span class="badge">${t.words.length} 词 · 待练 ${t.act.length}</span>
      </div>`).join('')}
    </div>`;
  view.querySelector('#back').onclick = back;
  view.querySelectorAll('.cat-card[data-tier]').forEach((card) => {
    card.addEventListener('click', () => {
      const t = tiers.find((x) => x.k === card.dataset.tier);
      if (!t) return;
      if (!t.act.length) { ctx.toast('该层级在当前难度下暂无待练单词 🎉'); return; }
      let act = t.act;
      if (act.length > 600) { act = act.slice(0, 600); ctx.toast('词量较大，本次先练前 600 词'); }
      openCategory(view, ctx, `考频记 · ${t.name}`, act, () => renderFreq(view, ctx, APP, tax));
    });
  });
  view.scrollTop = 0;
}

function renderPictCats(view, ctx, APP, tax) {
  const back = backMain();
  const byCat = {};
  for (const [w, [e, c]] of Object.entries(tax.pict || {})) {
    if (!wordMap(APP).has(w)) continue;
    (byCat[c] = byCat[c] || []).push([w, e]);
  }
  for (const [w] of Object.entries(tax.pictIcon || {})) {
    if (!wordMap(APP).has(w) || tax.pict[w]) continue;
    (byCat['图标简笔'] = byCat['图标简笔'] || []).push([w, null]);
  }
  const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length);
  view.innerHTML = `
    <div class="section-title">🧩象形记 · ${pictTotal(tax)} 词有图记</div>
    <div class="card">
      <div class="between"><h2>象形图记 · 一图记一词</h2><button class="btn sm ghost" id="back">返回分类</button></div>
      <p class="hint" style="margin-top:4px">为单词配一幅「心理图像」，图像联想是最古老的记忆术。图源：vxiaozhi AI 助记图（每个单词一张按词义精确生成的配图，已上线 word.vxiaozhi.com）优先，缺图时回退 Unicode emoji 与 Tabler/Phosphor 开源简笔图标。</p>
    </div>
    <div class="cat-grid">
      ${cats.map((c) => {
        const preview = c === '图标简笔'
          ? iconSvg(tax.pictIcon[byCat[c][0][0]])
          : (() => {
              const hit = byCat[c].find(([w]) => vxImgURL(w));
              if (!hit) return '';
              const tw = hit[0];
              return `<img class="c-prev-img" loading="lazy" alt="${escapeHtml(tw)}" src="${escapeHtml(vxImgURL(tw))}">`;
            })();
        const sample = c === '图标简笔'
          ? byCat[c].slice(0, 4).map(([w]) => escapeHtml(w)).join(' ')
          : byCat[c].slice(0, 4).map(([w, e]) => escapeHtml(e)).join(' ');
        return `
      <div class="cat-card" data-pcat="${escapeHtml(c)}">
        <div class="c-name">${PICT_ICONS[c] || '✨'} ${escapeHtml(c)}</div>
        ${preview ? `<div class="c-prev">${preview}</div>` : ''}
        <div class="c-count">${sample}</div>
        <span class="badge">${byCat[c].length} 词</span>
      </div>`;
      }).join('')}
    </div>`;
  view.querySelector('#back').onclick = back;
  view.querySelectorAll('.c-prev-img').forEach((img) => { img.addEventListener('error', () => { img.style.display = 'none'; }); });
  view.querySelectorAll('.cat-card[data-pcat]').forEach((card) => {
    card.addEventListener('click', () => renderPictGrid(view, ctx, APP, tax, card.dataset.pcat));
  });
  view.scrollTop = 0;
}

function renderPictGrid(view, ctx, APP, tax, cat, page) {
  if (typeof page !== 'number' || page < 0) page = 0;
  const m = wordMap(APP);
  const isIconCat = cat === '图标简笔';
  const isMeanCat = cat === '义符';
  const all = isIconCat
    ? Object.entries(tax.pictIcon || {}).filter(([w]) => m.has(w) && !tax.pict[w])
        .sort((a, b) => ((m.get(a[0]).difficulty || 9) - (m.get(b[0]).difficulty || 9)) || a[0].localeCompare(b[0]))
    : Object.entries(tax.pict || {}).filter(([w, [, c]]) => c === cat && m.has(w))
        .sort((a, b) => ((m.get(a[0]).difficulty || 9) - (m.get(b[0]).difficulty || 9)) || a[0].localeCompare(b[0]));
  const PAGE = 48;
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE));
  if (page >= totalPages) page = totalPages - 1;
  const items = all.slice(page * PAGE, page * PAGE + PAGE);
  const shortMeaning = (w) => { const x = m.get(w); return ((x && x.meaning) || '').split(/[；;]/)[0]; };
  const imgHTML = (w, v) => {
    if (isIconCat) return iconSvg(v);                 // 图标简笔模块：保留 SVG 简笔（本身就是简笔画）
    const em = escapeHtml((v && v[0]) || '🔤');        // 表情图兜底
    // 精确助记图优先：vxiaozhi 每个单词的 AI 助记图像（按单词命名，对应精准），无图回退 emoji
    const url = vxImgURL(w);
    if (url) return `<img class="p-img" loading="lazy" alt="${escapeHtml(w)}" src="${escapeHtml(url)}" data-emoji="${em}">`;
    // 无 vxiaozhi 图：回退 Unicode emoji（象形/义符类）
    return `<span class="p-e">${em}</span>`;
  };
  const pager = (pos) => `
    <div class="pager pager-${pos}">
      <button class="btn sm ghost" data-pg="prev" ${page <= 0 ? 'disabled' : ''}>‹ 上一页</button>
      <span class="pager-info">第 ${page + 1}/${totalPages} 页 · 共 ${all.length} 词</span>
      <button class="btn sm ghost" data-pg="next" ${page + 1 >= totalPages ? 'disabled' : ''}>下一页 ›</button>
    </div>`;
  view.innerHTML = `
    <div class="section-title">🧩象形记 · ${escapeHtml(cat)}（${all.length} 词）</div>
    <div class="card"><div class="between"><h2>${PICT_ICONS[cat] || '✨'} ${escapeHtml(cat)}</h2><button class="btn sm ghost" id="back">返回</button></div>
    <p class="hint" style="margin-top:4px">${isMeanCat ? '含义联想：用单词中文释义里的关键词配 emoji，建立图像关联（本地生成，不联网）。' : '点击任意词卡进入闪记；点「全部闪记」从该分类第一个词开始过词。单词优先显示 vxiaozhi AI 助记图（按词义精确生成），无图时回退 emoji。'}每页 ${PAGE} 词，可翻页浏览。</p></div>
    ${totalPages > 1 ? pager('top') : ''}
    <div class="pict-grid">
      ${items.map(([w, v]) => `
      <button class="pict-card" data-word="${escapeHtml(w)}">
        ${imgHTML(w, v)}
        <span class="p-w">${escapeHtml(w)}</span>
        <span class="p-m">${escapeHtml(shortMeaning(w).slice(0, 18))}</span>
      </button>`).join('')}
    </div>
    ${totalPages > 1 ? pager('bottom') : ''}
    <button class="btn block mt" id="allFlash">${IC.zapSm}全部闪记（${all.length} 词）</button>`;
  view.querySelector('#back').onclick = () => renderPictCats(view, ctx, APP, tax);
  const goPage = (p) => renderPictGrid(view, ctx, APP, tax, cat, p);
  view.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    if (b.dataset.pg === 'prev') goPage(page - 1);
    else goPage(page + 1);
  }));
  view.querySelectorAll('.pict-card').forEach((b) => {
    b.addEventListener('click', () => {
      const w = m.get(b.dataset.word);
      if (w) openCategory(view, ctx, `象形记 · ${w.word}`, [w], () => renderPictGrid(view, ctx, APP, tax, cat, 0));
    });
  });
  // 真实语义照片加载失败 → 回退 emoji（表情图兜底）
  view.querySelectorAll('.p-img').forEach((img) => {
    img.addEventListener('error', function onErr() {
      const sp = document.createElement('span'); sp.className = 'p-e'; sp.textContent = img.dataset.emoji || '🔤';
      img.replaceWith(sp);
    });
  });
  view.querySelector('#allFlash').onclick = () => {
    const act = all.map(([w]) => m.get(w)).filter((w) => w && !isMastered(w.word) && ctx.matchDifficulty(w));
    if (!act.length) { ctx.toast('该分类在当前难度下暂无待练单词 🎉'); return; }
    openCategory(view, ctx, `象形记 · ${cat}`, act, () => renderPictGrid(view, ctx, APP, tax, cat, 0));
  };
  view.scrollTop = 0;
}

function openHSUnits(view, ctx, APP) {  const groups = hsUnitGroups(APP);
  const backToGrid = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'category' }));
  view.innerHTML = `
    <div class="section-title">${IC.book}高中分单元记忆</div>
    <div class="card">
      <div class="between"><h2>按册 · 单元练习</h2><button class="btn sm ghost" id="back">返回分类</button></div>
      <p class="hint" style="margin-top:4px">点选某册下的单元，进入单词闪记与练习（已掌握的单词自动隐藏，遵循当前全局难度设置）。</p>
    </div>
    ${groups.map((bk) => `
      <div class="hs-book">
        <div class="hs-book-title">${IC.bookOpenSm}${escapeHtml(bk.units[0] ? bk.units[0].unit.replace(/U\d+$/, '').replace(/\s*Welcome\s*Unit$/i, '') : '') || '其他'}</div>
        <div class="cat-grid">
          ${bk.units.map((u) => {
            const all = u.words;
            const active = all.filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
            const masteredCount = all.length - active.length;
            const badge = active.length ? `${active.length} 词待练` : '当前难度无待练';
            return `
            <div class="cat-card" data-unit="${escapeHtml(u.unit)}">
              <div class="c-name">${escapeHtml(u.unit)}</div>
              <div class="c-count">${all.length} 词${masteredCount ? ` · 已掌握 ${masteredCount}` : ''}</div>
              <span class="badge">${badge}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('')}
  `;
  view.querySelector('#back').onclick = backToGrid;
  view.querySelectorAll('.cat-card[data-unit]').forEach((card) => {
    card.addEventListener('click', () => {
      const unit = card.dataset.unit;
      const all = (APP.library.words || []).filter((w) => w.pep && w.pep.band === '高中' && w.pep.unit === unit);
      const active = all.filter((w) => !isMastered(w.word) && ctx.matchDifficulty(w));
      if (!active.length) { ctx.toast('该单元在当前难度下暂无待练单词 🎉'); return; }
      openCategory(view, ctx, unit, active, () => openHSUnits(view, ctx, APP));
    });
  });
}

function openCategory(view, ctx, title, words, onBack) {
  let mode = 'flash'; // flash | quiz
  let idx = 0;

  function modeBar() {
    return `
      <div class="reading-mode-bar">
        <button class="mode-btn ${mode === 'flash' ? 'on' : ''}" data-mode="flash">${IC.zapSm}单词闪记</button>
        <button class="mode-btn ${mode === 'quiz' ? 'on' : ''}" data-mode="quiz">${IC.pencilSm}开始练习</button>
      </div>`;
  }
  function bindModeBar() {
    view.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const m = b.dataset.mode;
        if (m === 'quiz') { runStudy(view, ctx, words, title); return; }
        mode = m; render();
      });
    });
  }

  function render() {
    if (mode === 'flash') return renderFlash();
    // quiz 交由 runStudy 接管视图
    runStudy(view, ctx, words, title);
  }

  function renderFlash() {
    const w = words[idx];
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>${escapeHtml(title)} · 单词闪记</h2><button class="btn sm ghost" id="back">返回</button></div>
        <div class="pill" style="margin-top:8px">${idx + 1} / ${words.length}</div>
        ${modeBar()}
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
      <button class="btn block mt" id="toQuiz">${IC.checkSm}开始练习</button>
    `;
    const wrap = view.querySelector('#flashCard');
    wrap.innerHTML = wordCardHTML(w, { showNote: true });
    bindWordCardEvents(wrap, ctx);
    // 自动播放英式发音
    ctx.playUK(w.word);
    bindModeBar();
    const goPrev = () => { idx = (idx - 1 + words.length) % words.length; renderFlash(); };
    const goNext = () => { idx = (idx + 1) % words.length; renderFlash(); };
    view.querySelector('#prev').onclick = goPrev;
    view.querySelector('#next').onclick = goNext;
    const ap = view.querySelector('#arrowPrev'); if (ap) ap.onclick = goPrev;
    const an = view.querySelector('#arrowNext'); if (an) an.onclick = goNext;
    view.querySelector('#toQuiz').onclick = () => runStudy(view, ctx, words, title);
    view.querySelector('#back').onclick = onBack || (() => window.dispatchEvent(new CustomEvent('goto', { detail: 'category' })));
    // 切换卡片后回到顶部（而非停留在当前滚动位置）
    view.scrollTop = 0;
  }

  render();
}
