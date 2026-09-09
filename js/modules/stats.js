import { escapeHtml, IC } from '../ui.js';

function dateStr(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function lastNDates(n) {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(base.getTime() - k * 86400000);
    out.push(dateStr(d));
  }
  return out;
}
function mdLabel(s) {
  const p = s.split('-');
  return p.length === 3 ? (p[1] + '/' + p[2]) : s;
}

// 纯 SVG 成长曲线：蓝=每日学习次数(轮)，橙=每日正确率%
function growthSVG(series) {
  const W = 320, H = 160, padL = 10, padR = 10, padT = 14, padB = 22;
  const n = series.length;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxR = Math.max(1, ...series.map((d) => d.rounds));
  const X = (i) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const Yr = (v) => padT + innerH - (v / maxR) * innerH;
  const Yp = (v) => padT + innerH - (v / 100) * innerH;

  const lineRounds = series.map((d, i) => `${X(i).toFixed(1)},${Yr(d.rounds).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ` + lineRounds + ` ${X(n - 1).toFixed(1)},${padT + innerH}`;

  const rateArr = series.map((d) => {
    const tot = d.correct + d.wrong;
    return tot ? (d.correct / tot) * 100 : null;
  });
  const rateLine = rateArr
    .map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Yp(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');

  // 网格 + x 轴标签（首/中/尾）
  let grid = '';
  for (let g = 0; g <= 2; g++) {
    const y = padT + (innerH * g) / 2;
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#eef2f8" stroke-width="1"/>`;
  }
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];
  let xlabels = '';
  ticks.forEach((i) => {
    if (series[i]) xlabels += `<text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#8a94a6" text-anchor="middle">${mdLabel(series[i].date)}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block">
    ${grid}
    <polygon points="${areaPts}" fill="rgba(76,110,245,.12)" stroke="none"/>
    <polyline points="${lineRounds}" fill="none" stroke="#4c6ef5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${rateLine ? `<polyline points="${rateLine}" fill="none" stroke="#ff922b" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round"/>` : ''}
    ${xlabels}
  </svg>`;
}

export default {
  render({ view, APP, ctx }) {
    const p = APP.progress;
    const lib = APP.library;
    const total = lib.words.length;
    const today = dateStr(new Date());

    // 14 天序列
    const days = lastNDates(14);
    const recOf = (date) => (date === today ? p.daily : (p.history && p.history[date]) || null);
    const series = days.map((date) => {
      const r = recOf(date);
      return {
        date,
        rounds: r ? r.rounds || 0 : 0,
        correct: r ? r.correct || 0 : 0,
        wrong: r ? r.wrong || 0 : 0,
        newWords: r ? r.newWords || 0 : 0,
        stars: r ? r.stars || 0 : 0,
      };
    });

    const mastered = Object.keys(p.mastered || {}).length;
    const learnedSet = new Set(Object.keys(p.learned || {}).map((w) => w.toLowerCase()));
    const learning = learnedSet.size - mastered;
    const totalRounds = series.reduce((s, d) => s + d.rounds, 0);
    const totalCorrect = series.reduce((s, d) => s + d.correct, 0);
    const totalWrong = series.reduce((s, d) => s + d.wrong, 0);

    // 连续打卡
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const r = recOf(days[i]);
      const active = r && (r.rounds || 0) + (r.newWords || 0) + (r.correct || 0) + (r.wrong || 0) > 0;
      if (active) streak++; else break;
    }

    // 掌握度分布条
    const notStarted = Math.max(0, total - learnedSet.size);
    const seg = (val, color) => val > 0 ? `<span style="width:${((val / total) * 100).toFixed(1)}%;background:${color}"></span>` : '';
    const masteryBar = `<div class="mbar">${seg(mastered, '#2f9e44')}${seg(learning, '#4c6ef5')}${seg(notStarted, '#e9eef5')}</div>`;

    // 分类覆盖
    const catTotal = {}, catLearned = {};
    lib.words.forEach((w) => {
      const c = w.category || '未分类';
      catTotal[c] = (catTotal[c] || 0) + 1;
      if (learnedSet.has((w.word || '').toLowerCase())) catLearned[c] = (catLearned[c] || 0) + 1;
    });
    const catRows = Object.keys(catTotal).sort((a, b) => (catLearned[b] || 0) - (catLearned[a] || 0))
      .map((c) => {
        const t = catTotal[c], l = catLearned[c] || 0;
        const pct = t ? (l / t) * 100 : 0;
        return `<div class="crow"><span class="cname">${escapeHtml(c)}</span>
          <span class="cbar"><i style="width:${pct.toFixed(0)}%"></i></span>
          <span class="cnum">${l}/${t}</span></div>`;
      }).join('');

    // 高频错词
    const wrongEntries = Object.entries(p.wrongCount || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([w, c]) => {
        const wd = lib.words.find((x) => (x.word || '').toLowerCase() === w.toLowerCase());
        const mean = wd ? (wd.meaning || '').split('；')[0] : '';
        return `<button class="wchip" data-w="${escapeHtml(w)}">${escapeHtml(w)} <em>×${c}</em>${mean ? `<small>${escapeHtml(mean)}</small>` : ''}</button>`;
      }).join('') || '<div class="muted">还没有答错的词，继续保持 ' + IC.pencilSm + '</div>';

    // 难度分布（词库参考）
    const diffLabel = { 1: '小学', 2: '初中', 3: '高中', 4: '四级', 5: '六级', 6: '考研+', 7: 'GRE' };
    const diffCnt = {};
    lib.words.forEach((w) => { const k = (ctx.difficultyOf ? ctx.difficultyOf(w) : w.difficulty) || 3; diffCnt[k] = (diffCnt[k] || 0) + 1; });
    const maxDiff = Math.max(1, ...Object.values(diffCnt));
    const diffRows = Object.keys(diffCnt).sort((a, b) => a - b).map((k) => {
      const v = diffCnt[k];
      return `<div class="crow"><span class="cname">${diffLabel[k] || k}</span>
        <span class="cbar"><i style="width:${((v / maxDiff) * 100).toFixed(0)}%;background:#ff922b"></i></span>
        <span class="cnum">${v}</span></div>`;
    }).join('');

    const correctRate = totalCorrect + totalWrong > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : null;

    view.innerHTML = `
      <div class="card">
        <h2>${IC.chart}学习统计</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num warn">${p.stars}</div><div class="lab">累计星数 ${IC.starSm}</div></div>
          <div class="stat"><div class="num">${totalRounds}</div><div class="lab">14天学习轮次</div></div>
          <div class="stat"><div class="num">${mastered}</div><div class="lab">已掌握单词</div></div>
          <div class="stat"><div class="num">${streak}</div><div class="lab">${IC.flameSm}连续打卡(天)</div></div>
        </div>
      </div>

      <div class="card">
        <div class="between"><h2>${IC.chartSm}14天成长曲线</h2>${correctRate != null ? `<span class="pill">正确率 ${correctRate}%</span>` : ''}</div>
        ${growthSVG(series)}
        <div class="legend"><span class="lg lg-blue"></span>每日学习次数<span class="lg lg-orange"></span>每日正确率%</div>
      </div>

      <div class="card">
        <h2>${IC.target}掌握度分布</h2>
        ${masteryBar}
        <div class="mlabel"><span><i style="background:#2f9e44"></i>已掌握 ${mastered}</span><span><i style="background:#4c6ef5"></i>学习中 ${Math.max(0, learning)}</span><span><i style="background:#e9eef5"></i>未开始 ${notStarted}</span></div>
        <div class="muted mt">词库总量 ${total} 词 · 已学 ${learnedSet.size} 词</div>
      </div>

      <div class="card">
        <h2>${IC.grid}分类覆盖</h2>
        ${catRows}
      </div>

      <div class="card">
        <h2>${IC.x}高频错词</h2>
        <div class="wchips">${wrongEntries}</div>
      </div>

      <div class="card">
        <h2>${IC.book}词库难度分布</h2>
        ${diffRows}
      </div>

      <div class="card">
        <button class="btn gray block" id="resetStat">${IC.trashSm}清空学习数据</button>
        <div class="muted mt">统计仅记录本地学习行为，清空后不可恢复。</div>
      </div>
    `;

    view.querySelectorAll('.wchip').forEach((b) => {
      b.addEventListener('click', () => ctx.playUK(b.dataset.w));
    });
    const rb = view.querySelector('#resetStat');
    if (rb) rb.addEventListener('click', () => {
      if (!confirm('确定清空全部学习数据（星数/掌握/错题/统计）？')) return;
      const np = {
        stars: 0, rounds: {}, mastered: {}, wrong: {}, wrongCount: {}, notebook: [],
        daily: { date: today, newWords: 0, rounds: 0, correct: 0, wrong: 0, stars: 0 },
        history: {}, learned: {},
      };
      window.APP.progress = np;
      ctx.saveProgress();
      window.dispatchEvent(new CustomEvent('goto', { detail: 'stats' }));
    });
  },
};
