import { shuffle, IC } from '../ui.js';
import { runStudy } from '../study.js';
import { runWordQuiz } from '../quiz.js';
import { currentAlgo, queueFor, assignQuota, dailyRemain, ALGOS } from '../scheduler.js';

const DIFF_LABEL = { 1: '小学', 2: '初中', 3: '高中', 4: '四级', 5: '六级', 6: '考研', 7: 'GRE' };
let diffMode = 'le'; // 'le' = 本级及以下(累计) | 'eq' = 仅本级

function dailyTarget() {
  const s = (window.APP && window.APP.settings) || {};
  return Number(s.dailyNew) || 500;
}

function dailyProgress() {
  const p = window.APP.progress;
  return Math.min((p.daily && p.daily.newWords) || 0, dailyTarget());
}

export default {
  render({ view, APP, ctx }) {
    const lib = APP.library;
    const p = APP.progress;
    const total = lib.words.length;
    const mastered = Object.keys(p.mastered).length;
    const wrong = (p.wrongBook || []).length;
    const notebook = (p.notebook || []).length;
    const done = dailyProgress();
    const target = dailyTarget();
    const pct = Math.round((done / target) * 100);

    // 难度分布（精确 + 累计 + 待学动态计数）
    const masteredSet = new Set(Object.keys(p.mastered).map((x) => x.toLowerCase()));
    const exact = {}, remainExact = {};
    lib.words.forEach((w) => {
      // 用「有效难度」：与低等级重复的简单词已从 GRE 桶移除
      const k = (ctx.difficultyOf ? ctx.difficultyOf(w) : w.difficulty) || 3;
      exact[k] = (exact[k] || 0) + 1;
      if (!masteredSet.has(String(w.word).toLowerCase())) remainExact[k] = (remainExact[k] || 0) + 1;
    });
    const cum = {}, remainCum = {};
    for (let lv = 1; lv <= 7; lv++) {
      cum[lv] = (cum[lv - 1] || 0) + (exact[lv] || 0);
      remainCum[lv] = (remainCum[lv - 1] || 0) + (remainExact[lv] || 0);
    }

    // 学习规则文案：按当前复习算法生成
    const algoName = ALGOS[currentAlgo()].name;
    const rules = currentAlgo() === 'wrong3'
      ? '• 每完成 1 题：<b>+1 星</b><br/>'
        + '• 三项练习（中译英 / 英译中 / 完形填空）<b>全部答对</b>算一轮，常规练习一轮全过关即掌握 <b>+10 星</b><br/>'
        + '• 生词本 / 错词本按「<b>' + algoName + '</b>」：全量推荐，<b>连续 3 轮全对</b>判定掌握，中途答错重新计数<br/>'
        + '• 每日仅 <b>新单词</b> 计入新词任务（上限 ' + target + '），复习不累加<br/>'
        + '• 全站拼读由算法统一重渲染，杜绝错乱'
      : currentAlgo() === 'ebbinghaus'
        ? '• 每完成 1 题：<b>+1 星</b><br/>'
          + '• 三项练习（中译英 / 英译中 / 完形填空）<b>全部答对</b>算一轮，常规练习一轮全过关即掌握 <b>+10 星</b><br/>'
          + '• 生词本 / 错词本按「<b>' + algoName + '</b>」：6 轮固定间隔（1天→2天→4天→7天→15天→30天），每轮全对自动进入下一轮，6 轮完成判定掌握<br/>'
          + '• 每日仅 <b>新单词</b> 计入新词任务（上限 ' + target + '），复习不累加<br/>'
          + '• 全站拼读由算法统一重渲染，杜绝错乱'
        : '• 每完成 1 题：<b>+1 星</b><br/>'
          + '• 三项练习（中译英 / 英译中 / 完形填空）<b>全部答对</b>算一轮，常规练习一轮全过关即掌握 <b>+10 星</b><br/>'
          + '• 生词本 / 错词本按「<b>' + algoName + '</b>」：AI 动态计算复习间隔，记得越牢间隔越长，记忆强度达 21 天判定掌握<br/>'
          + '• 每日仅 <b>新单词</b> 计入新词任务（上限 ' + target + '），复习不累加<br/>'
          + '• 全站拼读由算法统一重渲染，杜绝错乱';

    view.innerHTML = `
      <div class="card">
        <h2><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>学习概览</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${done}/${target}</div><div class="lab">今日新词任务</div></div>
          <div class="stat"><div class="num warn">${p.stars}</div><div class="lab">累计星数 ${IC.starSm}</div></div>
          <div class="stat"><div class="num">${mastered}</div><div class="lab">已掌握单词</div></div>
          <div class="stat"><div class="num">${wrong}</div><div class="lab">错词本待重练</div></div>
        </div>
        <div class="mt">
          <div class="muted">每日新词任务进度（仅新单词计入，上限 ${target} 词）</div>
          <div class="progress mt"><i style="width:${pct}%"></i></div>
        </div>
      </div>

      <div class="card">
        <h2>${IC.book}词库</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${total}</div><div class="lab">内置词库总量</div></div>
          <div class="stat"><div class="num">${notebook}</div><div class="lab">生词本收藏</div></div>
          <div class="stat"><div class="num warn">${wrong}</div><div class="lab">错词本收词</div></div>
        </div>
      </div>

      <div class="section-title">${IC.sliders}按难度学习</div>
      <div class="card">
        <div class="seg">
          <button class="seg-btn ${diffMode === 'le' ? 'on' : ''}" id="dmLe">本级及以下</button>
          <button class="seg-btn ${diffMode === 'eq' ? 'on' : ''}" id="dmEq">仅本级</button>
        </div>
        <div class="diff-grid">
          ${[1, 2, 3, 4, 5, 6, 7].map((lv) => {
            const total = diffMode === 'le' ? (cum[lv] || 0) : (exact[lv] || 0);
            const remain = diffMode === 'le' ? (remainCum[lv] || 0) : (remainExact[lv] || 0);
            return `<button class="diff-btn" data-level="${lv}" ${total ? '' : 'disabled'}>
              <span class="d-name">${DIFF_LABEL[lv]}</span>
              <span class="d-num">${total} 词</span>
              <span class="d-task">待学 ${remain}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="hint mt">选择难度后，从该难度的完整词表开始学习（顺序过词，可随时退出）。当前全局难度范围在右上角 ${IC.settingsSm}设置中调整，将同步影响分类记与阅读记。</div>
      </div>

      <div class="section-title">${IC.zap}快速开始</div>
      <div class="card">
        <button class="btn block" id="quickStudy">${IC.targetSm}随机练习（10词）</button>
        <div class="row mt">
          <button class="btn ghost block" id="quickWrong">${IC.bookXSm}复习错词本</button>
          <button class="btn soft block" id="quickNote">${IC.starSm}背生词本</button>
        </div>
        <button class="btn gray block mt" id="goCategory">${IC.gridSm}进入分类记</button>
      </div>

      <div class="card">
        <h2>${IC.pin}学习规则</h2>
        <div class="hint">
          ${rules}
        </div>
      </div>
    `;

    view.querySelector('#quickStudy').addEventListener('click', () => {
      // 每日新词上限：已达上限时引导去复习，不再引入新词
      const p = APP.progress;
      if ((p.daily.newWords || 0) >= target) { ctx.toast('今日新词任务已达成（' + target + ' 词），可去错词本/生词本复习'); return; }
      const pool = shuffle(lib.words).slice(0, 10);
      if (!pool.length) { ctx.toast('词库暂无数据，请先导入'); return; }
      window.dispatchEvent(new CustomEvent('start-study', { detail: { words: pool } }));
      ctx.toast('开始随机练习');
    });
    view.querySelector('#quickWrong').addEventListener('click', () => {
      const isW3 = currentAlgo() === 'wrong3';
      let cands = (p.wrongBook || [])
        .map((w) => APP.library.words.find((x) => x.word.toLowerCase() === String(w).toLowerCase()))
        .filter(Boolean)
        .filter((w) => !p.mastered[String(w.word).toLowerCase()]);
      if (isW3 && p.wrongDaily && p.wrongDaily.date === ctx.todayStr()) {
        cands = cands.filter((w) => !(p.wrongDaily.words || []).includes(String(w.word).toLowerCase()));
      }
      const queue = assignQuota(queueFor(cands));
      ctx.saveProgress();
      if (!queue.length) { ctx.toast(isW3 ? '错词本空空如也 🎉' : '暂无到期复习 🎉'); return; }
      runWordQuiz(ctx, view, queue, '错词本', { source: 'wrongbook' });
    });
    view.querySelector('#quickNote').addEventListener('click', () => {
      const cands = (p.notebook || [])
        .map((w) => APP.library.words.find((x) => x.word.toLowerCase() === w.toLowerCase()))
        .filter(Boolean)
        .filter((w) => !p.mastered[String(w.word).toLowerCase()]);
      const queue = assignQuota(queueFor(cands));
      ctx.saveProgress();
      if (!queue.length) { ctx.toast(currentAlgo() === 'wrong3' ? '生词本还没有收藏' : '暂无到期复习 🎉'); return; }
      runWordQuiz(ctx, view, queue, '生词本', { source: 'notebook' });
    });
    view.querySelector('#goCategory').addEventListener('click', () => window.dispatchEvent(new CustomEvent('goto', { detail: 'category' })));

    // 难度学习：模式切换 + 难度词表入口
    function updateDiffCounts() {
      const leBtn = view.querySelector('#dmLe');
      const eqBtn = view.querySelector('#dmEq');
      if (leBtn) leBtn.classList.toggle('on', diffMode === 'le');
      if (eqBtn) eqBtn.classList.toggle('on', diffMode === 'eq');
      view.querySelectorAll('.diff-btn').forEach((b) => {
        const lv = +b.dataset.level;
        const total = diffMode === 'le' ? (cum[lv] || 0) : (exact[lv] || 0);
        const remain = diffMode === 'le' ? (remainCum[lv] || 0) : (remainExact[lv] || 0);
        const numEl = b.querySelector('.d-num');
        if (numEl) numEl.textContent = total + ' 词';
        const taskEl = b.querySelector('.d-task');
        if (taskEl) taskEl.textContent = '待学 ' + remain;
        b.disabled = total === 0;
      });
    }
    view.querySelector('#dmLe').addEventListener('click', () => { diffMode = 'le'; updateDiffCounts(); });
    view.querySelector('#dmEq').addEventListener('click', () => { diffMode = 'eq'; updateDiffCounts(); });
    view.querySelectorAll('.diff-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const lv = +b.dataset.level;
        const dOf = (w) => (ctx.difficultyOf ? ctx.difficultyOf(w) : w.difficulty) || 3;
        const pool = diffMode === 'le'
          ? lib.words.filter((w) => dOf(w) <= lv)
          : lib.words.filter((w) => dOf(w) === lv);
        if (!pool.length) { ctx.toast('该难度暂无单词'); return; }
        const title = (diffMode === 'le' ? (DIFF_LABEL[lv] + '及以下') : DIFF_LABEL[lv]) + '词表';
        runStudy(view, ctx, pool, title);
      });
    });
  },
};
