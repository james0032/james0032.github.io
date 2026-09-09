import { runWordQuiz } from '../quiz.js';
import { escapeHtml, formatPhonetic, commonMeaning, IC } from '../ui.js';
import { currentAlgo, queueFor, assignQuota, schedInfo, dailyRemain, describeDue, dueTs, ALGOS } from '../scheduler.js';

// 错词本：记录「做错的单词」（不是题目），与生词本同样的列表样式：单词 + 音标 + 常用释义。
// 收录的词不可手动点叉删除；「何时推荐、何时移出」由系统设置里的复习算法决定：
//   - 3 次错误移除：全量推荐（每天每词只刷一轮），三项练习连续 3 轮全对移出
//   - 艾宾浩斯 6 轮：只推荐到期的词，每轮全对自动进入下一轮（1天→2天→4天→7天→15天→30天）
//   - FSRS：只推荐到期的词，按记忆强度动态安排，间隔 ≥ 21 天毕业
function isMastered(word) {
  return !!(window.APP && window.APP.progress && window.APP.progress.mastered && window.APP.progress.mastered[String(word || '').toLowerCase()]);
}

export default {
  render({ view, APP, ctx }) {
    draw();
    function draw() {
      const p = APP.progress;
      if (!p.wrongBook) p.wrongBook = [];
      if (!p.wrongRound) p.wrongRound = {};
      const algo = currentAlgo();
      const meta = ALGOS[algo];
      const isW3 = algo === 'wrong3';
      // wrong3 模式保留「每天每词只刷一轮」；艾宾浩斯/FSRS 按到期调度（当天多轮到期不受此限）
      if (isW3) {
        if (!p.wrongDaily) p.wrongDaily = { date: '', words: [] };
        const today = ctx.todayStr();
        if (p.wrongDaily.date !== today) p.wrongDaily = { date: today, words: [] };
      }
      // 已判掌握的单词不再出现在错词本
      const words = p.wrongBook
        .map((w) => ((APP.library && APP.library.words) || []).find((x) => x.word.toLowerCase() === String(w).toLowerCase()))
        .filter(Boolean)
        .filter((w) => !isMastered(w.word));
      if (!words.length) {
        view.innerHTML = '<div class="card">' + IC.bookX + '错词本是空的，很棒！<br/>练习中做错的单词会自动进到这里，按「' + meta.name + '」安排复习，达标后自动移出。</div>';
        return;
      }

      // 今日待复习队列（按当前算法）
      let queue;
      let hint;
      if (isW3) {
        // 全量推荐：剔除当天已练过的词，再按每日学习总量截断
        queue = assignQuota(queueFor(words.filter((w) => !(p.wrongDaily.words || []).some((x) => String(x).toLowerCase() === w.word.toLowerCase()))));
        ctx.saveProgress();
        hint = '做错的词自动收录，<b>不可手动删除</b>；三项练习（中译英 / 英译中 / 完形填空）各对一遍算一轮，<b>连续全对 3 轮</b>自动移出。<br/><b>每天每个词只刷一轮</b>：今天已练过或额度已满的词不再出现（今天不可练 ' + (words.length - queue.length) + ' 词）。';
      } else {
        // 艾宾浩斯 / FSRS：只推荐「已到期」的词（按到期时间先后），再按每日学习总量截断
        queue = assignQuota(queueFor(words));
        ctx.saveProgress();
        const dueNow = words.filter((w) => dueTs(w.word) <= Date.now()).length;
        hint = '复习算法：<b>' + meta.name + '</b>，按记忆节奏自动推荐到期的单词（当前到期 ' + dueNow + ' 词，今日剩余额度 ' + dailyRemain() + ' 词）。';
      }

      view.innerHTML = `
        <div class="section-title">${IC.bookX}错词本 · ${words.length} 词</div>
        <div class="hint" style="margin:-4px 0 10px">${hint}</div>
        <button class="btn block soft" id="study">${IC.targetSm}${isW3 ? '专项重练错词本（今天可练 ' + queue.length + ' 词）' : '开始今日到期复习（' + queue.length + ' 词）'}</button>
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
        let roundPill;
        if (isW3) {
          const prog = p.wrongRound[String(w.word).toLowerCase()] || { t: {}, n: 0 };
          const n = Math.min(prog.n || 0, 3);
          const doneTasks = ['zh2en', 'en2zh', 'cloze'].filter((k) => prog.t && prog.t[k]).length;
          roundPill = `<span class="wb-round ${n >= 3 ? 'done' : ''}" title="本轮三项已完成 ${doneTasks}/3，连续全对 ${n}/3 轮">${n}/3 轮 · 本轮 ${doneTasks}/3</span>`;
        } else {
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
          <span class="nb-lock" title="错词本的词不可手动删除，按「${meta.name}」达标后自动移出">${IC.lockSm}</span>
        `;
        list.appendChild(row);
      });
      // 点击行：弹出完整单词卡片
      list.querySelectorAll('.nb-item').forEach((item) => {
        item.addEventListener('click', () => ctx.showWordCard(item.dataset.word));
      });
      // 开始练习
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
        studyBtn.onclick = () => runWordQuiz(ctx, view, queue, '错词本', { source: 'wrongbook' });
      }
    }
  },
};
