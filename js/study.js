import { escapeHtml, shuffle, pickDistractors, wordCardHTML, bindWordCardEvents, formatPhonetic, formatMeaningHTML, IC } from './ui.js';

function normalizeInput(s) { return (s || '').toLowerCase().replace(/[\s'’]/g, '').trim(); }

// 题型引擎：闪记 → 测试（英译中10选1 / 中译英填空 / 例句完形4选1）
// 题型细节与阅读记保持一致
export function runStudy(view, ctx, words, title) {
  // 过滤已掌握
  const activeWords = words.filter((w) => !(window.APP.progress.mastered && window.APP.progress.mastered[w.word.toLowerCase()]));
  if (!activeWords.length) { view.innerHTML = '<div class="card">' + IC.checkSm + '本组单词已全部掌握</div>'; return; }
  let mode = 'flash'; // flash | test | done
  let quizType = 'en2zh'; // en2zh | zh2en | cloze
  let idx = 0;
  const learnedWords = new Set();
  const sessionWrong = new Set();
  let quizState = null;

  const TYPE_LABELS = { en2zh: '英译中', zh2en: '中译英', cloze: '完形填空' };
  function typeBar() {
    return `<div class="reading-mode-bar">` + Object.keys(TYPE_LABELS).map((k) =>
      `<button class="mode-btn ${quizType === k ? 'on' : ''}" data-type="${k}">${TYPE_LABELS[k]}</button>`).join('') + `</div>`;
  }
  function bindTypeBar() {
    view.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => {
      quizType = b.dataset.type;
      if (mode === 'test') quizState = makeQuiz(activeWords[idx]);
      render();
    }));
  }

  function render() {
    if (mode === 'flash') return renderFlash();
    if (mode === 'test') return renderTest();
    return renderDone();
  }

  function renderFlash() {
    view.innerHTML = `
      <div class="card">
        <div class="between"><h2>${IC.grid}${escapeHtml(title)} · 闪记</h2><span class="pill">${idx + 1}/${activeWords.length}</span></div>
        <div class="hint">先快速过一遍，点击 ${IC.volumeSm} 听发音，再选练习类型开始测试。</div>
        ${typeBar()}
      </div>
      <div id="flashWrap"></div>
      <div class="row mt">
        <button class="btn gray block" id="prev">上一张</button>
        <button class="btn ghost block" id="next">下一张</button>
      </div>
      <button class="btn block mt" id="toTest">${IC.checkSm}开始测试（${TYPE_LABELS[quizType]}）</button>
    `;
    const wrap = view.querySelector('#flashWrap');
    wrap.innerHTML = wordCardHTML(activeWords[idx], { showNote: true });
    bindWordCardEvents(wrap, ctx);
    bindTypeBar();
    view.querySelector('#prev').onclick = () => { idx = (idx - 1 + activeWords.length) % activeWords.length; renderFlash(); };
    view.querySelector('#next').onclick = () => { idx = (idx + 1) % activeWords.length; renderFlash(); };
    view.querySelector('#toTest').onclick = () => { mode = 'test'; idx = 0; quizState = makeQuiz(activeWords[idx]); render(); };
  }

  function makeQuiz(word) {
    const lib = window.APP.library;
    if (quizType === 'zh2en') {
      return { word, type: 'zh2en', chosen: null };
    }
    if (quizType === 'en2zh') {
      const distract = pickDistractors(lib.words, word.word, 'meaning', 9);
      const options = shuffle([word.meaning, ...distract.filter(Boolean)]).slice(0, 10);
      return { word, type: 'en2zh', options, answer: word.meaning, chosen: null };
    }
    // 完形：例句挖空
    const ex = word.example || '';
    const w = word.word;
    const re = new RegExp('\\b' + w + '\\b', 'i');
    let sentence = ex, blankOk = false;
    if (re.test(ex)) { sentence = ex.replace(re, '______'); blankOk = true; }
    else { sentence = ex + ' （核心词：' + w + '）'; }
    const distract = pickDistractors(lib.words, word.word, 'word', 3);
    const options = shuffle([w, ...distract.filter(Boolean)]).slice(0, 4);
    return { word, type: 'cloze', sentence, blankOk, options, answer: w, chosen: null };
  }

  function renderTest() {
    const q = quizState;
    const w = q.word;
    const head = `<div class="card"><div class="between"><h2>${IC.pencil}测试 · ${escapeHtml(title)}</h2><span class="pill">${idx + 1}/${activeWords.length}</span></div>${typeBar()}</div>`;
    let body = '';
    if (q.type === 'en2zh') {
      const uk = formatPhonetic(w.phoneticUk || w.phonetic || '');
      const us = formatPhonetic(w.phoneticUs || '');
      body = `
        <div class="card">
          <div class="word-main">${escapeHtml(w.word)}</div>
          <div class="word-phon cols">
            ${uk ? `<span class="phon-tag">英</span><span class="audio-btn mini" data-act="uk" data-word="${escapeHtml(w.word)}">${IC.volumeSm}</span><span class="phon-uk">${uk}</span>` : ''}
            ${us ? `<span class="phon-tag us">美</span><span class="audio-btn mini" data-act="us" data-word="${escapeHtml(w.word)}">${IC.volumeSm}</span><span class="phon-us">${us}</span>` : ''}
          </div>
          <div class="hint mt">选出正确中文释义：</div>
          <div id="opts">${q.options.map((o, i) => `<button class="opt" data-i="${i}">${formatMeaningHTML(o)}</button>`).join('')}</div>
          <div id="explain" class="example mt" style="display:none"></div>
        </div>`;
    } else if (q.type === 'zh2en') {
      body = `
        <div class="card">
          <div class="hint">请根据中文释义写出对应的英文单词：</div>
          <div class="meaning" style="font-size:18px;margin:16px 0">${formatMeaningHTML(w.meaning || '')}</div>
          <input type="text" class="typing" id="ans" placeholder="输入英文单词" autocomplete="off" autocorrect="off" spellcheck="false">
          <div id="feedback" class="mt" style="min-height:24px"></div>
          <button class="btn block mt" id="check">检查</button>
          <button class="btn gray block mt" id="skip" style="display:none">下一题 →</button>
        </div>`;
    } else {
      body = `
        <div class="card">
          <div class="hint">完形填空：选出合适的单词填入空白处</div>
          <div class="example" style="font-size:17px;line-height:1.9">${escapeHtml(q.sentence)}</div>
          <div id="opts">${q.options.map((o, i) => `<button class="opt" data-i="${i}">${escapeHtml(o)}</button>`).join('')}</div>
          <div id="explain" class="example mt" style="display:none"></div>
        </div>`;
    }
    view.innerHTML = head + body + `<button class="btn block mt" id="next2" ${q.type === 'zh2en' ? 'style="display:none"' : 'disabled'}>下一题 →</button>`;
    bindTypeBar();
    view.querySelectorAll('[data-act="uk"]').forEach((b) => b.onclick = () => ctx.playUK(b.dataset.word));
    view.querySelectorAll('[data-act="us"]').forEach((b) => b.onclick = () => ctx.playUS(b.dataset.word));

    if (q.type === 'zh2en') {
      const input = view.querySelector('#ans');
      input.focus();
      const check = () => {
        if (q.chosen !== null) return;
        const ok = normalizeInput(input.value) === normalizeInput(w.word);
        const fb = view.querySelector('#feedback');
        if (ok) {
          fb.innerHTML = `<span style="color:var(--ok);font-weight:700">${IC.checkSm}正确！</span>`;
        } else {
          fb.innerHTML = `<span style="color:var(--warn);font-weight:700">${IC.xSm}正确答案：${escapeHtml(w.word)}</span>`;
          sessionWrong.add(w.word);
        }
        // 三项门控：中译英 / 英译中 / 完形 三项全对才判定掌握
        ctx.recordTask(w.word, 'zh2en', ok);
        learnedWords.add(w.word);
        q.chosen = input.value;
        view.querySelector('#check').style.display = 'none';
        const skip = view.querySelector('#skip');
        skip.style.display = 'block';
        skip.textContent = idx < activeWords.length - 1 ? '下一题 →' : '完成';
        skip.onclick = () => advance();
        input.blur();
      };
      view.querySelector('#check').onclick = check;
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
      return;
    }

    const opts = view.querySelectorAll('.opt');
    opts.forEach((btn) => btn.addEventListener('click', () => {
      if (q.chosen !== null) return;
      const val = q.options[+btn.dataset.i];
      const correct = (val === q.answer);
      opts.forEach((b) => {
        const bv = q.options[+b.dataset.i];
        if (bv === q.answer) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
        b.disabled = true;
      });
      const exp = view.querySelector('#explain');
      exp.style.display = 'block';
      if (q.type === 'en2zh') {
        exp.innerHTML = (correct ? IC.checkSm + '正确！ ' : IC.xSm + '正确答案：' + escapeHtml(q.answer) + '。 ') + formatMeaningHTML(w.meaning);
      } else {
        exp.innerHTML = correct ? IC.checkSm + '正确！' : IC.xSm + '正确答案：' + escapeHtml(q.answer);
      }
      learnedWords.add(w.word);
      if (!correct) sessionWrong.add(w.word);
      // 三项门控：中译英 / 英译中 / 完形 三项全对才判定掌握
      ctx.recordTask(w.word, q.type, correct);
      q.chosen = val;
      const next = view.querySelector('#next2');
      next.style.display = 'block';
      next.disabled = false;
      next.onclick = () => advance();
      // 自动跳转（与阅读记一致）
      const delay = q.type === 'en2zh' ? 900 : 1100;
      setTimeout(() => { if (quizState === q && q.chosen === val) advance(); }, delay);
    }));
  }

  function advance() {
    idx++;
    if (idx >= activeWords.length) { mode = 'done'; render(); return; }
    quizState = makeQuiz(activeWords[idx]); render();
  }

  function renderDone() {
    const w = activeWords.length;
    const mastered = Object.keys(window.APP.progress.mastered).length;
    // 只累计曝光轮次；掌握判定统一由三项门控 recordTask 负责
    ctx.completeReadingSession(activeWords.map((w) => w.word), sessionWrong);
    view.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>${IC.checkSm}本轮完成！</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${w}</div><div class="lab">本组单词</div></div>
          <div class="stat"><div class="num warn">+${learnedWords.size}</div><div class="lab">学习星数 ${IC.starSm}</div></div>
          <div class="stat"><div class="num">${mastered}</div><div class="lab">累计掌握</div></div>
        </div>
        <div class="hint mt">本轮学习已计入星级与掌握进度；答错的词已自动进入「错词本」。</div>
        <button class="btn block mt" id="again">${IC.rotateSm}再练一轮</button>
        <button class="btn gray block mt" id="back">返回</button>
      </div>`;
    view.querySelector('#again').onclick = () => { mode = 'flash'; idx = 0; sessionWrong.clear(); learnedWords.clear(); render(); };
    view.querySelector('#back').onclick = () => window.dispatchEvent(new CustomEvent('goto', { detail: window.APP.page }));
  }

  render();
}
