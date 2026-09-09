import { escapeHtml, IC } from '../ui.js';

export default {
  render({ view, APP, ctx }) {
    view.innerHTML = `
      <div class="section-title">${IC.upload}单词导入 · 入库强校验</div>
      <div class="card">
        <h2>① 批量结构化导入（Workbuddy 识别输出）</h2>
        <div class="hint">
          支持 JSON 数组：<br/>
          <code>[{ "word":"happy", "meaning":"adj.快乐的", "example":"She is happy.", "exampleCn":"她很快乐。", "phoneticUk":"/ˈhæpi/", "category":"情绪" }]</code><br/>
          也支持 制表符/逗号 文本：<code>happy\tadj.快乐的\tShe is happy.\t她很快乐。</code>
        </div>
        <textarea id="src" rows="8" placeholder="在此粘贴 JSON 或文本…"></textarea>
        <div class="row mt">
          <button class="btn ghost" id="pick">${IC.fileTextSm}选择文件</button>
          <input type="file" id="file" accept=".json,.csv,.txt" style="display:none" />
          <button class="btn" id="check">${IC.eyeSm}校验预览</button>
        </div>
        <div id="report" class="report mt" style="display:none"></div>
        <button class="btn block mt" id="doImport" style="display:none">${IC.checkSm}确认入库（仅合格数据）</button>
      </div>

      <div class="card">
        <h2>② 自定义单词（自动补全全套词典信息）</h2>
        <div class="hint">每行一个单词，系统调用有道自动补全音标/释义/例句，再经校验入库（≤50 词/次）。</div>
        <textarea id="words" rows="5" placeholder="apple&#10;banana&#10;computer"></textarea>
        <button class="btn soft block mt" id="autoFill">${IC.zapSm}自动补全并入库</button>
        <div id="autoReport" class="report mt" style="display:none"></div>
      </div>
    `;

    const $ = (s) => view.querySelector(s);
    $('#pick').onclick = () => $('#file').click();
    $('#file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const txt = await f.text();
      $('#src').value = txt;
      ctx.toast('已读取文件，点击校验预览');
    };
    $('#check').onclick = () => {
      const raw = parseInput($('#src').value);
      if (!raw.length) { ctx.toast('没有可解析的内容'); return; }
      const report = window.ValidatorCore.run(raw);
      renderReport($('#report'), report);
      $('#report').style.display = 'block';
      $('#doImport').style.display = 'block';
      $('#doImport').dataset.payload = JSON.stringify(report.passed);
    };
    $('#doImport').onclick = async () => {
      const passed = JSON.parse($('#doImport').dataset.payload || '[]');
      const r = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: passed }),
      });
      const j = await r.json();
      ctx.toast('入库完成，新增 ' + (j.added ?? 0) + ' 词');
      // 重新加载词库
      const lib = await (await fetch('/api/library')).json();
      APP.library = lib;
      ctx.refreshHeader();
    };

    $('#autoFill').onclick = async () => {
      const lines = $('#words').value.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
      if (!lines.length) { ctx.toast('请输入单词'); return; }
      const rep = $('#autoReport'); rep.style.display = 'block'; rep.innerHTML = '⏳ 正在调用有道补全（' + lines.length + ' 词）…';
      const recs = [];
      for (const w of lines) {
        try {
          const r = await fetch('/api/dict?word=' + encodeURIComponent(w));
          const j = await r.json();
          const d = j.data;
          if (d && (d.pos.length || d.phonetic)) {
            const meaning = d.pos.map((p) => p.pos + ' ' + p.def).join('；') || d.phonetic;
            recs.push({ word: w, meaning, example: d.examples[0]?.en || '', exampleCn: d.examples[0]?.cn || '', phoneticUk: d.uk, phoneticUs: d.us });
          } else {
            recs.push({ word: w, meaning: '（有道未返回，需手动补充）', example: '', exampleCn: '' });
          }
        } catch (e) {
          recs.push({ word: w, meaning: '（网络异常）', example: '', exampleCn: '' });
        }
      }
      const report = window.ValidatorCore.run(recs);
      renderReport(rep, report);
      const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: report.passed }) });
      const j = await r.json();
      ctx.toast('自动补全入库完成，新增 ' + (j.added ?? 0) + ' 词');
      const lib = await (await fetch('/api/library')).json();
      APP.library = lib;
      ctx.refreshHeader();
    };
  },
};

function parseInput(text) {
  text = (text || '').trim();
  if (!text) return [];
  // 尝试 JSON
  if (text.startsWith('[') || text.startsWith('{')) {
    try { const j = JSON.parse(text); return Array.isArray(j) ? j : (j.words || []); } catch (e) { /* fallthrough */ }
  }
  // 文本：按行，按制表符/逗号分列
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(/\t|[,，]/).map((s) => s.trim());
    if (parts.length >= 2) {
      out.push({ word: parts[0], meaning: parts[1], example: parts[2] || '', exampleCn: parts[3] || '', category: parts[4] || '' });
    } else if (parts.length === 1) {
      out.push({ word: parts[0], meaning: '', example: '', exampleCn: '' });
    }
  }
  return out;
}

function renderReport(el, report) {
  const s = report.stats;
  el.innerHTML = `
    <div class="r-row"><span>总记录</span><b>${report.total}</b></div>
    <div class="r-row r-ok"><span>${IC.checkSm}合格入库</span><b>${s.passed}</b></div>
    <div class="r-row r-bad"><span>${IC.alertSm}疑似粘连错词</span><b>${s.stuck}</b></div>
    <div class="r-row r-bad"><span>${IC.alertSm}字段残缺</span><b>${s.incomplete}</b></div>
    <div class="r-row r-bad"><span>${IC.alertSm}脏数据/空</span><b>${s.dirty}</b></div>
    <div class="r-row r-bad"><span>${IC.alertSm}重复</span><b>${s.duplicate}</b></div>
    ${report.log.stuckList.length ? `<div class="hint mt">粘连疑似词：${escapeHtml(report.log.stuckList.join(', '))}</div>` : ''}
    ${report.log.incompleteList.length ? `<div class="hint">残缺词：${escapeHtml(report.log.incompleteList.join(', '))}</div>` : ''}
    <div class="hint mt">仅合格数据入库，异常数据已拦截，请人工修正后重新导入。</div>
  `;
}
