import overview from './modules/overview.js';
import category from './modules/category.js';
import reading from './modules/reading.js';
import notebook from './modules/notebook.js';
import wrongbook from './modules/wrongbook.js';
import importer from './modules/import.js';
import stats from './modules/stats.js';
import dictation from './modules/dictation.js';
import listening from './modules/listening.js';
import { runStudy } from './study.js';
import { lemmatizePlural, wordCardNotFoundHTML, IC, ICW } from './ui.js';
import { ALGOS, currentAlgo, onTaskOk, onRoundDone, onWrongAnswer, queueFor, assignQuota, schedInfo, dailyRemain, describeDue, EB_STEPS } from './scheduler.js';

const Phonics = window.PhonicsCore;
const APP = {
  library: { words: [], readings: [], updatedAt: 0 },
  progress: null,
  settings: null,
  page: 'overview',
  modules: { overview, category, reading, notebook, wrongbook, import: importer, stats, dictation, listening },
  phraseSupplement: {}, // 阅读选词补充识别库（短语/合成词，持久化于 localStorage）
  clientId: 'default',
  user: null, // 已登录用户 {id}；null 表示匿名（进度归入 default 桶）
  listening: { papers: {}, index: [] }, // 听力题库：运行时由 listening.js 通过 /api/listening 加载
};

/* ---------- 持久化 ---------- */
const SAVE_KEY = 'happy-vocab-progress-v1';
function currentSaveKey() {
  const cid = String(APP && APP.clientId ? APP.clientId : 'default');
  if (cid.startsWith('local:')) return SAVE_KEY + '-' + cid.slice(6);
  return SAVE_KEY;
}

function defaultProgress() {
  return {
    stars: 0,
    rounds: {},      // word -> 完成轮数（答对次数）
    mastered: {},    // word -> true
    wrong: {},       // word -> 连续正确计数（历史字段）
    wrongCount: {},  // word -> 累计答错次数（高频错词统计）
    notebook: [],    // 生词本：仅「主动收藏」的单词（全部可点叉移除）
    notebookPassive: [], // 【已废弃】旧版被动收录；启动时迁移进 wrongBook 后清空
    wrongQuestions: [], // 错题历史（题型/题干/选项/用户答案/正确答案），界面不再展示
    wrongBook: [],   // 错词本：做错的单词（不可手动删除，连续 3 轮全对后自动移出）
    wrongRound: {},  // 错词本进度：word -> { t:{zh2en,en2zh,cloze}, n } 三项门控 + 连续全对轮数
    taskEx: {},      // 三项门控：word -> { zh2en, en2zh, cloze }，三项全对才判定掌握
    daily: { date: todayStr(), newWords: 0, rounds: 0, correct: 0, wrong: 0, stars: 0 },
    history: {},     // 'YYYY-M-D' -> { newWords, rounds, correct, wrong, stars }
    learned: {},     // word -> true 已学过
    exposure: {},    // word -> 完整学习轮次（分类记/阅读记）
    streak: {},      // word -> 连续正确次数
    readEx: {},      // word -> 阅读记三项练习完成状态 {zh2en, en2zh, cloze}
    listening: {     // 听力训练进度
      history: {},   // paperId -> [{date, mode, score, total, wrong:[n]}]
      wrong: {},     // paperId -> [n, n, ...] 累计做错的题号
      best: {},      // paperId -> 最高分
    },
    dictatedLog: { date: todayStr(), words: [] }, // 快筛听写：当天已听写单词（小写），每天自动重置，防止同词当天反复刷
  };
}
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// 安全解析 localStorage 进度：任何损坏/非法 JSON 都返回 null，绝不抛错
function safeParseProgress() {
  try {
    const raw = localStorage.getItem(currentSaveKey());
    if (!raw) return null;
    const v = JSON.parse(raw);
    return (v && typeof v === 'object') ? v : null;
  } catch (e) { return null; }
}

// 进度结构归一化：保证 APP.progress 及所有子字段都存在且类型正确。
// 关键修复：旧版本写入的 localStorage 可能把某些字段存成 null（如 mastered / listening），
// 简单的「缺失才补」无法覆盖这种情况，必须显式把 null 修复为对应默认值，否则读取即抛错。
function normalizeProgress(p) {
  if (!p || typeof p !== 'object') p = {};
  const def = defaultProgress();
  for (const k of Object.keys(def)) {
    const dv = def[k];
    const pv = p[k];
    if (pv === null || pv === undefined) { p[k] = dv; continue; }
    // 类型不一致（旧数据错存）则回退默认值
    if (typeof pv !== typeof dv) {
      // 数组/对象类允许宽松：只要同为对象容器即保留，否则重置
      const pvObj = Array.isArray(pv) || (typeof pv === 'object');
      const dvObj = Array.isArray(dv) || (typeof dv === 'object');
      p[k] = (pvObj && dvObj) ? pv : dv;
    }
  }
  // listening 子结构兜底（history/wrong/best/shadow 均为对象）
  if (!p.listening || typeof p.listening !== 'object') p.listening = { history: {}, wrong: {}, best: {}, shadow: {} };
  for (const k of ['history', 'wrong', 'best', 'shadow']) {
    if (!p.listening[k] || typeof p.listening[k] !== 'object') p.listening[k] = {};
  }
  return p;
}

async function loadAll() {
  _libFailed = false;
  try {
    const r = await fetchJSON('/api/library', 25000);
    APP.library = r || { words: [], readings: [], updatedAt: 0 };
  } catch (e) {
    console.warn('[loadAll] 词库加载失败（超时或网络不可达）:', e && e.message);
    APP.library = { words: [], readings: [], updatedAt: 0 };
    _libFailed = !APP.library.words.length;
  }
  // 用户进度：优先后端，其次本地
  try {
    const r = await fetchJSON('/api/progress?clientId=' + APP.clientId, 10000);
    const j = await r.json();
    APP.progress = (j && j.data) || safeParseProgress() || defaultProgress();
  } catch (e) {
    APP.progress = safeParseProgress() || defaultProgress();
  }
  if (!APP.progress || typeof APP.progress !== 'object') APP.progress = defaultProgress();
  // 归一化：补齐/修复所有缺失或 null 的子字段，杜绝后续读取抛错
  APP.progress = normalizeProgress(APP.progress);
  APP.settings = loadSettings();
  ensureDaily();
  buildFormIndex();
  // 阅读选词补充识别库（短语/合成词）：从 localStorage 载入
  try {
    APP.phraseSupplement = JSON.parse(localStorage.getItem('happy-vocab-phrase-supplement') || '{}') || {};
  } catch (e) { APP.phraseSupplement = {}; }
  // 兼容旧进度：补齐新增子字段
  if (!APP.progress.exposure) APP.progress.exposure = {};
  if (!APP.progress.streak) APP.progress.streak = {};
  if (!APP.progress.notebookPassive) APP.progress.notebookPassive = [];
  if (!APP.progress.wrongQuestions) APP.progress.wrongQuestions = [];
  if (!APP.progress.wrongBook) APP.progress.wrongBook = [];
  if (!APP.progress.wrongRound) APP.progress.wrongRound = {};
  if (!APP.progress.taskEx) APP.progress.taskEx = {};
  if (!APP.progress.readEx) APP.progress.readEx = {};
  if (!APP.progress.listening) APP.progress.listening = { history: {}, wrong: {}, best: {} };
  if (!APP.progress.listening.history) APP.progress.listening.history = {};
  if (!APP.progress.listening.wrong) APP.progress.listening.wrong = {};
  if (!APP.progress.listening.best) APP.progress.listening.best = {};
  buildEffectiveDifficulty();
  migrateLegacyProgress();
}

// 旧版兼容：曾把「做错的词」被动塞进生词本（notebookPassive），现统一迁入错词本；
// 旧版错题历史（wrongQuestions）里的词也补进错词本，避免数据丢失。
function migrateLegacyProgress() {
  const p = APP.progress;
  if (!p) return;
  let changed = false;
  const pushWrong = (w) => {
    if (!w) return;
    const lw = String(w).toLowerCase();
    if (!(p.wrongBook || []).some((x) => String(x).toLowerCase() === lw)) { p.wrongBook.push(w); changed = true; }
  };
  for (const w of (p.notebookPassive || [])) {
    pushWrong(w);
    const i = (p.notebook || []).indexOf(w);
    if (i >= 0) { p.notebook.splice(i, 1); changed = true; }
  }
  for (const q of (p.wrongQuestions || [])) if (q && q.word) pushWrong(q.word);
  // 旧版阅读记三项门控（readEx）并入统一门控表
  for (const k of Object.keys(p.readEx || {})) {
    const t = p.readEx[k];
    if (!t || typeof t !== 'object') continue;
    if (!p.taskEx[k]) { p.taskEx[k] = {}; changed = true; }
    for (const key of Object.keys(t)) if (t[key] && !p.taskEx[k][key]) { p.taskEx[k][key] = true; changed = true; }
  }
  p.notebookPassive = [];
  if (changed) saveProgress();
}

function ensureDaily() {
  if (!APP.progress.history) APP.progress.history = {};
  const d = APP.progress.daily;
  const today = todayStr();
  if (!d || d.date !== today) {
    // 日切换：把昨天的数据归档进 history
    if (d && d.date && (d.newWords || d.rounds || d.correct || d.wrong || d.stars)) {
      APP.progress.history[d.date] = {
        newWords: d.newWords || 0, rounds: d.rounds || 0,
        correct: d.correct || 0, wrong: d.wrong || 0, stars: d.stars || 0,
      };
    }
    APP.progress.daily = { date: today, newWords: 0, rounds: 0, correct: 0, wrong: 0, stars: 0 };
  } else {
    // 兼容旧进度：补齐子字段
    d.newWords = d.newWords || 0; d.rounds = d.rounds || 0;
    d.correct = d.correct || 0; d.wrong = d.wrong || 0; d.stars = d.stars || 0;
  }
}

async function saveProgress() {
  localStorage.setItem(currentSaveKey(), JSON.stringify(APP.progress));
  try {
    await fetch('/api/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: APP.clientId, data: APP.progress }),
    });
  } catch (e) { /* offline ok */ }
}

/* ---------- 全局设置（难度） ---------- */
// 难度等级：1=小学 2=初中 3=高中 4=四级 5=六级 6=考研 7=GRE
const DIFF_LABELS = { 1: '小学', 2: '初中', 3: '高中', 4: '四级', 5: '六级', 6: '考研', 7: 'GRE' };
const SETTINGS_KEY = 'happy-vocab-settings-v1';
function defaultSettings() { return { difficulty: 'all', diffMode: 'le', dailyNew: 500, dailyTotal: 500, reviewAlgo: 'wrong3' }; }
function loadSettings() {
  try { return Object.assign(defaultSettings(), JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch (e) { return defaultSettings(); }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(APP.settings)); } catch (e) { /* ignore */ }
}
// 全局难度过滤（参考「按难度学习」模块：
//   difficulty === 'all' 不过滤；diffMode 'le' = 本级及以下(<=)，'eq' = 仅本级(===)）。
// 阅读记的 expansion/extra 条目往往没有 difficulty 字段，需要回查主词库。
function matchDifficulty(wordObj) {
  const s = APP.settings || {};
  const lv = s.difficulty;
  if (!lv || lv === 'all') return true;
  const numLv = Number(lv);
  const numDiff = difficultyOf(wordObj);
  if (numDiff === null || numDiff === undefined) return false; // 无等级标签的单词在选定具体难度时不显示
  return s.diffMode === 'eq' ? (numDiff === numLv) : (numDiff <= numLv);
}

// 返回当前选中的难度等级数字（1-7）；未选 / 选「全部」时返回 null。
// 阅读记高亮用：高亮「当前等级」与「当前等级低一级」两个等级的单词。
function difficultyLevel() {
  const s = APP.settings || {};
  const lv = s.difficulty;
  if (!lv || lv === 'all') return null;
  const n = Number(lv);
  return (n >= 1 && n <= 7) ? n : null;
}

/* ---------- 词形反向索引（屈折形式 → 原形） ---------- */
// 由词库 inflect 字段构建：点击 went / made 等可弹出 go / make 的原形卡片。
function buildFormIndex() {
  APP.formIndex = {};
  const ws = (APP.library && APP.library.words) || [];
  for (const w of ws) {
    const inf = w.inflect;
    if (!inf) continue;
    for (const k of ['past', 'pp', 'ing', 'plural']) {
      const f = inf[k];
      if (!f) continue;
      for (const form of String(f).split('/')) {
        const fl = form.trim().toLowerCase();
        if (fl && !APP.formIndex[fl]) APP.formIndex[fl] = { base: w.word, type: k };
      }
    }
  }
}

/* ---------- 有效难度：GRE 等级去重 ---------- */
// 词库里 difficulty=7（GRE）混入了大量与其它低等级「重复」的简单词：
// 如 parents/parent、washing/wash、excited/excite、does/do、t-shirt = t+shirt、pencil-box 等。
// 规则：GRE 词若能通过「精确 / 屈折反查 / 形态还原 / 复合词拆分」命中低等级(1-6)已存在的词，
// 则按那个更低的等级计，不再出现在 GRE 等级里（在全量模式下照常出现）。
const GRE_LEVEL = 7;

// 生成词形还原候选：只保留「屈折变化」（复数 / 过去式 / 分词）这类高精度规则。
// 刻意不做 -ly / -er / -est 的派生还原：那会把 muster→must、dogged→dog、kindred→kind
// 这类「长得像但并非同一词」的 GRE 词误判成低等级词。不规则形式由词库 inflect 字段反查覆盖。
function baseCandidates(w) {
  const out = [w];
  // 下限取 2：does→do、goes→go 等两字母基础词也要能还原
  const add = (x) => { if (x && x.length >= 2 && out.indexOf(x) < 0) out.push(x); };
  if (/ies$/.test(w)) { add(w.slice(0, -3) + 'y'); add(w.slice(0, -3) + 'ie'); }   // parties→party
  if (/(ches|shes|sses|xes|zes|oes)$/.test(w)) add(w.slice(0, -2));                 // boxes→box / does→do
  else if (/ves$/.test(w)) { add(w.slice(0, -3) + 'f'); add(w.slice(0, -3) + 'fe'); add(w.slice(0, -1)); } // wives→wife
  else if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1));                     // parents→parent
  if (/ied$/.test(w)) add(w.slice(0, -3) + 'y');                                    // carried→carry
  if (/ed$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); add(w.slice(0, -3)); } // washed→wash / stopped→stop
  if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); add(w.slice(0, -4)); } // washing→wash / running→run
  return out;
}

let _effDiff = null;
function buildEffectiveDifficulty() {
  const ws = (APP.library && APP.library.words) || [];
  const lower = new Map();  // 低等级词(小写) -> 最低难度
  const forms = new Map();  // 屈折形式(小写) -> 原形(小写)
  for (const w of ws) {
    if (!w.word) continue;
    const lw = w.word.toLowerCase();
    const d = w.difficulty;
    if (d >= 1 && d <= 6) { if (!lower.has(lw) || d < lower.get(lw)) lower.set(lw, d); }
    const inf = w.inflect;
    if (inf) {
      for (const k of ['past', 'pp', 'ing', 'plural']) {
        const v = inf[k];
        if (!v) continue;
        for (const s of String(v).split('/')) {
          const t = s.trim().toLowerCase();
          if (t && !forms.has(t)) forms.set(t, lw);
        }
      }
    }
  }
  // 把 GRE 词映射到「更低等级」；命中不了则保持 7
  const resolveLower = (lw) => {
    if (lower.has(lw)) return lower.get(lw);
    const b = forms.get(lw);
    if (b && lower.has(b)) return lower.get(b);
    for (const c of baseCandidates(lw)) {
      if (lower.has(c)) return lower.get(c);
      const fb = forms.get(c);
      if (fb && lower.has(fb)) return lower.get(fb);
    }
    if (/[- ]/.test(lw)) {                       // 复合词：t-shirt / pencil-box / ice cream
      const parts = lw.split(/[- ]+/).filter(Boolean);
      // 单字母部件（t-shirt 的 t）忽略，只要剩余部件全部命中低等级即可
      const main = parts.filter((p) => p.length >= 2);
      if (parts.length >= 2 && main.length >= 1) {
        let mx = 0, ok = true;
        for (const p of main) { const d = lower.get(p); if (d == null) { ok = false; break; } if (d > mx) mx = d; }
        if (ok) return mx;
      }
    }
    return null;
  };
  const eff = Object.create(null);
  for (const w of ws) {
    if (!w.word) continue;
    const lw = w.word.toLowerCase();
    let d = (w.difficulty == null) ? null : Number(w.difficulty);
    if (d === GRE_LEVEL) { const lo = resolveLower(lw); if (lo != null) d = lo; }
    eff[lw] = d;
  }
  _effDiff = eff;
  return eff;
}

// 取单词的有效难度（GRE 去重后）；不在词库中返回 null
function effectiveDifficulty(word) {
  if (!_effDiff) buildEffectiveDifficulty();
  const v = _effDiff[String(word || '').toLowerCase()];
  return (v === undefined || v === null) ? null : v;
}

// 取任意单词对象的有效难度：优先用「有效难度表」，未命中再回查主词库
function difficultyOf(wordObj) {
  const w = (wordObj && wordObj.word) ? wordObj.word : String(wordObj || '');
  const key = String(w).toLowerCase();
  if (!key) return null;
  let d = (wordObj && wordObj.difficulty !== undefined && wordObj.difficulty !== null) ? Number(wordObj.difficulty) : null;
  if (d == null) {
    const libW = (APP.library.words || []).find((x) => x.word && x.word.toLowerCase() === key);
    d = (libW && libW.difficulty != null) ? Number(libW.difficulty) : null;
  }
  const e = effectiveDifficulty(key);
  return e != null ? e : d;
}

function resolveWord(key) {
  const lower = (key || '').toLowerCase();
  if (!lower) return null;
  const w = (APP.library.words || []).find((x) => x.word && x.word.toLowerCase() === lower);
  if (w) return w;
  const fi = APP.formIndex && APP.formIndex[lower];
  if (fi) {
    const bw = (APP.library.words || []).find((x) => x.word && x.word.toLowerCase() === fi.base.toLowerCase());
    if (bw) return Object.assign({}, bw, { _form: { base: bw.word, type: fi.type, form: lower } });
  }
  // 规则复数还原（修复部分名词复数点不开原型卡片）
  for (const sg of lemmatizePlural(lower)) {
    if (sg && sg !== lower) {
      const base = (APP.library.words || []).find((x) => x.word && x.word.toLowerCase() === sg);
      if (base) return Object.assign({}, base, { _form: { base: base.word, type: 'plural', form: lower, guessed: true } });
    }
  }
  return null;
}

// 统一单词卡片弹窗（支持屈折/复数还原；未找到时引导跳转有道）
function showWordCard(word) {
  const w = resolveWord(word);
  const m = openModal('<h3>' + IC.book + '单词卡片</h3><div id="wc"></div>', { center: true });
  const wc = m.querySelector('#wc');
  if (!w) {
    wc.innerHTML = wordCardNotFoundHTML(word);
    return;
  }
  wc.innerHTML = wordCardHTML(w, { showNote: true });
  bindWordCardEvents(wc, currentCtx || {});
}

function openSettings() {
  const s = APP.settings || defaultSettings();
  const cur = s.difficulty || 'all';
  const mode = s.diffMode || 'le';
  const levels = [['all', '全部（不限难度）']].concat([1, 2, 3, 4, 5, 6, 7].map((lv) => [lv, DIFF_LABELS[lv]]));
  const opts = levels.map(([lv, label]) => {
    const checked = String(cur) === String(lv) ? 'checked' : '';
    return `<label class="diff-opt"><input type="radio" name="diff" value="${lv}" ${checked}> ${label}</label>`;
  }).join('');
  const ra = s.reviewAlgo || 'wrong3';
  const algoCards = Object.keys(ALGOS).map((k) => {
    const v = ALGOS[k];
    return `<label class="algo-opt ${k === ra ? 'on' : ''}" data-algo="${k}">
      <input type="radio" name="ralgo" value="${k}" ${k === ra ? 'checked' : ''}>
      <div class="algo-body"><div class="algo-name">${v.name}</div><div class="algo-desc">${v.desc}</div></div>
    </label>`;
  }).join('');
  const m = openModal(`
    <h3>${IC.settings}系统设置</h3>

    <div class="set-group">
      <div class="set-title">① 难度设置（全局）</div>
      <p class="hint">选择难度等级后，分类记与阅读记只练习该范围内的单词；选「全部」则不限难度。</p>
      <div class="seg">
        <button class="seg-btn ${mode === 'le' ? 'on' : ''}" id="dmLe" type="button">本级及以下</button>
        <button class="seg-btn ${mode === 'eq' ? 'on' : ''}" id="dmEq" type="button">仅本级</button>
      </div>
      <div class="diff-opts">${opts}</div>
    </div>

    <div class="set-group">
      <div class="set-title">② 每日新词上限数量</div>
      <div class="num-row">
        <input type="number" id="setDailyNew" class="num-input" min="10" max="9999" step="10" value="${Number(s.dailyNew) || 500}">
        <span class="num-unit">词 / 天</span>
      </div>
      <div class="num-presets">
        ${[50, 100, 200, 300, 500].map((n) => `<button class="chip" data-n="${n}" type="button">${n}</button>`).join('')}
      </div>
      <p class="hint">每天学习新单词的数量目标，概览与顶部的「今日任务」进度按此计算。</p>
    </div>

    <div class="set-group">
      <div class="set-title">③ 每日学习总量</div>
      <div class="num-row">
        <input type="number" id="setDailyTotal" class="num-input" min="10" max="9999" step="10" value="${Number(s.dailyTotal) || 500}">
        <span class="num-unit">词 / 天</span>
      </div>
      <p class="hint">生词本与错词本每天推荐复习的「不重复」单词总量上限；同一单词当天的多轮复习不重复计量。</p>
    </div>

    <div class="set-group">
      <div class="set-title">④ 复习算法（生词本 / 错词本）</div>
      <div class="algo-opts">${algoCards}</div>
      <p class="hint">切换算法后，各单词将按新算法重新安排复习计划；已掌握的单词不受影响。</p>
    </div>

    <div class="row mt">
      <button class="btn block" id="saveSettings" type="button">保存</button>
      <button class="btn gray block" id="closeSettings" type="button">取消</button>
    </div>
  `, { center: true });
  let selMode = mode;
  m.querySelector('#dmLe').onclick = () => { selMode = 'le'; m.querySelector('#dmLe').classList.add('on'); m.querySelector('#dmEq').classList.remove('on'); };
  m.querySelector('#dmEq').onclick = () => { selMode = 'eq'; m.querySelector('#dmEq').classList.add('on'); m.querySelector('#dmLe').classList.remove('on'); };
  // 复习算法卡片选中态
  m.querySelectorAll('.algo-opt').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') { const inp = card.querySelector('input'); if (inp) inp.checked = true; }
      m.querySelectorAll('.algo-opt').forEach((c) => c.classList.toggle('on', c.querySelector('input').checked));
    });
  });
  // 新词上限预设
  m.querySelectorAll('.num-presets .chip').forEach((b) => {
    b.addEventListener('click', () => { m.querySelector('#setDailyNew').value = b.dataset.n; });
  });
  m.querySelector('#saveSettings').onclick = () => {
    const sel = m.querySelector('input[name="diff"]:checked');
    const rsel = m.querySelector('input[name="ralgo"]:checked');
    const clampNum = (v, def) => { const n = Math.round(Number(v)); return (n >= 10 && n <= 9999) ? n : def; };
    const algoChanged = rsel && rsel.value !== (APP.settings.reviewAlgo || 'wrong3');
    APP.settings.difficulty = sel ? sel.value : 'all';
    APP.settings.diffMode = selMode;
    APP.settings.dailyNew = clampNum(m.querySelector('#setDailyNew').value, 500);
    APP.settings.dailyTotal = clampNum(m.querySelector('#setDailyTotal').value, 500);
    APP.settings.reviewAlgo = rsel ? rsel.value : 'wrong3';
    saveSettings();
    closeModal();
    const diffTxt = APP.settings.difficulty === 'all' ? '全部' : (DIFF_LABELS[APP.settings.difficulty] + (selMode === 'le' ? '及以下' : ''));
    toast('已保存设置：难度 ' + diffTxt + ' · 新词 ' + APP.settings.dailyNew + ' · 总量 ' + APP.settings.dailyTotal + (algoChanged ? ' · 算法已切换为' + ALGOS[APP.settings.reviewAlgo].name : ''));
    refreshHeader();
    goto(APP.page);
  };
  m.querySelector('#closeSettings').onclick = () => closeModal();
}

/* ---------- 学习规则 ---------- */
function findWord(w) { return APP.library.words.find((x) => x.word.toLowerCase() === w.toLowerCase()); }

function isMastered(word) {
  return !!(APP.progress && APP.progress.mastered && APP.progress.mastered[word.toLowerCase()]);
}

function markMastered(word, silent = false) {
  const lw = word.toLowerCase();
  if (APP.progress.mastered[lw]) return;
  APP.progress.mastered[lw] = true;
  APP.progress.stars += 10;
  // 已掌握 → 同步移出错词本与生词本（与「判定已掌握的单词不再出现」一致）
  removeFromWrongBook(word);
  if (APP.progress.notebook) {
    APP.progress.notebook = APP.progress.notebook.filter((x) => String(x).toLowerCase() !== lw);
  }
  if (!silent) toast('🎉 已掌握 ' + word + '！+10星');
  saveProgress();
  refreshHeader();
}

// 完成一轮学习：+1星；累计5轮标记掌握 +10星
function completeRound(word) {
  const p = APP.progress;
  ensureDaily();
  const isNew = !p.learned[word];
  p.rounds[word] = (p.rounds[word] || 0) + 1;
  if (isNew) {
    p.learned[word] = true;
    // 每日新词上限：达到上限后不再累加计数（学习不阻断，仅任务进度封顶）
    const cap = Number(APP.settings && APP.settings.dailyNew) || 500;
    if ((p.daily.newWords || 0) < cap) p.daily.newWords++;
  }
  p.daily.rounds = (p.daily.rounds || 0) + 1;
  p.stars += 1;
  if (p.rounds[word] >= 5 && !p.mastered[word]) {
    markMastered(word, true);
    toast('🎉 已掌握 ' + word + '！+10星');
  }
  saveProgress();
  refreshHeader();
}

// 答错 → 加入错词本（掌握判定统一由三项门控 recordTask 负责）
function recordWrongAnswer(word, correct) {
  const p = APP.progress;
  ensureDaily();
  if (correct) {
    p.daily.correct = (p.daily.correct || 0) + 1;
    p.streak[word] = (p.streak[word] || 0) + 1;
    // 注意：掌握判定统一交给「三项门控」recordTask，这里不再因为连对而直接标记掌握
    if (p.wrong[word]) {
      p.wrong[word] += 1;
      if (p.wrong[word] >= 3) { delete p.wrong[word]; }
    }
  } else {
    p.daily.wrong = (p.daily.wrong || 0) + 1;
    p.wrongCount[word] = (p.wrongCount[word] || 0) + 1;
    p.wrong[word] = 0;
    p.streak[word] = 0;
    // 做错 → 进「错词本」；生词本只收主动收藏的词
    addToWrongBook(word);
  }
  saveProgress();
  refreshHeader();
}

/* ---------- 错词本 ---------- */
// 做错的词进入错词本（不可手动删除，只能靠连续 3 轮全对毕业）
function addToWrongBook(word) {
  const p = APP.progress;
  if (!word) return;
  if (!p.wrongBook) p.wrongBook = [];
  if (!p.wrongRound) p.wrongRound = {};
  const lw = String(word).toLowerCase();
  if (!p.wrongBook.some((x) => String(x).toLowerCase() === lw)) p.wrongBook.push(word);
  p.wrongRound[lw] = { t: {}, n: 0 }; // 一错即清空连续全对轮数
}
function removeFromWrongBook(word) {
  const p = APP.progress;
  if (!word) return;
  const lw = String(word).toLowerCase();
  p.wrongBook = (p.wrongBook || []).filter((x) => String(x).toLowerCase() !== lw);
  if (p.wrongRound) delete p.wrongRound[lw];
}
function inWrongBook(word) {
  const p = APP.progress;
  const lw = String(word || '').toLowerCase();
  return (p.wrongBook || []).some((x) => String(x).toLowerCase() === lw);
}

/* ---------- 三项门控（分类记 / 阅读记 / 错词本 通用） ---------- */
// 中译英(zh2en) + 英译中(en2zh) + 完形填空(cloze) 三项全部答对 → 判定掌握；做错则该项重做。
// 错词本：三项算一轮，连续 3 轮全对后自动移出错词本（中途答错则清零重来）。
const TASK_KEYS = ['zh2en', 'en2zh', 'cloze'];
const WRONG_BOOK_GRADUATE = 3;
function tasksAllDone(t) { return TASK_KEYS.every((k) => t && t[k]); }

function recordTask(word, task, correct, source) {
  const p = APP.progress;
  ensureDaily();
  if (!p.taskEx) p.taskEx = {};
  if (!p.wrongRound) p.wrongRound = {};
  if (!p.nbRound) p.nbRound = {};
  const lw = String(word || '').toLowerCase();
  if (!lw) return;
  if (!p.taskEx[lw]) p.taskEx[lw] = {};
  // source：练习入口。'notebook'/'wrongbook' = 生词本/错词本专项练习（掌握判定走复习算法）
  // undefined = 分类记/阅读记等常规练习（保持原三项门控：三项全对即掌握）
  const isReviewSource = source === 'notebook' || source === 'wrongbook';
  const algo = isReviewSource ? currentAlgo() : null;
  if (correct) {
    p.taskEx[lw][task] = true;
    p.stars += 1;
    p.daily.rounds = (p.daily.rounds || 0) + 1;
    if (algo === 'wrong3') {
      // 3 次错误移除：三项凑齐算一轮，连续 3 轮全对 → 掌握（错词本用 wrongRound，生词本用 nbRound）
      const st = source === 'wrongbook'
        ? (p.wrongRound[lw] || (p.wrongRound[lw] = { t: {}, n: 0 }))
        : (p.nbRound[lw] || (p.nbRound[lw] = { t: {}, n: 0 }));
      st.t[task] = true;
      if (tasksAllDone(st.t)) {
        st.t = {};
        st.n = (st.n || 0) + 1;
        if (st.n >= WRONG_BOOK_GRADUATE && !p.mastered[lw]) {
          markMastered(word, true);
          toast('🎉 ' + word + ' 连续 3 轮全对，已掌握！+10星');
        }
      }
    } else if (algo) {
      // 艾宾浩斯 / FSRS：轮内三项凑齐 → 交给调度器推进轮次/重排复习计划
      const roundDone = onTaskOk(word, task);
      if (roundDone) {
        const res = onRoundDone(word);
        if (res && res.mastered && !p.mastered[lw]) {
          markMastered(word, true);
          toast(algo === 'ebbinghaus'
            ? '🎉 ' + word + ' 完成 6 轮艾宾浩斯复习，已掌握！+10星'
            : '🎉 ' + word + ' 记忆强度达 ' + (res.itv || FSRS_GRADUATE_DAYS) + ' 天，已掌握！+10星');
        } else if (res && !res.mastered && algo === 'ebbinghaus' && res.stage != null) {
          const step = EB_STEP_LABELS[Math.min(Math.max(res.stage, 1), EB_STEP_LABELS.length) - 1];
          if (res.stage > 0) toast('📖 ' + word + ' 第 ' + res.stage + '/6 轮完成，下轮 ' + step + '后');
        }
      }
    } else {
      // 常规练习：三项全对即掌握（原逻辑）
      if (tasksAllDone(p.taskEx[lw]) && !p.mastered[lw]) {
        markMastered(word, true);
        toast('🎉 ' + word + ' 三项练习全过关，已掌握！+10星');
      }
      // 该词在错词本：继续按 wrongRound 跟踪连续全对轮数（兼容旧路径）
      if (inWrongBook(word)) {
        const wr = p.wrongRound[lw] || (p.wrongRound[lw] = { t: {}, n: 0 });
        wr.t[task] = true;
        if (tasksAllDone(wr.t)) {         // 三项凑齐 = 完成一轮
          wr.t = {};
          wr.n = (wr.n || 0) + 1;
          if (wr.n >= WRONG_BOOK_GRADUATE) {
            removeFromWrongBook(word);
            toast('✅ ' + word + ' 连续 3 轮全对，已移出错词本');
          }
        }
      }
    }
  } else {
    p.taskEx[lw][task] = false;         // 该项需重做
    p.daily.wrong = (p.daily.wrong || 0) + 1;
    p.wrongCount[word] = (p.wrongCount[word] || 0) + 1;
    addToWrongBook(word);
    // 艾宾浩斯 / FSRS：答错使本轮作废（重练本轮 / 重置记忆表现）
    if (algo && algo !== 'wrong3') onWrongAnswer(word);
  }
  saveProgress();
  refreshHeader();
}

// 记录一道做错的「题」：含题型、题干、选项、用户答案、正确答案（历史追溯用，界面不展示）。
// rec: { word, type('en2zh'|'zh2en'|'cloze'), typeLabel, prompt, choices?, answer, user }
function recordWrongQuestion(rec) {
  const p = APP.progress;
  if (!p.wrongQuestions) p.wrongQuestions = [];
  const key = ((rec.word || '').toLowerCase()) + '|' + (rec.type || '');
  const i = p.wrongQuestions.findIndex((r) => ((r.word || '').toLowerCase() + '|' + (r.type || '')) === key);
  if (i >= 0) p.wrongQuestions.splice(i, 1); // 同一词+题型只保留最新一次
  p.wrongQuestions.push(Object.assign({ ts: Date.now(), id: key }, rec));
  if (p.wrongQuestions.length > 500) p.wrongQuestions = p.wrongQuestions.slice(-500);
  saveProgress();
}

// 完成一次完整练习（快筛听写）：未做错的单词标记掌握；所有单词曝光+1
function completeSession(words, wrongWords) {
  const p = APP.progress;
  const wrongSet = wrongWords || new Set();
  for (const w of words) {
    const word = (w && w.word) ? w.word : String(w);
    const lw = word.toLowerCase();
    p.exposure[lw] = (p.exposure[lw] || 0) + 1;
    if (p.exposure[lw] >= 5 && !p.mastered[lw]) {
      markMastered(word, true);
      toast('🎉 ' + word + ' 已学满 5 轮，已掌握！+10星');
    }
    if (!wrongSet.has(word) && !p.mastered[lw]) {
      markMastered(word, true);
      // 一次性全对不单独弹 toast，避免刷屏；可由完成页统一提示
    }
  }
  saveProgress();
  refreshHeader();
}

// 阅读记三项练习门控掌握：英译中(en2zh) + 中译英(zh2en) + 完形填空(cloze)
// 三项全部答对才算「掌握」，做错则该项需重做。闪记仅为曝光，不计入。
// 阅读记沿用同一套门控（内部统一走 recordTask，进度表为 taskEx）
function recordReadTask(word, task, correct) { recordTask(word, task, correct); }

// 完成一次阅读记训练模式：仅记录曝光轮次，掌握判定交由 recordReadTask 三项门控
function completeReadingSession(words, wrongWords) {
  const p = APP.progress;
  for (const word of words) {
    const lw = word.toLowerCase();
    p.exposure[lw] = (p.exposure[lw] || 0) + 1;
  }
  saveProgress();
  refreshHeader();
}

function toggleNotebook(word) {
  const p = APP.progress;
  const i = p.notebook.indexOf(word);
  if (i >= 0) {
    p.notebook.splice(i, 1);
    const pi = p.notebookPassive.indexOf(word);
    if (pi >= 0) p.notebookPassive.splice(pi, 1); // 主动移除时一并清除被动标记
    toast('已取消收藏');
  }
  else { p.notebook.push(word); toast('⭐ 已加入生词本'); }
  saveProgress();
}

/* ---------- 发音（直连有道，Audio 缓存，避免代理 404 往返） ---------- */
let playingWord = null;
const audioCache = new Map(); // key: word|type -> Audio（浏览器自动缓存解码后的音频，重复播放瞬时）
function playAudio(word, type) {
  if (!word) return;
  const t = type === 2 ? '2' : '1';
  const key = word.toLowerCase() + '|' + t;
  let el = audioCache.get(key);
  if (!el) {
    // 静态部署下 /api/audio 代理不可用，直连有道发音最快最稳；本地有 server.js 时直连同样可用
    const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + t;
    el = new Audio(url);
    el.preload = 'auto';
    audioCache.set(key, el);
  }
  const p = el.play();
  if (p && p.catch) p.catch(() => toast('发音播放失败（请检查网络）'));
  playingWord = word;
}
function playUK(word) { playAudio(word, 1); }
function playUS(word) { playAudio(word, 2); }
// 暂停全部已缓存音频（页面切换时调用，避免离开听写后音频继续播放）
function stopAllAudio() {
  audioCache.forEach((el) => { try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ } });
  playingWord = null;
}

/* ---------- UI 工具 ---------- */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1800);
}
function openModal(html, { center = false } = {}) {
  const root = document.getElementById('modalRoot');
  const mask = document.createElement('div');
  mask.className = 'modal-mask' + (center ? ' center' : '');
  mask.innerHTML = '<div class="modal' + (center ? ' center' : '') + '">' + html + '</div>';
  mask.addEventListener('click', (e) => { if (e.target === mask) root.innerHTML = ''; });
  root.innerHTML = ''; root.appendChild(mask);
  return mask.querySelector('.modal');
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

function refreshHeader() {
  const p = APP.progress || {};
  const mastered = p.mastered || {};
  const masteredCount = Object.keys(mastered).length;
  const wrongCount = Array.isArray(p.wrongBook) ? p.wrongBook.length : 0;
  const dailyTarget = Number(APP.settings && APP.settings.dailyNew) || 500;
  const daily = p.daily || {};
  const done = Math.min(daily.newWords || 0, dailyTarget);
  const stars = (typeof p.stars === 'number') ? p.stars : 0;
  const stat = document.getElementById('headerStat');
  if (stat) {
    stat.innerHTML =
      '<span class="stat-pill">' + ICW.starSm + '<b>' + stars + '</b></span>' +
      '<span class="stat-pill">今日 <b>' + done + '/' + dailyTarget + '</b></span>' +
      '<span class="stat-pill">掌握 <b>' + masteredCount + '</b></span>' +
      '<span class="stat-pill">错 <b>' + wrongCount + '</b></span>';
  }
  // 全局难度徽标（动态显示当前难度范围，短标签避免换行）
  const badge = document.getElementById('diffBadge');
  if (badge) {
    const s = APP.settings || {};
    if (!s.difficulty || s.difficulty === 'all') {
      badge.textContent = '全部';
      badge.title = '当前难度范围：全部';
      badge.className = 'diff-badge all';
    } else {
      const arrow = s.diffMode === 'eq' ? '' : '↓';
      badge.textContent = DIFF_LABELS[s.difficulty] + arrow;
      badge.title = '当前难度范围：' + DIFF_LABELS[s.difficulty] + (s.diffMode === 'eq' ? '（仅本级）' : '及以下');
      badge.className = 'diff-badge active';
    }
  }
}

/* ---------- 词库加载失败：显示重试，而非无限转圈 ---------- */
function showLibError() {
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML =
    '<div class="card" style="text-align:center;padding:34px 18px;max-width:420px;margin:24px auto">'
    + '<div>' + IC.alert.replace('<svg', '<svg style="width:40px;height:40px"') + '</div>'
    + '<div style="margin:12px 0 6px;font-weight:700;font-size:17px">词库加载失败</div>'
    + '<div style="opacity:.72;line-height:1.6;margin-bottom:18px">无法连接服务器或加载超时。'
    + '可能是网络波动，或分享链接所在的云端实例已回收。点击下方重试，或稍后重新打开链接。</div>'
    + '<button class="btn block" id="retryLoad">' + ICW.rotateSm + '点击重试</button>'
    + '<div style="margin-top:14px;font-size:12px;opacity:.55">若反复失败，可改用本地运行的版本：在本机浏览器打开 <b>http://localhost:5173</b></div>'
    + '</div>';
  const btn = document.getElementById('retryLoad');
  if (btn) btn.onclick = () => {
    view.innerHTML = '<div class="card" style="text-align:center;padding:36px 16px">'
      + '<div style="font-size:28px">⏳</div>'
      + '<div style="margin-top:10px;opacity:.7">重新加载中…</div></div>';
    _appReady = false;
    loadAll().then(() => {
      _appReady = true;
      if (_libFailed) { showLibError(); return; }
      const target = _pendingPage || APP.page || 'overview';
      _pendingPage = null;
      goto(target);
      refreshHeader();
    }).catch((e) => {
      console.error('[retry] 数据加载失败:', e);
      _appReady = true;
      showLibError();
    });
  };
}

/* ---------- 用户登录 / 会话 ---------- */
const LOCAL_USERS_KEY = 'happy-vocab-local-users-v1';
function getLocalUsers() {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function setLocalUsers(users) {
  try { localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users)); }
  catch (e) { /* ignore */ }
}
function hashLocalPw(u, p) {
  // 简单的确定性混淆（非安全加密，仅用于本地不同用户间做基本隔离）
  const s = u + '::' + p + '::happy-vocab';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); h |= 0; }
  return 'h' + Math.abs(h).toString(36);
}
function registerLocal(username, password) {
  const users = getLocalUsers();
  if (users[username]) return { ok: false, msg: '用户名已存在' };
  users[username] = { p: hashLocalPw(username, password), createdAt: Date.now() };
  setLocalUsers(users);
  return { ok: true };
}
function loginLocal(username, password) {
  const users = getLocalUsers();
  if (!users[username]) return { ok: false, msg: '用户名不存在' };
  if (users[username].p !== hashLocalPw(username, password)) return { ok: false, msg: '密码错误' };
  return { ok: true };
}

// 启动或刷新时拉取当前会话，决定进度归属：已登录→按 userId；匿名→default
async function fetchMe() {
  APP.hasBackend = false;
  try {
    const r = await fetchJSON('/api/auth/me', 8000);
    APP.hasBackend = true;            // 能正常返回 JSON，说明后端存在
    APP.user = (r && r.user) ? r.user : null;
  } catch (e) { APP.user = null; }
  APP.clientId = APP.user ? APP.user.id : 'default';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 根据登录态切换头部：显示「登录」按钮或「用户名 + 退出」
function updateAuthUI() {
  const area = document.getElementById('authArea');
  if (!area) return;
  if (APP.user) {
    area.innerHTML = '<span class="user-chip"><svg class="uico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"></path></svg> ' + escapeHtml(APP.user.id) + '</span>'
      + '<button class="auth-btn" id="logoutBtn" title="退出登录">退出</button>';
    const lb = document.getElementById('logoutBtn');
    if (lb) lb.onclick = doLogout;
  } else {
    area.innerHTML = '<button class="auth-btn" id="loginBtn" title="登录 / 注册">登录</button>';
    const lb = document.getElementById('loginBtn');
    if (lb) lb.onclick = openAuthModal;
  }
}

function openAuthModal() {
  const localHint = APP.hasBackend ? '' : '<p class="hint" style="margin:8px 0 -6px">当前为 <b>GitHub Pages 静态预览版</b>，无后端云同步。注册/登录仅在本机浏览器生效，数据随浏览器清除而消失。</p>';
  const html =
    '<div class="auth-card">'
    + '<div class="auth-tabs">'
    + '<button data-mode="login" class="active">登录</button>'
    + '<button data-mode="register">注册</button>'
    + '</div>'
    + '<input id="authUser" class="auth-input" maxlength="24" placeholder="用户名（2–24 字，字母/数字/中文）" autocomplete="username" />'
    + '<input id="authPw" class="auth-input" type="password" maxlength="64" placeholder="密码（至少 6 位）" autocomplete="current-password" />'
    + localHint
    + '<div class="auth-msg" id="authMsg"></div>'
    + '<button class="btn block" id="authSubmit">登录</button>'
    + '</div>';
  const modal = openModal(html, { center: true });
  let mode = 'login';
  const tabs = modal.querySelectorAll('.auth-tabs button');
  const submit = modal.querySelector('#authSubmit');
  const msg = modal.querySelector('#authMsg');
  const setMode = (m) => {
    mode = m;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    submit.textContent = (m === 'login') ? '登录' : '注册';
    msg.textContent = '';
  };
  tabs.forEach((t) => { t.onclick = () => setMode(t.dataset.mode); });
  submit.onclick = async () => {
    const username = (modal.querySelector('#authUser').value || '').trim();
    const password = (modal.querySelector('#authPw').value || '');
    if (username.length < 2) { msg.textContent = '请输入用户名'; return; }
    if (password.length < 6) { msg.textContent = '密码至少 6 位'; return; }
    msg.textContent = '处理中…';
    submit.disabled = true;
    try {
      if (APP.hasBackend) {
        // 后端在线：走服务器账号
        const r = await fetch('/api/auth/' + mode, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) { msg.textContent = j.msg || '操作失败'; submit.disabled = false; return; }
        APP.user = j.user;
        APP.clientId = j.user.id;
        closeModal();
        toast(mode === 'login' ? '登录成功' : '注册成功，已自动登录');
        updateAuthUI();
        await reloadProgressForUser();
      } else {
        // 静态托管无后端：本地账号模式
        const res = mode === 'register'
          ? registerLocal(username, password)
          : loginLocal(username, password);
        if (!res.ok) { msg.textContent = res.msg; submit.disabled = false; return; }
        APP.user = { id: username, local: true };
        APP.clientId = 'local:' + username;
        closeModal();
        toast((mode === 'login' ? '登录' : '注册') + '成功（本地模式，数据仅保存在本机浏览器）');
        updateAuthUI();
        await reloadProgressForUser();
      }
    } catch (e) {
      msg.textContent = '网络错误，请重试';
      submit.disabled = false;
    }
  };
  modal.querySelectorAll('.auth-input').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.onclick(); }));
}

// 拉取「当前 clientId（用户）」的进度并刷新内存与界面
async function reloadProgressForUser() {
  try {
    const r = await fetchJSON('/api/progress?clientId=' + encodeURIComponent(APP.clientId), 10000);
    APP.progress = (r && r.data) || safeParseProgress() || defaultProgress();
  } catch (e) {
    APP.progress = safeParseProgress() || defaultProgress();
  }
  if (!APP.progress || typeof APP.progress !== 'object') APP.progress = defaultProgress();
  APP.progress = normalizeProgress(APP.progress);
  buildFormIndex();
  buildEffectiveDifficulty();
  ensureDaily();
  if (_appReady) {
    goto(APP.page || 'overview');
    refreshHeader();
  }
}

async function doLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  const wasLocal = APP.user && APP.user.local;
  APP.user = null;
  APP.clientId = 'default';
  // 清掉本机缓存，避免不同用户共用浏览器时进度串档；但本地账号退出时应保留其专属进度
  try { if (!wasLocal) localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  updateAuthUI();
  await reloadProgressForUser();
  toast('已退出登录');
}

/* ---------- 渲染 ---------- */
let currentCtx = null;
// 数据就绪标志：/api/library 约 6MB，弱网下 loadAll 需数秒。
// 用户在加载完成前点击 tab 会导致模块以 null 状态渲染而崩溃（表现为按钮全部无反应），
// 因此未就绪时先显示加载占位并记住目标页，待 loadAll 完成后再真正渲染。
let _appReady = false;
let _libFailed = false; // 词库加载是否失败（超时/网络不可达），用于显示「加载失败」而非无限转圈
let _pendingPage = null;

// 带超时的 JSON 请求：后端不可达或响应被黑洞时，Promise 必须能 settle，
// 否则上层 loadAll 的 .then/.catch 永远不触发，页面会永久卡在「加载中」。
async function fetchJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
function goto(page) {
  APP.page = page;
  // 离开当前页：先停快筛听写的播报计时/自动跳转，再暂停所有音频
  if (window.__hvDictStop) { try { window.__hvDictStop(); } catch (e) { /* ignore */ } window.__hvDictStop = null; }
  stopAllAudio();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
  const view = document.getElementById('view');
  view.scrollTop = 0;
  if (!_appReady) {
    _pendingPage = page;
    view.innerHTML = '<div class="card" style="text-align:center;padding:36px 16px">'
      + '<div style="font-size:28px">⏳</div>'
      + '<div style="margin-top:10px;opacity:.7">词库加载中，请稍候…</div></div>';
    return;
  }
  const mod = APP.modules[page];
  if (mod && mod.render) {
    const ctxObj = { playUK, playUS, toast, openModal, closeModal, refreshHeader, completeRound, recordWrongAnswer, recordWrongQuestion, recordTask, recordReadTask, markMastered, toggleNotebook, findWord, saveProgress, completeSession, completeReadingSession, isMastered, inWrongBook, matchDifficulty, difficultyOf, difficultyLevel, openSettings, showWordCard, todayStr, settings: APP.settings };
    currentCtx = ctxObj;
    try {
      mod.render({ view, APP, ctx: ctxObj });
    } catch (e) {
      console.error('[goto] 模块渲染失败:', page, e);
      view.innerHTML = '<div class="card">' + IC.alertSm + '该模块渲染出错，请刷新页面重试。<br/>如反复出现，请反馈具体模块（' + (page || '') + '）。</div>';
    }
  }
  refreshHeader();
}

function init() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => goto(t.dataset.page)));
  const gear = document.getElementById('settingsBtn');
  if (gear) gear.addEventListener('click', () => openSettings());
  // 标题栏「更多」菜单：统计 / 导入
  const menuBtn = document.getElementById('menuBtn');
  const menu = document.getElementById('headerMenu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { menu.hidden = true; goto(b.dataset.page); }));
    document.addEventListener('click', (e) => {
      if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) menu.hidden = true;
    });
  }
  // 模块间导航 / 启动练习 事件
  window.addEventListener('goto', (e) => goto(e.detail));
  window.addEventListener('start-study', (e) => {
    if (currentCtx) runStudy(document.getElementById('view'), currentCtx, e.detail.words, e.detail.title || '练习');
  });
  // 先确定登录态（决定进度归属），再加载数据
  fetchMe()
    .then(() => loadAll())
    .then(() => {
      _appReady = true;
      updateAuthUI();
      if (_libFailed) { showLibError(); return; }
      const target = _pendingPage || 'overview';
      _pendingPage = null;
      goto(target);
      refreshHeader();
    })
    .catch((e) => {
      // 即便加载失败也放行渲染，避免永久卡在「加载中」占位
      console.error('[init] 数据加载失败:', e);
      _appReady = true;
      updateAuthUI();
      const target = _pendingPage || 'overview';
      _pendingPage = null;
      goto(target);
    });
}

// 启动即同步填充安全默认值（loadSettings/defaultProgress 均为同步函数）：
// 这样即便 loadAll 尚未完成，任何模块的读取也不会因 null 而抛错。
APP.settings = loadSettings();
APP.progress = normalizeProgress(defaultProgress());
APP.library = APP.library || { words: [], readings: [], updatedAt: 0 };

// 预加载 vxiaozhi 助记图清单（单词卡/象形记据此显示精确配图；加载失败静默降级为无图）
if (typeof loadPictImages === 'function') { try { loadPictImages(); } catch (e) {} }

window.APP = APP;
init();
