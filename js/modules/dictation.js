// 快筛听写模块
// 模式：难度听（按 difficulty 本级/本级以下）/ 同步听（按人教版PEP 年级+单元）
// 顺序 / 随机；仅英音；自拼英文 + 中文10选1。
// 难度听：英文+中文一次全对 → 掌握；同步听：连续对 3 次 → 掌握，错则连击清零。
import { escapeHtml, shuffle, commonMeaning, buildEn2ZhOptions, IC } from '../ui.js';

const DICT_DIFF_LABELS = { 1: '小学', 2: '初中', 3: '高中', 4: '四级', 5: '六级', 6: '考研', 7: 'GRE' };
const dictNormalizeInput = (s) => (s || '').toLowerCase().replace(/[\s'’]/g, '').trim();
// 人教版高中册顺序（用于单元排序）
const BOOK_ORDER = { 必修一: 0, 必修二: 1, 必修三: 2, 选必一: 3, 选必二: 4, 选必三: 5, 选必四: 6 };
// 单元排序键：Welcome Unit 置顶于所属册（单元号用 -1），其余按「册序 + 单元号」
function unitSortKey(u) {
  if (!u) return [99, 99];
  // 任一册的 Welcome Unit 都置于该册最前（如「必修一 Welcome Unit」「选必二 Welcome Unit」）
  const wm = /^(.+?)\s*Welcome\s*Unit$/i.exec(u);
  if (wm) return [BOOK_ORDER[wm[1]] != null ? BOOK_ORDER[wm[1]] : 99, -1];
  const m = /^([^U]+)U(\d+)$/.exec(u);
  if (!m) return [99, 99];
  return [BOOK_ORDER[m[1]] != null ? BOOK_ORDER[m[1]] : 99, Number(m[2])];
}

// 当天已听写单词（小写数组）：用于「每个单词每天只听写一轮」的防重复机制。
// 跨天自动重置；旧进度缺字段时回退空数组，绝不抛错。
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function todayDictated(APP) {
  const p = APP.progress;
  if (!p.dictatedLog || p.dictatedLog.date !== todayStr()) p.dictatedLog = { date: todayStr(), words: [] };
  if (!Array.isArray(p.dictatedLog.words)) p.dictatedLog.words = [];
  return p.dictatedLog.words;
}

export default {
  render({ view, APP, ctx }) {
    // 注册「离开本模块」停播钩子：app.js 的 goto 在切换页面前调用，停止播报计时与自动跳转
    window.__hvDictStop = () => {
      stopAudio();
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    };
    const st = {
      mode: 'diff',                                   // diff | sync
      diffLevel: (APP.settings && APP.settings.difficulty) || 'all',   // 1..7 | 'all'
      diffScope: 'le',                                // 'eq' 仅本级 | 'le' 本级及以下
      syncBand: '小学',                               // 小学 | 初中 | 高中
      syncUnit: 'all',                                // 'all' | '必修一U1' ...
      order: 'seq',                                   // 'seq' 顺序 | 'rand' 随机
      cnt: 20, plays: 3, interval: 10,
      all: false,                                     // true=听写全部（本范围未听写/未掌握单词）
    };
    let words = [], idx = 0, masteredCnt = 0, wrongCnt = 0;
    const wrongWords = [];
    let playTimer = null;
    let autoTimer = null; // 全对后自动进入下一题的定时器
    let streakMap = {}; // 同步听：每词连续正确次数（顺序推进，不锁定同一词）
    let presented = 0;  // 已呈现单词计数
    let streak = 0;     // 当前单词的连击数（必须先声明：ESM 为严格模式，未声明赋值会抛 ReferenceError）

    function stopAudio() { if (playTimer) { clearTimeout(playTimer); playTimer = null; } }

    // 按 difficulty 过滤（独立于全局设置）；GRE 桶去重后的「有效难度」优先
    function matchDiff(w, lv, scope) {
      if (lv === 'all') return true;
      const d = (ctx && ctx.difficultyOf) ? ctx.difficultyOf(w) : w.difficulty;
      if (d == null) return false;
      const n = Number(lv);
      return scope === 'eq' ? d === n : d <= n;
    }

    // 取某年级下所有单元（去重，按册+单元排序）
    function unitsOf(band) {
      const set = new Set();
      for (const w of (APP.library.words || [])) {
        const p = w.pep;
        if (p && p.band === band && p.unit) set.add(p.unit);
      }
      const key = (u) => unitSortKey(u);
      return [...set].sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
    }

    // includeDictated=true 时不排除「当天已听写」单词（用于判断范围内是否还有单词可听写）
    function candidates(includeDictated) {
      let pool = (APP.library.words || []).filter((w) =>
        w.word && w.meaning && !APP.progress.mastered[w.word.toLowerCase()]);
      // 防重复：排除当天已经听写过的单词（每个单词每天只听写一轮）
      if (!includeDictated) {
        const done = todayDictated(APP);
        if (done.length) pool = pool.filter((w) => !done.includes(w.word.toLowerCase()));
      }
      if (st.mode === 'diff') {
        pool = pool.filter((w) => matchDiff(w, st.diffLevel, st.diffScope));
      } else {
        pool = pool.filter((w) => {
          const p = w.pep;
          if (!p || p.band !== st.syncBand) return false;
          if (st.syncUnit !== 'all' && p.unit !== st.syncUnit) return false;
          return true;
        });
        if (st.order === 'seq') {
          const key = (w) => {
            const p = w.pep || {};
            const sk = unitSortKey(p.unit || '');
            return [sk[0], sk[1], w.word];
          };
          pool = pool.slice().sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : 1); });
          return pool;
        }
      }
      return st.order === 'rand' ? shuffle(pool) : pool;
    }

    // 开始/再来一轮：取「当天未听写过」的候选词；「听写全部」时取本范围全部，否则按单词量截取。
    // 一轮开始即把本轮单词记为「今天已听写」，确保同一单词当天只听写一轮，不再重复。
    function beginRound() {
      stopAudio();
      const allFull = candidates(true);   // 包含当天已听写的（用于判断范围内是否还有词）
      const all = candidates(false);       // 排除当天已听写的
      if (!allFull.length) {
        ctx.toast(st.mode === 'sync' ? '该年级/单元下没有可听写的单词' : '当前难度下没有可听写的单词');
        return;
      }
      if (!all.length) { renderAllDone(); return; }
      st.cnt = Math.max(5, Math.min(200, st.cnt));
      words = st.all ? all : all.slice(0, Math.max(1, st.cnt));
      const done = todayDictated(APP);
      words.forEach((w) => { const lw = w.word.toLowerCase(); if (!done.includes(lw)) done.push(lw); });
      ctx.saveProgress();
      masteredCnt = 0; wrongCnt = 0; wrongWords.length = 0; streakMap = {};
      idx = 0; presented = 1;
      presentWord(words[idx], 0);
    }

    function renderConfig() {
      stopAudio();
      const levels = [['all', '全部（不限难度）']].concat([1, 2, 3, 4, 5, 6, 7].map((l) => [l, DICT_DIFF_LABELS[l]]));
      const diffOpts = levels.map(([lv, label]) =>
        `<label class="diff-opt"><input type="radio" name="df" value="${lv}" ${String(st.diffLevel) === String(lv) ? 'checked' : ''}> ${label}</label>`).join('');
      const unitOpts = ['<option value="all">全部单元</option>']
        .concat(unitsOf(st.syncBand).map((u) => `<option value="${escapeHtml(u)}" ${st.syncUnit === u ? 'selected' : ''}>${escapeHtml(u)}</option>`)).join('');
      const bandHint = st.syncBand !== '高中' && unitsOf(st.syncBand).length === 0
        ? '<p class="hint" style="margin-top:4px">该年级单元词表待导入，将按整个年级听写。</p>' : '';

      view.innerHTML = `
        <div class="section-title">${IC.zap}快筛听写</div>
        <div class="card">
          <h2 style="margin-bottom:6px">听写设置</h2>
          <p class="hint">仅播放英式发音，需自行拼写英文，并从 10 个选项中选出中文释义。</p>

          <div class="field"><label>听写模式</label>
            <div class="seg">
              <button class="seg-btn ${st.mode === 'diff' ? 'on' : ''}" data-mode="diff">难度听</button>
              <button class="seg-btn ${st.mode === 'sync' ? 'on' : ''}" data-mode="sync">同步听</button>
            </div>
          </div>

          <div id="diffBox" style="${st.mode === 'diff' ? '' : 'display:none'}">
            <div class="field"><label>难度范围</label><div class="diff-opts">${diffOpts}</div></div>
            <div class="field" id="scopeBox" style="${st.diffLevel === 'all' ? 'display:none' : ''}"><label>范围方式</label>
              <div class="seg">
                <button class="seg-btn ${st.diffScope === 'eq' ? 'on' : ''}" data-scope="eq">仅本级</button>
                <button class="seg-btn ${st.diffScope === 'le' ? 'on' : ''}" data-scope="le">本级及以下</button>
              </div>
            </div>
          </div>

          <div id="syncBox" style="${st.mode === 'sync' ? '' : 'display:none'}">
            <div class="field"><label>年级（人教版PEP）</label>
              <div class="seg">
                <button class="seg-btn ${st.syncBand === '小学' ? 'on' : ''}" data-band="小学">小学</button>
                <button class="seg-btn ${st.syncBand === '初中' ? 'on' : ''}" data-band="初中">初中</button>
                <button class="seg-btn ${st.syncBand === '高中' ? 'on' : ''}" data-band="高中">高中</button>
              </div>
            </div>
            <div class="field"><label>单元</label>
              <select id="syncUnit" class="typing">${unitOpts}</select>
            </div>
            ${bandHint}
          </div>

          <div class="field"><label>听写顺序</label>
            <div class="seg">
              <button class="seg-btn ${st.order === 'seq' ? 'on' : ''}" data-order="seq">顺序</button>
              <button class="seg-btn ${st.order === 'rand' ? 'on' : ''}" data-order="rand">随机</button>
            </div>
          </div>

          <div class="field"><label class="chk"><input type="checkbox" id="allChk" ${st.all ? 'checked' : ''}> 听写全部（本范围所有未听写、未掌握的单词）</label></div>
          <div class="field"><label>听写单词量</label><input type="number" class="typing" id="cnt" value="${st.cnt}" min="5" max="200" ${st.all ? 'disabled' : ''}></div>
          <div class="field"><label>每个单词播报次数</label><input type="number" class="typing" id="plays" value="${st.plays}" min="1" max="6"></div>
          <div class="field"><label>播报间隔（秒）</label><input type="number" class="typing" id="iv" value="${st.interval}" min="1" max="10"></div>
          <p class="hint" style="margin-top:-2px">每个单词每天只听写一轮；听过的单词今天不再重复，请到「错词本」复习未掌握的单词。</p>

          <button class="btn block mt" id="start">${IC.playSm}开始听写</button>
        </div>`;

      // 模式切换
      view.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { st.mode = b.dataset.mode; renderConfig(); });
      view.querySelectorAll('[data-scope]').forEach((b) => b.onclick = () => { st.diffScope = b.dataset.scope; renderConfig(); });
      view.querySelectorAll('[data-band]').forEach((b) => b.onclick = () => { st.syncBand = b.dataset.band; st.syncUnit = 'all'; renderConfig(); });
      view.querySelectorAll('[data-order]').forEach((b) => b.onclick = () => { st.order = b.dataset.order; renderConfig(); });
      view.querySelectorAll('input[name="df"]').forEach((r) => r.onchange = () => {
        st.diffLevel = r.value;
        const sb = view.querySelector('#scopeBox');
        if (sb) sb.style.display = st.diffLevel === 'all' ? 'none' : '';
      });
      const su = view.querySelector('#syncUnit');
      if (su) su.onchange = () => { st.syncUnit = su.value; };
      const allChk = view.querySelector('#allChk');
      if (allChk) allChk.onchange = () => { st.all = allChk.checked; renderConfig(); };
      const bindNum = (id, key) => { const el = view.querySelector('#' + id); if (el) el.oninput = () => { st[key] = parseInt(el.value, 10) || st[key]; }; };
      bindNum('cnt', 'cnt'); bindNum('plays', 'plays'); bindNum('iv', 'interval');

      view.querySelector('#start').onclick = () => beginRound();
    }

    function playSeries(word, n, interval) {
      stopAudio();
      let i = 0;
      const step = () => {
        if (i >= n) { playTimer = null; return; }
        ctx.playUK(word);
        i++;
        if (i < n) playTimer = setTimeout(step, interval * 1000);
      };
      step();
    }

    function presentWord(w, curStreak) {
      streak = curStreak;
      // 中文选项用「常用译文」（取首义项），避免一长串义项；并去重
      const pool = words.filter((x) => x.word !== w.word && x.meaning);
      const options = buildEn2ZhOptions(w.meaning, pool, 10);
      const answerZh = commonMeaning(w.meaning) || w.meaning;
      let chosenZh = null;
      const isSync = st.mode === 'sync';
      const remaining = words.filter((x) => !APP.progress.mastered[x.word.toLowerCase()]).length;
      const progLabel = isSync
        ? `已掌握 <b>${masteredCnt}</b> · 待掌握 <b>${remaining}</b>`
        : `单词 ${idx + 1} / ${words.length}`;
      const streakPill = isSync
        ? `<span class="stat-pill ${streak >= 2 ? 'ok' : 'warn'}">连击 ${streak}/3</span>` : '';
      view.innerHTML = `
        <div class="card">
          <div class="between"><h2>${IC.zap}听写</h2><span class="pill">${progLabel}</span></div>
          <div class="dictate-status">
            <span class="stat-pill ok">掌握 <b>${masteredCnt}</b></span>
            <span class="stat-pill warn">未掌握 <b>${wrongCnt}</b></span>
            ${streakPill}
          </div>
          <div class="dictate-audio">
            <button class="audio-btn big" id="replay" title="重播英音">${IC.volumeSm}重播</button>
            <span class="hint">${isSync ? '同步听：连续拼对 3 次才判定掌握，错一次连击清零。' : '正在播放英式发音…'}</span>
          </div>
          <div class="field"><label>拼写英文</label><input type="text" class="typing" id="en" placeholder="输入听到的单词" autocomplete="off" autocorrect="off" spellcheck="false"></div>
          <div class="hint">选择中文释义（10 选 1）：</div>
          <div id="opts" class="opts-grid">${options.map((o, i) => `<button class="opt" data-i="${i}">${escapeHtml(o)}</button>`).join('')}</div>
          <div id="explain" class="example mt" style="display:none"></div>
        </div>
        <button class="btn block mt" id="submit">提交</button>
        ${isSync ? '<button class="btn gray block mt" id="skip">跳过本题</button>' : ''}`;
      view.querySelector('#replay').onclick = () => playSeries(w.word, st.plays, st.interval);
      const input = view.querySelector('#en');
      input.focus();
      playSeries(w.word, st.plays, st.interval);
      const opts = view.querySelectorAll('.opt');
      opts.forEach((b) => b.addEventListener('click', () => {
        if (chosenZh !== null) return;
        chosenZh = options[+b.dataset.i];
        opts.forEach((x) => { x.disabled = true; if (options[+x.dataset.i] === answerZh) x.classList.add('correct'); else if (x === b) x.classList.add('wrong'); });
        check(w);
      }));
      function check(wd) {
        const enOk = dictNormalizeInput(input.value) === dictNormalizeInput(wd.word);
        const zhOk = chosenZh === answerZh;
        const exp = view.querySelector('#explain');
        exp.style.display = 'block';
        const submit = view.querySelector('#submit');
        // 全对：展示反馈后自动进入下一题（点击按钮/回车可立即跳过等待）；做错：手动点「下一题 →」
        const scheduleAuto = () => {
          if (autoTimer) clearTimeout(autoTimer);
          autoTimer = setTimeout(() => { autoTimer = null; advance(); }, 1200);
        };
      if (isSync) {
        if (enOk && zhOk) {
          const s = (streakMap[wd.word] || 0) + 1;
          streakMap[wd.word] = s;
          if (s >= 3) {
            masteredCnt++;
            ctx.markMastered(wd.word);
            exp.innerHTML = IC.checkSm + '连续 3 次正确，已掌握 ' + escapeHtml(wd.word) + '！+10星';
          } else {
            exp.innerHTML = IC.checkSm + '正确（连续 ' + s + '/3），即将进入下一个单词…';
          }
          submit.textContent = (masteredCnt >= words.length) ? '完成' : '下一题 →';
          submit.onclick = advance;
          scheduleAuto();
        } else {
          streakMap[wd.word] = 0;
          wrongCnt++;
          if (!wrongWords.includes(wd.word)) wrongWords.push(wd.word);
          ctx.recordWrongAnswer(wd.word, false);
          const tips = [];
          if (!enOk) tips.push('英文应为 ' + escapeHtml(wd.word));
          if (!zhOk) tips.push('正确中文：' + escapeHtml(answerZh));
          exp.innerHTML = IC.xSm + '连击清零。' + tips.join('；');
          submit.textContent = '下一题 →';
          submit.onclick = advance;
        }
      } else {
        if (enOk && zhOk) {
          masteredCnt++;
          ctx.markMastered(wd.word);
          exp.innerHTML = IC.checkSm + '英文与中文都答对，已掌握 ' + escapeHtml(wd.word) + '！+10星';
          scheduleAuto();
        } else {
          wrongCnt++;
          if (!wrongWords.includes(wd.word)) wrongWords.push(wd.word);
          ctx.recordWrongAnswer(wd.word, false);
          const tips = [];
          if (!enOk) tips.push('英文应为 ' + escapeHtml(wd.word));
          if (!zhOk) tips.push('正确中文：' + escapeHtml(answerZh));
          exp.innerHTML = IC.xSm + tips.join('；');
        }
        submit.textContent = idx < words.length - 1 ? '下一题 →' : '完成';
        submit.onclick = advance;
      }
      }
      if (isSync) {
        const skip = view.querySelector('#skip');
        if (skip) skip.onclick = () => { streakMap[w.word] = 0; advance(); };
      }
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && chosenZh !== null) (view.querySelector('#submit').onclick || function () {}).call(); });
      view.querySelector('#submit').onclick = () => { ctx.toast('请先选择中文释义'); };
    }

    // 只向前扫描：本轮每个候选词各呈现一次，到末尾即完成，绝不回绕（回绕会导致答错的词永远不被掌握而无限循环）。
    function nextUnmastered(from) {
      if (!words.length) return -1;
      for (let i = from; i < words.length; i++) {
        if (!APP.progress.mastered[words[i].word.toLowerCase()]) return i;
      }
      return -1;
    }
    function advance() {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } // 手动/定时二选一，防止连跳两题
      const ni = nextUnmastered(idx + 1);
      if (ni < 0) { renderDone(); return; }
      idx = ni; presented++;
      presentWord(words[idx], streakMap[words[idx].word] || 0);
    }

    function renderDone() {
      stopAudio();
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      ctx.completeSession(words, new Set(wrongWords));
      const modeHint = st.mode === 'sync'
        ? '同步听：需连续拼对 3 次才判定掌握，错一次连击清零。'
        : '难度听：英文与中文一次全对即判定掌握。';
      const wbCount = (APP.progress.wrongBook || []).filter((w) =>
        !(APP.progress.mastered && APP.progress.mastered[String(w).toLowerCase()])).length;
      view.innerHTML = `
        <div class="card" style="text-align:center">
          <h2>${IC.checkSm}听写完成！</h2>
          <div class="stat-grid">
            <div class="stat"><div class="num">${words.length}</div><div class="lab">听写单词</div></div>
            <div class="stat"><div class="num ok">${masteredCnt}</div><div class="lab">已掌握</div></div>
            <div class="stat"><div class="num warn">${wrongCnt}</div><div class="lab">未掌握</div></div>
          </div>
          <p class="hint mt">${modeHint}</p>
          <p class="hint">每个单词每天只听写一轮；本轮听过的单词已记录，今天不再重复。</p>
          ${wrongWords.length ? `<p class="hint">未掌握的 <b>${wrongWords.length}</b> 个单词已自动进入「错词本」，建议去错词本复习。</p>` : ''}
          <button class="btn block mt" id="again">${IC.rotateSm}再来一轮（听写未听写的单词）</button>
          ${wrongWords.length ? `<button class="btn warn block mt" id="wb">${IC.bookXSm}去错词本复习错词（${wrongWords.length}）</button>` : ''}
          <button class="btn gray block mt" id="back">返回设置</button>
        </div>`;
      view.querySelector('#again').onclick = () => beginRound();
      view.querySelector('#back').onclick = () => renderConfig();
      const wbBtn = view.querySelector('#wb');
      if (wbBtn) wbBtn.onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'wrongbook' }));
    }

    // 当天范围内所有单词都已听写过：不再重复，引导去错词本复习
    function renderAllDone() {
      stopAudio();
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      const wbCount = (APP.progress.wrongBook || []).filter((w) =>
        !(APP.progress.mastered && APP.progress.mastered[String(w).toLowerCase()])).length;
      view.innerHTML = `
        <div class="card" style="text-align:center">
          <h2>${IC.checkSm}今天的单词都听写过了</h2>
          <p class="hint mt">快筛听写用于快速筛选你已掌握的单词，<b>每个单词每天只听写一轮</b>。当前筛选范围内的单词今天都已听写过，不再重复。</p>
          ${wbCount ? `<p class="hint">还有 <b>${wbCount}</b> 个错词在「错词本」里，建议去专项复习巩固。</p>` : '<p class="hint">错词本已清空，非常棒！</p>'}
          <button class="btn block mt" id="wb">${IC.bookXSm}去错词本复习</button>
          <button class="btn gray block mt" id="back">返回设置</button>
        </div>`;
      view.querySelector('#wb').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: 'wrongbook' }));
      view.querySelector('#back').onclick = () => renderConfig();
    }

    renderConfig();
  },
};
