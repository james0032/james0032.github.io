import { runWordQuiz } from '../quiz.js';
import { escapeHtml, formatPhonetic, commonMeaning, IC } from '../ui.js';
import { currentAlgo, queueFor, assignQuota, schedInfo, dailyRemain, describeDue, dueTs, ALGOS } from '../scheduler.js';

function isMastered(word) {
  return !!(window.APP && window.APP.progress && window.APP.progress.mastered && window.APP.progress.mastered[String(word || '').toLowerCase()]);
}

export default {
  render({ view, APP, ctx }) {
    const p = APP.progress;
    const algo = currentAlgo();
    const meta = ALGOS[algo];
    // 已判掌握的单词不再出现在生词本
    const words = (p.notebook || [])
      .map((w) => ((APP.library && APP.library.words) || []).find((x) => x.word.toLowerCase() === w.toLowerCase()))
      .filter(Boolean)
      .filter((w) => !isMastered(w.word));
    if (!words.length) {
      view.innerHTML = '<div class="card">' + IC.star + '生词本还是空的。<br/>在任意单词卡片点「生词本」即可收藏，随时来这里专项复习。<br/><span class="hint">做错的词会自动进入「错词本」，不会混进生词本；已掌握的单词会自动隐藏。</span></div>';
      return;
    }
    // 今日待复习队列（按当前复习算法推荐）
    const queue = assignQuota(queueFor(words));
    ctx.saveProgress();
    const isW3 = algo === 'wrong3';
    const hint = isW3
      ? '只收录你主动收藏的词，全部可点 <b>×</b> 取消收藏；三项练习连续 3 轮全对即判定掌握。'
      : '复习算法：<b>' + meta.name + '</b>，按记忆节奏推荐到期的单词（今日剩余额度 ' + dailyRemain() + ' 词）；每轮全对自动进入下一轮复习任务，达标后判定掌握。';
    view.innerHTML = `
      <div class="section-title">${IC.star}生词本 · ${words.length} 词</div>
      <div class="hint" style="margin:-4px 0 10px">${hint}</div>
      <button class="btn block soft" id="study">${IC.targetSm}${isW3 ? '专项复习生词本（' + queue.length + ' 词）' : '开始今日到期复习（' + queue.length + ' 词）'}</button>
      <div id="list" class="nb-list mt"></div>
    `;
    const list = view.querySelector('#list');
    words.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'nb-item';
      row.dataset.word = w.word;
      const uk = formatPhonetic(w.phoneticUk || w.phonetic || '');
      const us = formatPhonetic(w.phoneticUs || '');
      const phon = (uk || us)
        ? `<div class="nb-phon">${uk ? `<span class="phon-tag">英</span><span class="phon-uk">${uk}</span>` : ''}${us ? `<span class="phon-tag us">美</span><span class="phon-us">${us}</span>` : ''}</div>`
        : '';
      const brief = commonMeaning(w.meaning) || w.meaning || '';
      let roundPill = '';
      if (!isW3) {
        const info = schedInfo(w.word) || { text: '' };
        roundPill = `<span class="wb-round ${info.done ? 'done' : ''}">${escapeHtml(info.text)}</span>`;
      }
      row.innerHTML = `
        <div class="nb-main">
          <div class="nb-word">${escapeHtml(w.word)}</div>
          ${phon}
          <div class="nb-meaning">${escapeHtml(brief)}</div>
          ${w.example ? `<div class="nb-example"><span class="nb-ex">${escapeHtml(w.example)}</span>${w.exampleCn ? `<span class="nb-ex-cn">${escapeHtml(w.exampleCn)}</span>` : ''}</div>` : ''}
          ${roundPill}
        </div>
        <button class="nb-del" data-word="${escapeHtml(w.word)}" title="移出生词本" aria-label="移出生词本">×</button>
      `;
      list.appendChild(row);
    });
    // 点击行：弹出完整单词卡片（发音/词形/搭配等）
    list.querySelectorAll('.nb-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.nb-del')) return;
        ctx.showWordCard(item.dataset.word);
      });
    });
    // 删除
    list.querySelectorAll('.nb-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.toggleNotebook(btn.dataset.word);
        render({ view, APP, ctx }); // 重新渲染列表
      });
    });
    const studyBtn = view.querySelector('#study');
    if (!queue.length) {
      studyBtn.disabled = true;
      studyBtn.classList.add('disabled');
      const nextDue = words.reduce((min, w) => {
        const d = dueTs(w.word);
        return (d > Date.now() && (min === 0 || d < min)) ? d : min;
      }, 0);
      studyBtn.innerHTML = IC.moonSm + (nextDue ? '暂无到期复习，下次 ' + describeDue(nextDue) : '今天额度已用完，明天再来');
    } else {
      studyBtn.onclick = () => runWordQuiz(ctx, view, queue, '生词本', { source: 'notebook' });
    }
  },
};
