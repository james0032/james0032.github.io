/**
 * 复习算法调度器（生词本 / 错词本专用）
 * 三套算法，由设置 reviewAlgo 切换：
 *  - wrong3      三次错误移除：全量推荐错词本与生词本，三项练习连续 3 轮全对 → 判定掌握
 *                （轮次跟踪在 app.js 的 wrongRound / nbRound，本模块只管 eb/fsrs）
 *  - ebbinghaus  艾宾浩斯 6 轮记忆法：6 个固定间隔（1天→2天→4天→7天→15天→30天），
 *                每完成一轮且全对自动进入下一轮复习任务，6 轮全部完成 → 判定掌握
 *  - fsrs        FSRS AI 间隔记忆法（FSRS-4.5 官方 17 参数）：根据记忆表现动态计算
 *                下次复习时间，记忆强度（间隔）≥ 21 天 → 判定掌握毕业
 *
 * 调度状态存于 progress.sched[word]（仅 eb/fsrs 使用），切换算法时自动重建。
 */

/* ---------- 算法元信息（设置界面展示） ---------- */
export const ALGOS = {
  wrong3: {
    name: '3 次错误移除算法',
    desc: '全量推荐错词本与生词本；三项练习（中译英/英译中/完形）连续 3 轮全对即判定掌握，中途答错重新计数。',
  },
  ebbinghaus: {
    name: '艾宾浩斯 6 轮记忆法',
    desc: '按遗忘曲线安排 6 轮固定间隔复习（按天）：1天 → 2天 → 4天 → 7天 → 15天 → 30天。每完成一轮且全对自动进入下一轮复习任务，6 轮全部完成判定掌握。',
  },
  fsrs: {
    name: 'FSRS 最强 AI 间隔记忆法',
    desc: 'FSRS-4.5 开源算法，根据每轮记忆表现动态计算下次复习时间与间隔，记得越牢间隔越长；记忆强度达 21 天即毕业掌握。',
  },
};

export function currentAlgo() {
  const s = (typeof window !== 'undefined' && window.APP && window.APP.settings) || {};
  return ALGOS[s.reviewAlgo] ? s.reviewAlgo : 'wrong3';
}

/* ---------- 艾宾浩斯：6 轮固定间隔（完成第 stage 轮后，距下一轮的间隔） ---------- */
export const EB_STEPS = [
  { ms: 1 * 24 * 3600 * 1000, label: '1 天' },
  { ms: 2 * 24 * 3600 * 1000, label: '2 天' },
  { ms: 4 * 24 * 3600 * 1000, label: '4 天' },
  { ms: 7 * 24 * 3600 * 1000, label: '7 天' },
  { ms: 15 * 24 * 3600 * 1000, label: '15 天' },
  { ms: 30 * 24 * 3600 * 1000, label: '30 天' },
];
const EB_TOTAL = 6; // 完成 6 轮 → 掌握

/* ---------- FSRS-4.5（开源权重，MIT） ---------- */
const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FSRS_DECAY = -0.5;          // 幂衰减指数
const FSRS_FACTOR = 19 / 81;      // 衰减因子
const FSRS_RETENTION = 0.9;       // 目标记忆保留率
const FSRS_GRADUATE = 21;         // 间隔 ≥ 21 天 → 掌握毕业
const FSRS_AGAIN_MIN = 10;        // 忘记后 10 分钟内重学（学习步骤）

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 可检索概率：距上次复习 elapsed 天后，还记得该词的概率
function retrievability(st, now) {
  const elapsed = Math.max(0, (now - st.last) / 86400000);
  return Math.pow(1 + (FSRS_FACTOR * elapsed) / st.s, FSRS_DECAY);
}
function initStability(g) { return Math.max(0.1, FSRS_W[g - 1]); }
function initDifficulty(g) { return clamp(FSRS_W[4] - (g - 3) * FSRS_W[5], 1, 10); }
function nextDifficulty(d, g) {
  const nd = d - FSRS_W[6] * (g - 3);
  return clamp(FSRS_W[7] * initDifficulty(4) + (1 - FSRS_W[7]) * nd, 1, 10);
}
function nextStability(st, d, g, r) {
  if (g === 1) { // 遗忘：稳定度重置公式
    return FSRS_W[11] * Math.pow(d, -FSRS_W[12]) * (Math.pow(st.s + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - r));
  }
  const hardPenalty = g === 2 ? FSRS_W[15] : 1;
  const easyBonus = g === 4 ? FSRS_W[16] : 1;
  return Math.min(
    st.s * (1 + Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(st.s, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - r)) - 1) * hardPenalty * easyBonus),
    36500
  );
}
function intervalOf(s) {
  // 使保留率恰好为 FSRS_RETENTION 的间隔（天）
  return Math.max(1, Math.round((s / FSRS_FACTOR) * (Math.pow(FSRS_RETENTION, 1 / FSRS_DECAY) - 1)));
}

/* ---------- 调度状态 ---------- */
function progress() { return window.APP.progress; }
function lwOf(word) { return String(word || '').toLowerCase(); }

// 获取（或初始化）单词的调度状态；算法切换后按新算法重建
function ensureSt(word) {
  const p = progress();
  if (!p.sched) p.sched = {};
  const lw = lwOf(word);
  const a = currentAlgo();
  let st = p.sched[lw];
  if (!st || st.a !== a) {
    st = p.sched[lw] = { a, stage: 0, due: 0, rt: {}, clean: true, s: 0, d: 0, itv: 0, last: 0, reps: 0, lapses: 0 };
  }
  return st;
}

function stOf(word) {
  const p = progress();
  const st = (p.sched || {})[lwOf(word)];
  return (st && st.a === currentAlgo()) ? st : null;
}

// 单词下次到期时间（0 = 新词/从未调度 → 立即到期）
export function dueTs(word) {
  const st = stOf(word);
  return st ? (st.due || 0) : 0;
}
export function isDue(word) { return dueTs(word) <= Date.now(); }

// 答对一题：轮内三项标记；三项凑齐时返回 true（调用方接着调 onRoundDone 推进轮次）
export function onTaskOk(word, task) {
  const st = ensureSt(word);
  st.rt[task] = true;
  return ['zh2en', 'en2zh', 'cloze'].every((k) => st.rt[k]);
}
// 答错一题：本轮作废（clean=false），重练本轮
export function onWrongAnswer(word) {
  const st = ensureSt(word);
  st.clean = false;
  st.rt = {};
}

// 一轮三项全部完成 → 按算法推进。返回 { mastered, stage?, itv?, resetRound? }
export function onRoundDone(word) {
  const st = ensureSt(word);
  const now = Date.now();
  if (st.a === 'ebbinghaus') {
    if (st.clean) st.stage = (st.stage || 0) + 1; // 本轮全对 → 进入下一轮
    st.rt = {};
    const wasClean = st.clean;
    st.clean = true;
    if (st.stage >= EB_TOTAL) return { mastered: true, stage: st.stage };
    // 本轮没全对：留在当前轮，立即重练；全对：按固定间隔进入下一轮
    st.due = wasClean ? now + EB_STEPS[Math.min(st.stage - 1, EB_STEPS.length - 1)].ms : now;
    return { mastered: false, stage: st.stage };
  }
  // FSRS：一轮全对=Good(3)；轮内有错=Again(1)
  const rating = st.clean ? 3 : 1;
  const r = st.reps > 0 ? retrievability(st, now) : 1;
  if (st.reps === 0) {
    st.s = initStability(rating);
    st.d = initDifficulty(rating);
  } else {
    st.d = nextDifficulty(st.d, rating);
    st.s = nextStability(st, st.d, rating, r);
  }
  st.last = now;
  st.reps = (st.reps || 0) + 1;
  if (rating === 1) st.lapses = (st.lapses || 0) + 1;
  st.rt = {};
  st.clean = true;
  if (rating === 1) {
    st.itv = 0;
    st.due = now + FSRS_AGAIN_MIN * 60 * 1000; // 忘记 → 10 分钟后重学
    return { mastered: false, itv: 0 };
  }
  const itv = intervalOf(st.s);
  st.itv = itv;
  if (itv >= FSRS_GRADUATE) return { mastered: true, itv };
  st.due = now + itv * 86400000;
  return { mastered: false, itv };
}

/* ---------- 今日待复习推荐队列 ---------- */
// 过滤出当前算法下「今天应复习」的单词（调用方传入已剔除已掌握的候选）
//  - wrong3: 全量推荐
//  - eb/fsrs: 仅到期的词，按到期时间升序
export function queueFor(wordObjs) {
  const algo = currentAlgo();
  if (algo === 'wrong3') return wordObjs.slice();
  const now = Date.now();
  return wordObjs
    .map((w) => ({ w, due: dueTs(w.word) }))
    .filter((x) => x.due <= now)
    .sort((a, b) => a.due - b.due)
    .map((x) => x.w);
}

// 每日学习总量配额：不重复单词计数；今天已计入的词免费放行（艾宾浩斯/FSRS 当天多轮复习不受限）
// 会把新计入的词写入 progress.daily.words，调用方负责 saveProgress
export function assignQuota(cands) {
  const p = progress();
  const s = (window.APP && window.APP.settings) || {};
  const total = Number(s.dailyTotal) || 500;
  if (!p.daily.words) p.daily.words = [];
  const used = new Set(p.daily.words);
  let free = Math.max(0, total - used.size);
  const out = [];
  for (const w of cands) {
    const lw = lwOf(w.word);
    if (used.has(lw)) { out.push(w); continue; }
    if (free <= 0) continue;
    out.push(w);
    p.daily.words.push(lw);
    free--;
  }
  return out;
}

// 今天剩余可学的不重复单词数
export function dailyRemain() {
  const p = progress();
  const s = (window.APP && window.APP.settings) || {};
  const total = Number(s.dailyTotal) || 500;
  return Math.max(0, total - ((p.daily && p.daily.words) || []).length);
}

/* ---------- 进度标签（列表展示用） ---------- */
export function describeDue(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return '待复习';
  const min = Math.ceil(diff / 60000);
  if (min < 60) return min + '分钟后';
  const h = Math.ceil(min / 60);
  if (h < 24) return h + '小时后';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// wrong3 返回 null（由调用方用 wrongRound/nbRound 展示）
export function schedInfo(word) {
  const algo = currentAlgo();
  const st = stOf(word);
  if (algo === 'ebbinghaus') {
    const stage = st ? (st.stage || 0) : 0;
    const due = st ? (st.due || 0) : 0;
    return {
      text: '第' + Math.min(stage + 1, EB_TOTAL) + '/' + EB_TOTAL + '轮 · ' + (due <= Date.now() ? '待复习' : describeDue(due)),
      done: stage >= EB_TOTAL,
    };
  }
  if (algo === 'fsrs') {
    if (!st || !st.reps) return { text: '待首轮学习 · 强度未知', done: false };
    const itvTxt = st.itv >= 1 ? st.itv + ' 天' : FSRS_AGAIN_MIN + ' 分钟';
    return { text: '强度 ' + itvTxt + ' · ' + (st.due <= Date.now() ? '待复习' : describeDue(st.due)), done: false };
  }
  return null;
}
