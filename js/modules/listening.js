// 听力训练模块
// 3 套 2024 高考英语听力真题，提供三种训练模式：
//   1. 实战模考：完整播放，按 1-20 题顺序作答，整卷评分
//   2. 精听训练：分题听 + 立即看原文/答案/解析
//   3. 原文跟读：听原声后影子跟读（shadowing），录音评分训练语感
// 顶部常显「考场 5 招」策略卡（高考英语听力技巧 + 抖音 @九九老师方法论）
import { IC } from '../ui.js';

const STRATEGIES = [
  { icon: IC.eyeSm, title: '听前抢读', tip: '发卷后立刻圈出题干疑问词、性别、地点、时间；选项对比找差异（同义/相反），大概率答案就在那对里。' },
  { icon: IC.targetSm, title: '抓主旨', tip: '长对话/独白的「首句 → 主旨」「尾句 → 结论/态度」「but/however 后 → 90% 是答案」。' },
  { icon: IC.pencilSm, title: '速记关键', tip: '数字、时间、地址、人名必须动笔记；听到原价+打折价时只记尾数，要做简单加减。' },
  { icon: IC.xSm, title: '果断不纠结', tip: '听力不可逆。一道没听清立刻放弃，盯住下一题；女士的建议/最后出现的信息往往是答案。' },
  { icon: IC.starSm, title: '蒙题偏好', tip: '选委婉/有礼貌/积极的；避开 only/must/never 等绝对词；同义替换比照读更可能是答案。' },
];

// 共享 audio 元素：模块内单实例，离开模块时停止
let _audio = null;
function getAudio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'metadata';
    _audio.id = 'lstAudio';
    // 挂到 DOM：部分浏览器（尤其 iOS Safari）对游离 audio 的播放控制更严格
    document.body.appendChild(_audio);
  }
  return _audio;
}
function stopAudio() {
  if (_audio) { _audio.pause(); _audio.currentTime = 0; }
  stopPrecisePlay();
}

// 毫秒级精准截断播放：用 requestAnimationFrame 轮询 audio.currentTime 并在越过 gEnd 时立即暂停，
// 配合 setTimeout 兜底（标签页后台休眠时 rAF 不触发）。相比 timeupdate（~250ms 粒度），
// 截断误差降到一帧（~16ms）以内，短句不再溢出到下一句。
let _segRaf = null;
let _segTo = null;
function stopPrecisePlay() {
  if (_segRaf) { cancelAnimationFrame(_segRaf); _segRaf = null; }
  if (_segTo) { clearTimeout(_segTo); _segTo = null; }
}
// 精确播放 [start, end] 区间（单位：秒，支持小数）。onStop 在暂停后回调。
function playSegmentPrecise(start, end, onStop) {
  stopPrecisePlay();
  const audio = getAudio();
  try { audio.currentTime = start; } catch (e) {}
  const pr = audio.play();
  if (pr && pr.catch) pr.catch(() => {});
  const durMs = Math.max(0, (end - start)) * 1000;
  let stopped = false;
  const doStop = () => {
    if (stopped) return;
    stopped = true;
    stopPrecisePlay();
    try { audio.pause(); } catch (e) {}
    if (onStop) onStop();
  };
  const tick = () => {
    if (stopped) return;
    // 越过 end 立即暂停；-0.02 预留一帧余量
    if (audio.currentTime >= end - 0.02) { doStop(); return; }
    _segRaf = requestAnimationFrame(tick);
  };
  // 等真正开始播放后再启动 rAF 轮询，避免 seek 延迟导致提前判定
  const onPlay = () => { _segRaf = requestAnimationFrame(tick); audio.removeEventListener('playing', onPlay); };
  audio.addEventListener('playing', onPlay);
  // 兜底：即便 rAF 被节流，也在理论时长 + 缓冲后强制停止
  _segTo = setTimeout(doStop, durMs + 500);
}

// 题库懒加载
let _papers = null;
let _loading = null;
async function loadPapers() {
  if (_papers && Object.keys(_papers).length) return _papers;
  if (_loading) return _loading;
  _loading = (async () => {
    let last = {};
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch('/api/listening');
        if (r.ok) {
          const d = await r.json();
          if (d && Object.keys(d).length) { _papers = d; return d; }
          last = d || {};
        }
      } catch (e) { /* 网络抖动重试 */ }
      await new Promise((res) => setTimeout(res, 300));
    }
    _papers = last;
    return last;
  })();
  _loading.finally(() => { _loading = null; });
  return _loading;
}

// 进度辅助
function getProgress(paperId) {
  if (!APP.progress || typeof APP.progress !== 'object') APP.progress = { listening: { history: {}, wrong: {}, best: {} } };
  const p = APP.progress;
  if (!p.listening || typeof p.listening !== 'object') p.listening = { history: {}, wrong: {}, best: {} };
  if (!p.listening.history || typeof p.listening.history !== 'object') p.listening.history = {};
  if (!p.listening.wrong || typeof p.listening.wrong !== 'object') p.listening.wrong = {};
  if (!p.listening.best || typeof p.listening.best !== 'object') p.listening.best = {};
  if (!p.listening.history[paperId]) p.listening.history[paperId] = [];
  if (!p.listening.wrong[paperId]) p.listening.wrong[paperId] = [];
  return {
    history: p.listening.history[paperId],
    wrong: p.listening.wrong[paperId],
    best: p.listening.best[paperId] || 0,
  };
}
function saveHistory(paperId, mode, score, total, wrongList) {
  if (!APP.progress || typeof APP.progress !== 'object') APP.progress = { listening: { history: {}, wrong: {}, best: {} } };
  const p = APP.progress;
  if (!p.listening || typeof p.listening !== 'object') p.listening = { history: {}, wrong: {}, best: {} };
  if (!p.listening.history[paperId]) p.listening.history[paperId] = [];
  if (!p.listening.wrong[paperId]) p.listening.wrong[paperId] = [];
  const d = new Date();
  const date = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  p.listening.history[paperId].push({ date, mode, score, total, wrong: wrongList });
  if (score > (p.listening.best[paperId] || 0)) p.listening.best[paperId] = score;
  // 错题累加
  for (const n of wrongList) {
    if (!p.listening.wrong[paperId].includes(n)) p.listening.wrong[paperId].push(n);
  }
  if (window.APP && window.APP.progress === p) {
    if (typeof saveProgress === 'function') saveProgress();
  }
}

function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + '\'' + String(s).padStart(2, '0') + '"';
}
// 毫秒级时间显示：在秒后附加一位小数（如 4'19.8"–4'20.7"），让短句边界一目了然
function fmtMs(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec - Math.floor(sec)) * 10);
  return m + '\'' + String(s).padStart(2, '0') + (cs ? '.' + cs : '') + '"';
}

function renderStrategyCard() {
  return `
    <div class="card lst-strategy">
      <div class="lst-strategy-head" id="stratHead">
        <span>${IC.targetSm}考场 5 招 · 高考听力抢分秘籍</span>
        <span class="lst-strategy-toggle">展开 ▾</span>
      </div>
      <div class="lst-strategy-body" hidden>
        ${STRATEGIES.map((s) => `
          <div class="lst-strat-item">
            <span class="lst-strat-ico">${s.icon}</span>
            <div><b>${s.title}</b><p>${s.tip}</p></div>
          </div>
        `).join('')}
        <div class="hint mt">参考高考英语听力技巧综合 + 抖音 @九九老师「考前必须抓听力」方法论整理。</div>
      </div>
    </div>
  `;
}

function renderOverviewCard() {
  const o = getListeningOverview();
  const hasData = o.attempts > 0;
  return `
    <div class="card lst-overview">
      <div class="lst-ov-title">${IC.chart}训练概览</div>
      <div class="lst-ov-grid">
        <div class="lst-ov-cell"><div class="num">${o.attempts}</div><div class="lab">练习次数</div></div>
        <div class="lst-ov-cell"><div class="num">${o.questions}</div><div class="lab">练习题目</div></div>
        <div class="lst-ov-cell"><div class="num ${o.questions && o.acc >= 80 ? 'good' : o.questions && o.acc >= 60 ? 'ok' : 'bad'}">${o.acc}<span class="pct">%</span></div><div class="lab">综合正确率</div></div>
      </div>
      <div class="lst-ov-detail">
        <span>实战模考 ${o.examCount} 次 · ${o.examTotal} 题</span>
        <span>精听复盘 ${o.studyItems} 题</span>
        <span>原文跟读 ${o.shadowSegs} 段</span>
      </div>
      ${hasData ? '' : '<div class="hint">还没有练习记录，去模考或精听开始训练吧～</div>'}
      <div class="hint">正确率按实战模考统计；精听与跟读计入练习题目数。</div>
    </div>
  `;
}

function renderList({ view }) {
  const papers = Object.values(APP.listening.papers || {});
  papers.sort((a, b) => a.id.localeCompare(b.id));
  view.innerHTML = `
    ${renderStrategyCard()}
    ${renderOverviewCard()}
    <div class="section-title"><svg class="vico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/><path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z"/></svg>听力真题 · 2024 高考</div>
    <div class="card">
      <div class="hint">共 ${papers.length} 套真题，每套 20 题。3 种训练模式，建议先「精听」找盲区，再「实战模考」计时演练。</div>
    </div>
    <div class="lst-papers">
      ${papers.map((p) => {
        const prog = getProgress(p.id);
        const attempts = prog.history.length;
        const best = prog.best;
        const wrongSet = new Set(prog.wrong);
        return `
          <div class="card lst-paper">
            <div class="lst-paper-head">
              <div>
                <div class="lst-paper-title">${p.title}</div>
                <div class="lst-paper-meta">20 题 · ${fmtDuration(p.duration)} · 已做 ${attempts} 次</div>
              </div>
              <div class="lst-paper-best">
                <div class="num">${best}<span class="den">/30</span></div>
                <div class="lab">最高分</div>
              </div>
            </div>
            <div class="lst-paper-wrong">${wrongSet.size ? '已收录 ' + wrongSet.size + ' 道错题' : '暂未做错题'}</div>
            <div class="row mt">
              <button class="btn block" data-mode="exam" data-id="${p.id}">${IC.targetSm}实战模考</button>
            </div>
            <div class="row mt">
              <button class="btn soft block" data-mode="study" data-id="${p.id}">${IC.bookOpenSm}精听训练</button>
              <button class="btn ghost block" data-mode="shadow" data-id="${p.id}">${IC.micSm}原文跟读</button>
            </div>
            ${attempts ? `
              <div class="lst-history mt">
                <details><summary>${IC.fileTextSm}历史记录（${attempts}）</summary>
                  <div class="lst-history-list">
                    ${prog.history.slice(-5).reverse().map((h) => `
                      <div class="lst-history-row">
                        <span>${h.date}</span>
                        <span>${h.mode === 'exam' ? '模考' : h.mode === 'study' ? '精听' : '跟读'}</span>
                        <b>${h.score}/${h.total}</b>
                        ${h.wrong && h.wrong.length ? '<span class="warn">错 ' + h.wrong.length + ' 题</span>' : ''}
                      </div>
                    `).join('')}
                  </div>
                </details>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
      ${papers.length === 0 ? '<div class="card">听力题库未加载，请刷新页面或检查 <code>/api/listening</code> 接口。</div>' : ''}
    </div>
  `;
  // 折叠交互
  const head = view.querySelector('#stratHead');
  const body = view.querySelector('.lst-strategy-body');
  if (head && body) {
    head.addEventListener('click', () => {
      const open = !body.hidden;
      body.hidden = open;
      head.querySelector('.lst-strategy-toggle').textContent = open ? '展开 ▾' : '收起 ▴';
    });
  }
  // 模式入口
  view.querySelectorAll('button[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode, id = btn.dataset.id;
      _state.paperId = id;
      _state.mode = mode;
      _state.idx = 0;
      _state.answers = {};
      _state.shadowNotes = {};
      _state.shadowScores = {};
      _state.submitted = false;
      _renderMode();
    });
  });
}

function renderPlayer({ audio, paper }) {
  // 音频播放控制条（固定在页面上方）
  // 播放按钮改为药丸形图文按钮（类似 nudge 按钮风格），避免纯图标在部分浏览器不显示
  return `
    <div class="lst-player">
      <button class="lst-play-btn" id="playBtn" aria-label="播放 / 暂停">
        <svg class="lst-play-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M8 5.64v12.72a1 1 0 0 0 1.55.84l10.2-6.36a1 1 0 0 0 0-1.68L9.55 4.8A1 1 0 0 0 8 5.64z"/>
        </svg>
        <span id="playText">播放</span>
      </button>
      <button class="lst-play-btn lst-restart" id="restartBtn" aria-label="回到开头重听">
        <svg class="lst-restart-svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M12 5V2.6a.5.5 0 0 0-.82-.39L7.2 5.11a.5.5 0 0 0 0 .78l3.98 2.9a.5.5 0 0 0 .82-.39V6a7 7 0 1 1-7 7 .9.9 0 1 0-1.8 0 8.8 8.8 0 1 0 8.8-8z"/>
        </svg>
        <span>重听</span>
      </button>
      <div class="lst-progress">
        <div class="lst-bar"><i id="bar"></i></div>
        <div class="lst-time"><span id="curTime">0:00</span><span class="lst-tsep">/</span><span>${fmtDuration(paper.duration)}</span></div>
      </div>
      <div class="lst-speed">
        <button data-speed="0.8">0.8×</button>
        <button data-speed="1" class="on">1×</button>
        <button data-speed="1.25">1.25×</button>
      </div>
    </div>
  `;
}

function setPlayIcon(btn, playing) {
  const svgPath = btn.querySelector('.lst-play-svg path');
  const text = btn.querySelector('#playText');
  if (playing) {
    btn.classList.add('playing');
    if (svgPath) svgPath.setAttribute('d', 'M6 5h4v14H6zm8 0h4v14h-4z');
    if (text) text.textContent = '暂停';
  } else {
    btn.classList.remove('playing');
    if (svgPath) svgPath.setAttribute('d', 'M8 5.64v12.72a1 1 0 0 0 1.55.84l10.2-6.36a1 1 0 0 0 0-1.68L9.55 4.8A1 1 0 0 0 8 5.64z');
    if (text) text.textContent = '播放';
  }
}

function bindPlayer({ view, paper, ctx }) {
  const audio = getAudio();
  audio.src = '/' + paper.audio;
  const playBtn = view.querySelector('#playBtn');
  const restartBtn = view.querySelector('#restartBtn');
  const bar = view.querySelector('#bar');
  const cur = view.querySelector('#curTime');
  const progress = view.querySelector('.lst-progress');
  function fmt(s) { const m = Math.floor(s/60); return m + ':' + String(Math.floor(s%60)).padStart(2,'0'); }
  // 起播点：勾选「跳过片头」时从正文（4:06）开始，否则从 0 开始
  const startAt = () => (_state.skipIntro ? contentStart(paper) : 0);
  // 进入播放器时把播放头定位到起播点（跳过片头/例题）；pendingPlay 为 true 时定位完成后自动播放。
  // 解决元数据竞态：首次点击播放时若音频元数据尚未就绪，直接设置 currentTime 会被忽略、
  // 导致从 0:00 开始播；改为等 loadedmetadata 校正起播点后再播放。
  let pendingPlay = false;
  function applyStart() {
    const s = startAt();
    if (s > 0 && audio.currentTime < s - 0.5) { try { audio.currentTime = s; } catch (e) {} }
    if (pendingPlay) { pendingPlay = false; const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  // 每次进入都复位到起播点：覆盖可能残留的播放进度与上一模式的自动暂停监听
  audio.pause();
  try { audio.currentTime = startAt(); } catch (e) {}
  setPlayIcon(playBtn, false); // 初始为「播放」状态
  audio.ontimeupdate = () => {
    if (audio.duration) {
      bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
      cur.textContent = fmt(audio.currentTime);
    }
  };
  audio.onended = () => { setPlayIcon(playBtn, false); };
  audio.onplay = () => { setPlayIcon(playBtn, true); };
  audio.onpause = () => { setPlayIcon(playBtn, false); };
  // 元数据就绪后校正起播点（src 切换或同 src 复用均覆盖）；若处于待播放则自动播放
  audio.onloadedmetadata = applyStart;
  playBtn.onclick = () => {
    if (!audio.paused) { audio.pause(); return; }
    const s = startAt();
    if (audio.duration && !isNaN(audio.duration)) {
      // 已可播放：定位（跳过片头）并从当前播放进度开始播放
      if (s > 0 && audio.currentTime < s - 0.5) { try { audio.currentTime = s; } catch (e) {} }
      const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {});
    } else {
      // 元数据未就绪：标记待播放，等 loadedmetadata 校正起播点后自动播放
      pendingPlay = true;
      if (audio.readyState < 1) { try { audio.load(); } catch (e) {} }
      if (s > 0) { try { audio.currentTime = s; } catch (e) {} }
    }
  };
  restartBtn.onclick = () => {
    try { audio.currentTime = startAt(); } catch (e) {}
    if (audio.paused) { const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {}); }
  };
  view.querySelectorAll('.lst-speed button').forEach((b) => {
    b.onclick = () => {
      view.querySelectorAll('.lst-speed button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      audio.playbackRate = parseFloat(b.dataset.speed);
    };
  });
  // 进度条可拖动 seek（鼠标 + 触摸）
  function seekFromEvent(e) {
    const rect = progress.getBoundingClientRect();
    const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    let ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    const dur = audio.duration || paper.duration || 0;
    if (!dur) return;
    const t = ratio * dur;
    audio.currentTime = Math.max(0, Math.min(t, dur - 0.1));
  }
  let dragging = false;
  if (progress) {
    progress.addEventListener('mousedown', (e) => { dragging = true; seekFromEvent(e); });
    progress.addEventListener('touchstart', (e) => { dragging = true; seekFromEvent(e); }, { passive: false });
  }
  function onMove(e) {
    if (!dragging) return;
    if (e.type === 'touchmove') e.preventDefault();
    seekFromEvent(e);
  }
  function onEnd() { dragging = false; }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  // 清理全局监听，避免多次绑定
  ctx.stopAudio = () => {
    stopAudio();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };
}

// ========== 实战模考 ==========
function renderExam({ view, paper }) {
  const total = paper.questions.length;
  const sec1Count = paper.questions.filter((q) => q.section === 1).length;
  const sec2Count = total - sec1Count;
  view.innerHTML = `
    <div class="card">
      <div class="lst-mode-head">
        <button class="btn ghost" id="back">← 返回</button>
        <div><b>${IC.targetSm}${paper.title} · 实战模考</b><div class="hint">${sec1Count} 短对话 + ${sec2Count} 长对话/独白 · 一次性播放，标准考场节奏</div></div>
      </div>
    </div>
    <div id="playerHost"></div>
    ${renderNudgeBar(paper)}
    <div class="lst-strip" id="strip"></div>
    <div id="qCard"></div>
    <div class="card" id="submitCard" hidden>
      <div class="lst-result" id="result"></div>
    </div>
  `;
  view.querySelector('#back').onclick = () => { _state.mode = 'list'; stopAudio(); _renderMode(); };
  // 播放器 + 全局微调
  const host = view.querySelector('#playerHost');
  host.outerHTML = renderPlayer({ audio: getAudio(), paper });
  bindPlayer({ view, paper, ctx: {} });
  bindNudgeBar(view);

  // 题号导航
  const strip = view.querySelector('#strip');
  strip.innerHTML = paper.questions.map((q) => `<button class="lst-num" data-n="${q.n}" data-sec="${q.section}">${q.n}</button>`).join('');
  strip.querySelectorAll('.lst-num').forEach((b) => {
    b.onclick = () => { _state.idx = parseInt(b.dataset.n, 10) - 1; renderExamQuestion(); };
  });

  renderExamQuestion();
}

function renderExamQuestion() {
  const view = document.getElementById('view');
  const paper = APP.listening.papers[_state.paperId];
  const q = paper.questions[_state.idx];
  const host = view.querySelector('#qCard');
  const chosen = _state.answers[q.n];
  host.innerHTML = `
    <div class="card lst-qcard">
      <div class="lst-qhead">
        <span class="lst-qn">第 ${q.n} / ${paper.questions.length} 题</span>
        <span class="lst-qsec">第${q.section === 1 ? '一' : '二'}节</span>
      </div>
      <div class="lst-qtext">${q.q}</div>
      <div class="lst-opts">
        ${q.options.map((o, i) => `
          <button class="lst-opt ${chosen === 'ABC'[i] ? 'on' : ''}" data-v="${'ABC'[i]}">
            <span class="lst-opt-l">${'ABC'[i]}</span>
            <span>${o}</span>
          </button>
        `).join('')}
      </div>
      <div class="row mt">
        <button class="btn ghost block" id="prev" ${_state.idx === 0 ? 'disabled' : ''}>← 上一题</button>
        <button class="btn block" id="next">${_state.idx === paper.questions.length - 1 ? '提交整卷' : '下一题 →'}</button>
      </div>
    </div>
  `;
  host.querySelectorAll('.lst-opt').forEach((b) => {
    b.onclick = () => {
      _state.answers[q.n] = b.dataset.v;
      renderExamQuestion();
      renderExamStrip();
    };
  });
  host.querySelector('#prev').onclick = () => { if (_state.idx > 0) { _state.idx--; renderExamQuestion(); renderExamStrip(); } };
  host.querySelector('#next').onclick = () => {
    if (_state.idx === paper.questions.length - 1) submitExam();
    else { _state.idx++; renderExamQuestion(); renderExamStrip(); }
  };
  renderExamStrip();
}
function renderExamStrip() {
  const view = document.getElementById('view');
  const paper = APP.listening.papers[_state.paperId];
  view.querySelectorAll('.lst-num').forEach((b) => {
    const n = parseInt(b.dataset.n, 10);
    b.classList.toggle('on', n - 1 === _state.idx);
    b.classList.toggle('done', !!_state.answers[n]);
  });
}
function submitExam() {
  const view = document.getElementById('view');
  const paper = APP.listening.papers[_state.paperId];
  let correct = 0;
  const wrong = [];
  paper.questions.forEach((q) => {
    if (_state.answers[q.n] === q.answer) correct++;
    else wrong.push(q.n);
  });
  const score = correct * 1.5; // 每题 1.5 分
  saveHistory(paper.id, 'exam', score, 30, wrong);
  stopAudio();
  view.querySelector('#submitCard').hidden = false;
  view.querySelector('#result').innerHTML = `
    <div class="lst-result-score"><span class="${score >= 27 ? 'good' : score >= 21 ? 'ok' : 'bad'}">${score}</span><span class="den">/30</span></div>
    <div class="lst-result-text">
      ${score >= 27 ? IC.starSm + '优秀！接近满分' : score >= 21 ? IC.checkSm + '不错，再多练几套冲刺高分' : IC.pencilSm + '还需精听，薄弱题已加入错题库'}
    </div>
    <div class="row mt">
      <button class="btn ghost block" id="review">${IC.fileTextSm}复盘错题</button>
      <button class="btn block" id="restart">${IC.rotateSm}再来一次</button>
    </div>
  `;
  view.querySelector('#review').onclick = () => {
    // 切到精听模式，仅过错题
    _state.wrongOnly = new Set(wrong);
    _state.mode = 'study';
    _state.idx = wrong[0] ? wrong[0] - 1 : 0;
    _renderMode();
  };
  view.querySelector('#restart').onclick = () => { _state.answers = {}; _state.idx = 0; renderExamQuestion(); view.querySelector('#submitCard').hidden = true; };
  view.querySelector('#submitCard').scrollIntoView({ behavior: 'smooth' });
}

// ========== 精听训练 ==========
function renderStudy({ view, paper }) {
  const onlyWrong = _state.wrongOnly;
  const total = onlyWrong ? onlyWrong.size : paper.questions.length;
  view.innerHTML = `
    <div class="card">
      <div class="lst-mode-head">
        <button class="btn ghost" id="back">← 返回</button>
        <div><b>${IC.bookOpenSm}${paper.title} · 精听训练${onlyWrong ? '（仅错题）' : ''}</b><div class="hint">逐题精听 · 提交立即看原文/答案/解析 · ${total} 题</div></div>
      </div>
    </div>
    <div id="playerHost"></div>
    ${renderNudgeBar()}
    <div id="qCard"></div>
  `;
  view.querySelector('#back').onclick = () => { _state.mode = 'list'; _state.wrongOnly = null; stopAudio(); _renderMode(); };
  const host = view.querySelector('#playerHost');
  host.outerHTML = renderPlayer({ paper });
  bindPlayer({ view, paper, ctx: {} });
  bindNudgeBar(view, paper);
  if (!_state.idx && onlyWrong) _state.idx = Math.min(...onlyWrong) - 1;
  renderStudyQuestion();
}
function renderStudyQuestion() {
  const view = document.getElementById('view');
  const paper = APP.listening.papers[_state.paperId];
  const onlyWrong = _state.wrongOnly;
  // 跳过非错题
  if (onlyWrong) {
    while (_state.idx < paper.questions.length && !onlyWrong.has(paper.questions[_state.idx].n)) {
      _state.idx++;
    }
  }
  if (_state.idx >= paper.questions.length) {
    // 完成
    view.querySelector('#qCard').innerHTML = `
      <div class="card">
        <div class="lst-result-score"><span class="good">${IC.checkSm}</span></div>
        <div class="lst-result-text">精听完成！回到列表查看新错题。</div>
        <button class="btn block mt" id="backList">返回听力列表</button>
      </div>
    `;
    view.querySelector('#backList').onclick = () => { _state.mode = 'list'; _state.wrongOnly = null; stopAudio(); _renderMode(); };
    return;
  }
  const q = paper.questions[_state.idx];
  const chosen = _state.answers[q.n];
  const submitted = _state.submittedQ && _state.submittedQ[q.n];
  const correct = submitted && chosen === q.answer;
  const ofs = qStart(paper, q);
  const host = view.querySelector('#qCard');
  host.innerHTML = `
    <div class="card lst-qcard">
      <div class="lst-qhead">
        <span class="lst-qn">第 ${q.n} 题</span>
        <span class="lst-qsec">第${q.section === 1 ? '一' : '二'}节</span>
      </div>
      <div class="lst-qtext">${q.q}</div>
      <div class="lst-opts">
        ${q.options.map((o, i) => {
          const v = 'ABC'[i];
          let cls = '';
          if (submitted) {
            if (v === q.answer) cls = 'good';
            else if (v === chosen) cls = 'bad';
          } else if (chosen === v) cls = 'on';
          return `<button class="lst-opt ${cls}" data-v="${v}"><span class="lst-opt-l">${v}</span><span>${o}</span></button>`;
        }).join('')}
      </div>
      <div class="row mt">
        <button class="btn ghost block" id="playThis">▶ 重听本段 ${fmtDuration(ofs)}</button>
        ${!submitted
          ? `<button class="btn block" id="submit" ${chosen ? '' : 'disabled'}>提交答案</button>`
          : `<button class="btn block" id="next">${onlyWrong ? '下一错题 →' : '下一题 →'}</button>`}
      </div>
      ${submitted ? `
        <div class="lst-feedback ${correct ? 'good' : 'bad'}">
          ${correct ? IC.checkSm + '正确！' : IC.xSm + '你的答案：' + (chosen || '未作答') + '　正确答案：' + q.answer}
        </div>
        ${q.transcript ? `
          <div class="lst-tr-block">
            <div class="lst-tr-title">${IC.fileTextSm}听力原文</div>
            <pre class="lst-tr">${q.transcript}</pre>
          </div>
        ` : ''}
        ${q.analysis ? `
          <div class="lst-tr-block">
            <div class="lst-tr-title">${IC.bulbSm}解析</div>
            <div class="lst-an">${q.analysis}</div>
          </div>
        ` : ''}
        ${q.section === 2 ? '<div class="hint">长对话/独白原文较长，建议看完原文再点下一题。</div>' : ''}
      ` : ''}
    </div>
  `;
  host.querySelectorAll('.lst-opt').forEach((b) => {
    if (submitted) return;
    b.onclick = () => { _state.answers[q.n] = b.dataset.v; renderStudyQuestion(); };
  });
  const playBtn = host.querySelector('#playThis');
  if (playBtn) playBtn.onclick = () => {
    const audio = getAudio();
    audio.currentTime = qStart(paper, q);
    const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {});
  };
  const submit = host.querySelector('#submit');
  if (submit) submit.onclick = () => {
    _state.submittedQ = _state.submittedQ || {};
    _state.submittedQ[q.n] = true;
    if (chosen !== q.answer) {
      saveHistory(paper.id, 'study', 0, 1, [q.n]);
    }
    renderStudyQuestion();
  };
  const next = host.querySelector('#next');
  if (next) next.onclick = () => { _state.idx++; renderStudyQuestion(); };
}

function passageOf(paper, n) {
  return (paper.passages || []).find((p) => p.questions.indexOf(n) >= 0) || null;
}

// 按篇估算音频时长（秒）：语速约 2.6 词/秒
function passageSeconds(p) {
  const words = (p.text || '').split(/\s+/).filter(Boolean).length;
  const speech = words / 2.6;
  const n = p.questions.length;
  return p.section === 1
    ? Math.max(20, speech + 12)                 // 短对话读一遍 + 对话间隙/作答
    : speech * 2 + n * 10 + 8;                  // 听前预读 + 读两遍 + 听后作答
}

// 考试音频结构化时间（按 2024 高考听力真题音频节奏标定）：
// 片头（试音 + 例题 + 第一节说明）实际结束于正文 4:06（246s），第二节说明 ≈ 20s，结尾涂卡留白 ≈ 45s
const CONTENT_START = 246;  // 正文（第一节第 1 题）开始时间 = 4:06（试音/例题/第一节说明之后）
const SEC2_DIR = 20;        // 「第二节…听下面5段对话或独白」说明（位于第一节内容之后）
const TAIL_SECONDS = 45;    // 结尾涂卡留白 + 结束语

// 「跳过片头试音及例题」的起播点：第一节正题开始处（4:03）
function contentStart(paper) {
  const dur = paper && paper.duration ? paper.duration : 1400;
  // 有真实转写时间戳时，跳过片头起点取第一节第 1 题的真实起点；否则用结构常量 4:06
  const p0 = (paper && paper.passages || []).find((p) => p.no === 1);
  const s = (p0 && p0.ts && p0.ts.start != null) ? p0.ts.start : CONTENT_START;
  return Math.max(0, Math.min(s, dur - 60));
}

// 音频定位：正文从 4:03 起，片尾留白固定，中间内容段按估算时长等比缩放填满。
// 内容各段时长按原文词数与考试规则（短对话读一遍/长文读两遍）估算，与真实音频结构对应。
function estimateOffset(paper, q) {
  const dur = paper.duration || 1400;
  const passages = (paper.passages || []).slice().sort((a, b) => a.no - b.no);
  const fixed = CONTENT_START + SEC2_DIR + TAIL_SECONDS;
  const contentTotal = passages.reduce((s, p) => s + passageSeconds(p), 0) || 1;
  const span = Math.max(120, dur - fixed);
  const scale = span / contentTotal;
  let t = CONTENT_START;
  let lastSec = 1;
  for (const p of passages) {
    if (p.section === 2 && lastSec === 1) { t += SEC2_DIR; }
    lastSec = p.section;
    if (p.questions.indexOf(q.n) >= 0) return Math.max(0, Math.round(t));
    t += passageSeconds(p) * scale;
  }
  return Math.max(0, Math.round(t));
}

// 题目音频起点：优先使用真实转写时间戳（覆盖层 q.ts），缺失时回退估算。
function qStart(paper, q) {
  if (q && q.ts && q.ts.start != null) return q.ts.start;
  return estimateOffset(paper, q);
}

// 定位微调：把当前播放点前后挪动，用于修正估算误差
function nudgeAudio(sec) {
  const audio = getAudio();
  const dur = audio.duration || 0;
  const next = (audio.currentTime || 0) + sec;
  audio.currentTime = Math.max(0, dur ? Math.min(next, dur - 1) : next);
}

// 句级时间：优先使用真实转写时间戳（覆盖层 passage.sentTs），与渲染句子一一对应时直接用；
// 否则以真实篇起点（passage.ts）或估算篇起点为基准，按词数等比推算。
// 修复退化的句级时间戳：ASR 有时会在段落中途跟丢，
// 表现为从某句起所有句子被压缩进极短区间（实测一段 20 句里后 10 句总共只占 1.3 秒）。
// 检测到这种情况后，从首个异常句起，把剩余真实时间（该句起点 → 段落 ts.end）
// 按各句字数比例重新分配，既保留前面可信的对齐，又让后半段恢复合理时长。
function repairSentTs(sentTs, sentences, ts) {
  if (!sentTs || !sentences || sentTs.length !== sentences.length) return sentTs;
  if (!ts || ts.start == null || ts.end == null) return sentTs;
  let brokenAt = -1;
  for (let i = 0; i < sentTs.length; i++) {
    const dur = (sentTs[i].end != null ? sentTs[i].end : 0) - (sentTs[i].start != null ? sentTs[i].start : 0);
    const expect = sentWordCount(sentences[i]) / 2.6 + 0.6;   // 期望时长：2.6 词/秒 + 停顿
    const thr = Math.min(0.6, expect * 0.35);                 // 短句用比例阈值，避免误判 "Yeah." 之类
    if (!(dur > 0) || dur < thr) { brokenAt = i; break; }
  }
  if (brokenAt < 0) return sentTs;
  const from = Math.max(sentTs[brokenAt].start != null ? sentTs[brokenAt].start : ts.start, ts.start);
  const span = ts.end - from;
  if (!(span > 1)) return sentTs;
  const words = sentences.map((s) => Math.max(sentWordCount(s), 1));
  const tailW = words.slice(brokenAt).reduce((a, b) => a + b, 0) || 1;
  const out = sentTs.slice();
  let t = from;
  for (let i = brokenAt; i < out.length; i++) {
    const seg = span * (words[i] / tailW);
    out[i] = { start: t, end: t + seg };
    t += seg;
  }
  return out;
}

function estimateSentenceTimes(paper, passage) {
  const pStart = (passage.ts && passage.ts.start != null) ? passage.ts.start : estimateOffset(paper, passage.qs[0]);
  const sentences = splitSentences(passage.transcript);
  if (passage.sentTs && passage.sentTs.length === sentences.length) {
    // 保留真实转写时间戳的毫秒级精度（不取整），短句才能精准对齐
    const repaired = repairSentTs(passage.sentTs, sentences, passage.ts);
    return sentences.map((s, i) => ({ start: repaired[i].start, end: repaired[i].end }));
  }
  const pEnd = (passage.ts && passage.ts.end != null) ? passage.ts.end : (pStart + sentences.reduce((a, s) => a + sentWordCount(s) / 2.6 + 0.6, 0));
  let t = pStart;
  return sentences.map((s) => { const start = t; t += sentWordCount(s) / 2.6 + 0.6; return { start: start, end: t }; });
}

// 全局音频定位微调条（放在播放器下方，所有听力模式共用）
function renderNudgeBar(paper) {
  const skipAt = paper ? contentStart(paper) : 0;
  return `
    <div class="lst-nudge-bar">
      <label class="lst-skip-row">
        <input type="checkbox" id="skipIntro" ${_state.skipIntro ? 'checked' : ''}>
        <span>跳过片头试音及例题${skipAt ? `（从 ${fmtDuration(skipAt)} 正题开始）` : ''}</span>
      </label>
      <div class="lst-nudge-btns">
        <button class="btn ghost" id="nbk30">⏪ 30s</button>
        <button class="btn ghost" id="nbk10">⏪ 10s</button>
        <button class="btn ghost" id="nfw10">10s ⏩</button>
        <button class="btn ghost" id="nfw30">30s ⏩</button>
      </div>
      <div class="lst-nudge-note">已按音频转写精准对齐题目/句子时间戳；个别机型若仍有偏差可用 ⏪⏩ 微调。</div>
    </div>
  `;
}

function bindNudgeBar(view, paper) {
  const nudge = { nbk30: -30, nbk10: -10, nfw10: 10, nfw30: 30 };
  Object.keys(nudge).forEach((id) => {
    const b = view.querySelector('#' + id);
    if (b) b.onclick = () => { nudgeAudio(nudge[id]); };
  });
  const skip = view.querySelector('#skipIntro');
  if (skip) {
    skip.onchange = () => {
      _state.skipIntro = skip.checked;
      try { localStorage.setItem(SKIP_KEY, skip.checked ? '1' : '0'); } catch (e) {}
      // 勾选后若当前位置还在片头段，立即跳到正题起点
      if (skip.checked && paper) {
        const s = contentStart(paper);
        const audio = getAudio();
        if (audio.currentTime < s - 0.5) { try { audio.currentTime = s; } catch (e) {} }
      }
    };
  }
}

// ========== 原文跟读（shadowing） ==========
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 按 JSON 里的 passages（每篇一段原文）分组
function groupForPassages(paper) {
  return (paper.passages || []).slice().sort((a, b) => a.no - b.no).map((p) => ({
    no: p.no,
    section: p.section,
    transcript: p.text || '',
    // 逐句中文译文（sidecar 合并而来，索引与 splitSentences 对齐；无则空数组）
    translations: Array.isArray(p.translations) ? p.translations : [],
    // 关键：透传真实时间戳（覆盖层合并后的 p.ts / p.sentTs），
    // 否则跟读逐句只能走估算，对不齐
    ts: p.ts,
    sentTs: p.sentTs,
    qs: paper.questions.filter((q) => p.questions.indexOf(q.n) >= 0),
  }));
}

// 将一段原文拆成句子（保留说话人前缀 W:/M:），用于逐句跟读
function splitSentences(text) {
  const out = [];
  const lines = (text || '').split(/\n+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sp = line.match(/^([WM]\s*:\s*)(.*)$/i);
    const prefix = sp ? sp[1] : '';
    const body = sp ? sp[2] : line;
    // 按句末标点拆分，保留缩写 Mr./Mrs./Ms./Dr.；避免 JS 正则后顾 (?<=) 在老浏览器不兼容
    const parts = body.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n').split('\n').filter(Boolean);
    if (!parts.length) { out.push(prefix + body); continue; }
    for (const part of parts) {
      const s = (prefix + part.trim()).trim();
      if (s) out.push(s);
    }
  }
  return out;
}

// 句级时间推算：不再按「题量比例」摊派（会把一句对话摊到 60 秒以上），
// 而是按每句词数以真实语速（2.6 词/秒 + 0.6s 句间停顿）从该篇起点逐句累加，
// 与实际朗读节奏对应（第二节长文按第一遍朗读时间线）。
function sentWordCount(s) {
  const m = String(s).replace(/^[WM]\s*:\s*/i, '').match(/[A-Za-z0-9']+/g);
  return m ? m.length : 1;
}

// (estimateSentenceTimes 已统一定义于上方，支持真实 sentTs 优先)

// 归一化英文：小写、去标点、分词
function normWords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function renderStars(n) {
  let s = '';
  for (let i = 1; i <= 3; i++) s += `<span class="sh-star ${i <= n ? 'on' : ''}">★</span>`;
  return s;
}

// 把原文渲染成可点击单词：每个单词包成 span，点击弹出单词卡
// 若传入 hitSet，命中词会额外加 hit/miss 颜色
function transcriptToHtml(transcript, hitSet) {
  const re = /([a-zA-Z0-9'_-]+|[^a-zA-Z0-9'_-\s]+|\s+)/g;
  const tokens = (transcript || '').match(re) || [transcript || ''];
  return tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return esc(tok); // 保留普通空格，让文本自然换行
    if (/^[a-zA-Z0-9'_-]+$/.test(tok)) {
      const w = tok.toLowerCase().replace(/[^a-z0-9']/g, '');
      const cls = hitSet ? (hitSet.has(w) ? 'hit' : 'miss') : '';
      return `<span class="sh-word ${cls}" data-word="${esc(tok)}">${esc(tok)}</span>`;
    }
    return esc(tok);
  }).join('');
}

function renderShadow({ view, paper }) {
  const groups = groupForPassages(paper);
  view.innerHTML = `
    <div class="card">
      <div class="lst-mode-head">
        <button class="btn ghost" id="back">← 返回</button>
        <div><b>${IC.micSm}${paper.title} · 原文跟读</b><div class="hint">影子跟读训练：先听原声，再录音跟读，AI 对比发音给出 1–3 星评分</div></div>
      </div>
    </div>
    <div id="playerHost"></div>
    ${renderNudgeBar(paper)}
    <div class="lst-shadow" id="shadowHost"></div>
  `;
  view.querySelector('#back').onclick = () => { _state.mode = 'list'; stopAudio(); _renderMode(); };
  const host = view.querySelector('#playerHost');
  host.outerHTML = renderPlayer({ paper });
  bindPlayer({ view, paper, ctx: {} });
  bindNudgeBar(view, paper);
  if (_state.idx == null) _state.idx = 0;
  if (_state.sidx == null) _state.sidx = 0;
  if (_state.idx >= groups.length) _state.idx = 0;
  _state.shadowShowTr = false; // 进入跟读默认不显示译文
  renderShadowGroup(groups);
}

function renderShadowGroup(groups) {
  const view = document.getElementById('view');
  stopAudio(); // 切换句子/返回时停止上一句的精准播放轮询
  const paper = APP.listening.papers[_state.paperId];
  const g = groups[_state.idx];
  const sentences = splitSentences(g.transcript);
  if (_state.sidx == null) _state.sidx = 0;
  if (_state.sidx >= sentences.length) _state.sidx = sentences.length - 1;
  if (_state.sidx < 0) _state.sidx = 0;
  const sentence = sentences[_state.sidx] || '';
  // 当前句中文译文（sidecar 合并，索引与 splitSentences 对齐；无则空串）
  const tr = (g.translations && g.translations[_state.sidx]) || '';
  const ns = g.qs.map((q) => q.n).join(', ');
  const segKey = _state.idx + '-' + _state.sidx;
  const score = _state.shadowScores[segKey];
  const recUrl = _state.shadowRec[segKey];
  const sentTimes = estimateSentenceTimes(paper, g);
  const st = sentTimes[_state.sidx] || { start: 0, end: 0 };
  const gStart = st.start;
  // 修复句尾重叠：本句播放结束点不得侵入下一句/下一段起点，否则下一句音频会混入本句结尾。
  let nextStart = Infinity;
  if (_state.sidx + 1 < sentTimes.length) {
    nextStart = sentTimes[_state.sidx + 1].start;
  } else if (_state.idx + 1 < groups.length) {
    const nextTs = groups[_state.idx + 1].ts;
    if (nextTs && nextTs.start != null) nextStart = nextTs.start;
  } else {
    const ts = g.ts;
    if (ts && ts.end != null) nextStart = ts.end;
  }
  // 最短播放 1 秒；但无论如何不能突破下一段边界
  let gEnd = Math.min(Math.max(st.end, st.start + 1.0), nextStart);
  if (gEnd < st.start + 1.0) gEnd = Math.min(st.start + 1.0, nextStart);
  const totalDone = Object.keys(_state.shadowScores).length;
  const totalSents = groups.reduce((sum, gp) => sum + splitSentences(gp.transcript).length, 0);
  const hitWords = score && score.hitWords ? score.hitWords : [];
  const hitSet = new Set(hitWords.map((w) => String(w).toLowerCase()));
  const host = view.querySelector('#shadowHost');
  const starsHtml = score ? renderStars(score.stars) : '';
  const transcriptHtml = transcriptToHtml(sentence, hitSet);
  const hasPrev = _state.idx > 0 || _state.sidx > 0;
  const hasNext = _state.idx < groups.length - 1 || _state.sidx < sentences.length - 1;
  const progressText = `第 ${_state.idx + 1}/${groups.length} 段 · 第 ${_state.sidx + 1}/${sentences.length} 句`;
  host.innerHTML = `
    <div class="card lst-qcard">
      <div class="lst-qhead">
        <span class="lst-qn">${progressText} · ${g.section === 1 ? '第一节 短对话' : '第二节 长对话/独白'}</span>
        <span class="lst-qsec">涉及 Q${ns}</span>
      </div>
      <div class="hint">${IC.micSm}逐句跟读：点「听原声」熟悉该句语音语调，再点「开始跟读」模仿录音。点击单词可查看词卡。</div>
      <div class="sh-transcript">${transcriptHtml}</div>
      ${tr ? `
      <button class="btn ghost block mt" id="toggleTr">${_state.shadowShowTr ? IC.eyeOffSm + '隐藏译文' : IC.eyeSm + '显示译文'}</button>
      <div class="sh-tr" id="shTr" style="display:${_state.shadowShowTr ? 'block' : 'none'}"><b>译文：</b>${esc(tr)}</div>
      ` : ''}
      <div class="row mt">
        <button class="btn ghost block" id="playG">${IC.volumeSm}听本句 ${fmtMs(gStart)}–${fmtMs(gEnd)}</button>
        <button class="btn block" id="rec">${IC.micSm}开始跟读</button>
      </div>
      <div id="shStatus" class="sh-status"></div>
      ${score ? `
        <div class="sh-score">
          <div class="sh-stars">${starsHtml}</div>
          <div class="sh-score-text">${esc(score.text)}</div>
          ${recUrl ? '<button class="btn ghost block mt" id="playRec">' + IC.rotateSm + '回放我的跟读</button>' : ''}
        </div>
      ` : ''}
      <div class="row mt">
        <button class="btn ghost block" id="prevG" ${!hasPrev ? 'disabled' : ''}>← 上一句</button>
        <button class="btn block" id="nextG">${!hasNext ? IC.checkSm + '完成' : '下一句 →'}</button>
      </div>
      ${totalDone ? `<div class="hint mt">已完成跟读 ${totalDone}/${totalSents} 句</div>` : ''}
    </div>
  `;
  // 单词点击 → 单词卡
  host.querySelectorAll('.sh-word').forEach((span) => {
    span.onclick = () => {
      const w = span.dataset.word;
      if (w && typeof showWordCard === 'function') showWordCard(w);
    };
  });
  host.querySelector('#playG').onclick = () => {
    // 毫秒级精准截断：从本句真实起点播到真实终点（保留 sentTs 小数精度），
    // 用 rAF 轮询 + setTimeout 兜底在越过 gEnd 时立即暂停，误差 < 一帧。
    playSegmentPrecise(gStart, gEnd);
  };
  const playRec = host.querySelector('#playRec');
  if (playRec && recUrl) playRec.onclick = () => { const a = new Audio(recUrl); const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); };
  const recBtn = host.querySelector('#rec');
  recBtn.onclick = () => {
    if (_state._recording) { stopShadowRec(); return; }
    startShadowRec(groups, { transcript: sentence, segKey });
  };
  host.querySelector('#prevG').onclick = () => { goShadowSentence(groups, -1); };
  host.querySelector('#nextG').onclick = () => {
    if (!hasNext) { _state.mode = 'list'; stopAudio(); _renderMode(); }
    else { goShadowSentence(groups, 1); }
  };
  // 译文显隐：仅切换 DOM，不整段重渲染，避免打断正在播放的原声
  const toggleTr = host.querySelector('#toggleTr');
  if (toggleTr) {
    toggleTr.onclick = () => {
      _state.shadowShowTr = !_state.shadowShowTr;
      const trEl = host.querySelector('#shTr');
      if (trEl) trEl.style.display = _state.shadowShowTr ? 'block' : 'none';
      toggleTr.innerHTML = _state.shadowShowTr ? IC.eyeOffSm + '隐藏译文' : IC.eyeSm + '显示译文';
    };
  }
}

function goShadowSentence(groups, dir) {
  const cur = groups[_state.idx];
  const sents = splitSentences(cur.transcript);
  let nextSidx = _state.sidx + dir;
  if (nextSidx >= 0 && nextSidx < sents.length) {
    _state.sidx = nextSidx;
    renderShadowGroup(groups);
    return;
  }
  // 跨 passage
  const nextIdx = _state.idx + dir;
  if (nextIdx >= 0 && nextIdx < groups.length) {
    _state.idx = nextIdx;
    const nextGp = groups[_state.idx];
    const nextLen = splitSentences(nextGp.transcript).length;
    _state.sidx = dir > 0 ? 0 : nextLen - 1;
    renderShadowGroup(groups);
  }
}

// 开始录音跟读：getUserMedia 录音（回放）+ Web Speech API 实时识别（评分）
async function startShadowRec(groups, g) {
  const status = document.querySelector('#shStatus');
  const recBtn = document.querySelector('#rec');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    // 无麦克风 / 权限被拒：降级为「默读跟读」计时完成，给鼓励性星级
    if (status) status.innerHTML = '<span class="warn">未能访问麦克风（' + (e && e.name ? e.name : '权限不足') + '），已按「默读跟读」计时完成，建议授权后获取发音评分。</span>';
    _state._recording = true;
    if (recBtn) recBtn.innerHTML = IC.micSm + '跟读中…';
    _state._recTimer = setTimeout(() => {
      _state._recording = false;
      if (recBtn) recBtn.innerHTML = IC.micSm + '开始跟读';
      finishShadowRec(groups, g, { stars: 2, text: IC.micSm + '默读跟读完成（未录音）。', hitWords: [], recUrl: null });
    }, 4000);
    return;
  }
  _state._recording = true;
  if (status) status.innerHTML = '<span class="sh-rec">● 录音中… 跟着原声朗读，完成后点「停止跟读」</span>';
  if (recBtn) recBtn.innerHTML = IC.xSm + '停止跟读';
  const chunks = [];
  let mr;
  try {
    mr = new MediaRecorder(stream);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    if (status) status.innerHTML = '<span class="warn">当前浏览器不支持录音，已跳过评分。</span>';
    _state._recording = false;
    if (recBtn) recBtn.innerHTML = IC.micSm + '开始跟读';
    return;
  }
  mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    _state.shadowRec[g.segKey] = url;
    stream.getTracks().forEach((t) => t.stop());
    finishShadowRec(groups, g, { recUrl: url, recognized: (_state._finalText || '').trim() });
  };
  mr.start();
  // AI 识别（Web Speech API，实时）
  let recog = null, finalText = '';
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      recog = new SR();
      recog.lang = 'en-US';
      recog.interimResults = false;
      recog.continuous = false;
      recog.onresult = (ev) => { for (let i = 0; i < ev.results.length; i++) finalText += ev.results[i][0].transcript + ' '; };
      recog.start();
    }
  } catch (e) { /* 识别不可用则仅回放 */ }
  _state._mr = mr;
  _state._recog = recog;
  _state._finalText = finalText;
}

function stopShadowRec() {
  _state._recording = false;
  const recBtn = document.querySelector('#rec');
  if (recBtn) recBtn.innerHTML = IC.micSm + '开始跟读';
  if (_state._mr && _state._mr.state !== 'inactive') { try { _state._mr.stop(); } catch (e) {} }
  if (_state._recog) { try { _state._recog.stop(); } catch (e) {} }
  if (_state._recTimer) { clearTimeout(_state._recTimer); _state._recTimer = null; }
}

function computeStars(hit, total) {
  if (!total) return 1;
  const r = hit / total;
  if (r >= 0.8) return 3;
  if (r >= 0.5) return 2;
  return 1;
}

function finishShadowRec(groups, g, opts) {
  opts = opts || {};
  const status = document.querySelector('#shStatus');
  let stars = opts.stars, text = opts.text, hitWords = opts.hitWords || [];
  if (stars == null) {
    const target = normWords(g.transcript);
    const total = target.length;
    const recWords = normWords(opts.recognized || '');
    if (!recWords.length) {
      stars = opts.recUrl ? 2 : 1;
      text = opts.recUrl
        ? IC.headphonesSm + '已录下你的跟读，但未能识别文字（浏览器未支持语音识别或环境较安静）。回放对比原声继续练习！'
        : IC.micSm + '已完成跟读。';
    } else {
      const tset = new Set(target);
      hitWords = recWords.filter((w) => tset.has(w));
      const hit = hitWords.length;
      stars = computeStars(hit, total);
      const pct = total ? Math.round((hit / total) * 100) : 0;
      text = `命中 ${hit}/${total} 词（${pct}%）` + (stars === 3 ? IC.starSm + '非常接近原声！' : stars === 2 ? IC.checkSm + '不错，再多练几遍' : IC.pencilSm + '继续模仿语音语调');
    }
  }
  _state.shadowScores[g.segKey] = { stars, text, hitWords: hitWords.map((w) => String(w)), recUrl: opts.recUrl || null };
  recordShadow(_state.paperId, g.segKey, stars);
  if (status) status.innerHTML = '';
  renderShadowGroup(groups);
}

// 记录跟读进度（按段落去重累计完成段数与星级），供训练概览统计
function recordShadow(paperId, segIdx, stars) {
  const p = APP.progress;
  if (!p.listening) p.listening = { history: {}, wrong: {}, best: {}, shadow: {} };
  if (!p.listening.shadow) p.listening.shadow = {};
  const s = p.listening.shadow[paperId] || { segs: [], stars: 0 };
  if (!s.segs.includes(segIdx)) s.segs.push(segIdx);
  s.stars = (s.stars || 0) + stars;
  p.listening.shadow[paperId] = s;
  if (typeof saveProgress === 'function') saveProgress();
}

// 听力训练概览统计
function getListeningOverview() {
  const prog = APP.progress || {};
  const listening = prog.listening || {};
  const lh = listening.history || {};
  const shadow = listening.shadow || {};
  let examCount = 0, examCorrect = 0, examTotal = 0;
  let studyItems = 0;   // 精听复盘错题数
  let attempts = 0;     // 总练习次数（模考 / 精听 / 跟读）
  let shadowSegs = 0, shadowStars = 0;
  for (const pid in lh) {
    for (const h of lh[pid]) {
      attempts++;
      if (h.mode === 'exam') { examCount++; examCorrect += h.score / 1.5; examTotal += h.total; }
      else if (h.mode === 'study') { studyItems += (h.wrong && h.wrong.length) || 1; }
    }
  }
  for (const pid in shadow) {
    const s = shadow[pid];
    shadowSegs += (s.segs && s.segs.length) || 0;
    shadowStars += s.stars || 0;
  }
  const questions = examTotal + studyItems + shadowSegs;
  const acc = examTotal ? Math.round((examCorrect / examTotal) * 100) : 0;
  return { attempts, examCount, examCorrect: Math.round(examCorrect), examTotal, studyItems, shadowSegs, shadowStars, questions, acc };
}

// ========== 主入口 ==========
const SKIP_KEY = 'hv_listen_skipIntro';
const _state = {
  paperId: null, mode: 'list', idx: 0, sidx: 0,
  answers: {}, submittedQ: {}, shadowNotes: {}, shadowScores: {}, shadowRec: {}, wrongOnly: null,
  shadowShowTr: false, // 跟读译文显隐：默认不显示
  // 跳过片头试音及例题：默认勾选（读本地偏好，未设置时为 true）
  skipIntro: (function () {
    try { return localStorage.getItem(SKIP_KEY) !== '0'; } catch (e) { return true; }
  })(),
};
function _renderMode() {
  const view = document.getElementById('view');
  const paper = APP.listening.papers[_state.paperId];
  if (_state.mode === 'list') return renderList({ view });
  if (_state.mode === 'exam') return renderExam({ view, paper });
  if (_state.mode === 'study') return renderStudy({ view, paper });
  if (_state.mode === 'shadow') return renderShadow({ view, paper });
}

export default {
  async render({ view, APP, ctx }) {
    view.innerHTML = '<div class="card">' + IC.headphonesSm + '正在加载听力题库…</div>';
    try {
      const papers = await loadPapers();
      if (!Object.keys(papers).length) {
        view.innerHTML = '<div class="card">' + IC.alertSm + '听力题库未加载到数据，请检查 <code>/api/listening</code> 是否可访问。</div>';
        return;
      }
      APP.listening.papers = papers;
      _renderMode();
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="card">' + IC.alertSm + '听力题库加载失败：' + (e.message || e) + '</div>';
    }
  },
  stop: stopAudio,
};
