/**
 * 自然拼读渲染核心（UMD：Node 与浏览器通用）
 * 规则固化：
 *  1) 重读音节全部大写
 *  2) 双元音组合不拆分 (ee/ea/ai/ay/ou/ow/oi/oy/ie/ui 等)
 *  3) 词根词缀整体不切割
 *  4) 末尾"辅音+元音"组合不拆分
 *  5) 不切割单个字母、不割裂音节单元
 * 输出：按音节拆分、重读音节大写的拼读字符串，例如 beautiful -> BEAU-ti-ful
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PhonicsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const VOWELS = 'aeiouy';
  const DIPHTHONGS = ['ee', 'ea', 'ai', 'ay', 'ou', 'ow', 'oi', 'oy', 'ie', 'ui', 'oa', 'oo', 'au', 'aw', 'ew', 'eu', 'ei', 'ey', 'igh', 'ough', 'aught', 'augh', 'eigh'];
  const PREFIXES = ['un', 're', 'in', 'im', 'dis', 'pre', 'pro', 'ex', 'de', 'con', 'com', 'non', 'mis', 'over', 'under', 'sub', 'super', 'inter', 'trans', 'anti', 'bio', 'geo', 'tele', 'fore', 'en', 'em', 'be', 'out', 'up'];
  const SUFFIXES = ['tion', 'sion', 'nion', 'ship', 'ment', 'ness', 'ful', 'less', 'able', 'ible', 'ance', 'ence', 'al', 'ous', 'ive', 'er', 'or', 'ist', 'ly', 'ty', 'cy', 'ic', 'ize', 'ise', 'en', 'ed', 'ing', 'es', 's', 'y', 'ward', 'wise'];

  function isVowel(ch) { return VOWELS.indexOf(ch.toLowerCase()) >= 0; }
  function isConsonant(ch) { return ch && !isVowel(ch) && /[a-z]/i.test(ch); }

  // 划分音节：返回音节数组（小写）
  function splitSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return [];
    if (word.length <= 3) return [word];

    let prefix = '', root = word, suffixes = [];

    // 1) 头部提取前缀（com/con/un 等整体保留）
    for (const p of PREFIXES) {
      if (word.startsWith(p) && word.length >= p.length + 2) {
        const rem = word.slice(p.length);
        // 特例：un + ion/nion 时让后缀 nion 整体保留，避免 union 被拆成 un-I-on
        if (p === 'un' && (rem === 'ion' || rem.endsWith('nion'))) continue;
        prefix = p; root = rem; break;
      }
    }

    // 2) 长后缀（≥3 字母：tion/sion/ship/nion/ment/ing/ness/ful…）可迭代提取，
    //    整体保留不拆开（如 relationship → relation+ship，内部 tion 也整体保留）
    let longExtracted = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of SUFFIXES) {
        if (s.length < 3) continue;
        if (root.length - s.length >= 1 && root.endsWith(s)) {
          suffixes.unshift(s); root = root.slice(0, -s.length); longExtracted = true; changed = true; break;
        }
      }
    }

    // 3) 短后缀（er/or/ed/s/es/y/en/ly…）最多提取一个，避免 en/ist 被链式撕碎；
    //    若已提取长后缀（如 sion），跳过 s/es 以免重复计数（pres+s+ion → pres+sion）
    for (const s of SUFFIXES) {
      if (s.length >= 3) continue;
      if ((s === 's' || s === 'es') && longExtracted) continue;
      if (root.length - s.length >= 3 && root.endsWith(s)) {
        suffixes.unshift(s); root = root.slice(0, -s.length); break;
      }
    }

    const syls = splitCore(root);
    const result = [];
    if (prefix) result.push(prefix);
    result.push(...syls);
    result.push(...suffixes);
    return result.filter(Boolean);
  }

  function splitCore(w) {
    // 保护双元音不被切开
    const protectedZones = [];
    const lower = w;
    DIPHTHONGS.forEach((d) => {
      let idx = lower.indexOf(d);
      while (idx >= 0) {
        protectedZones.push([idx, idx + d.length]);
        idx = lower.indexOf(d, idx + 1);
      }
    });
    function inProtected(i) {
      return protectedZones.some(([s, e]) => i >= s && i < e);
    }

    // 标记元音位置
    const vowelPos = [];
    for (let i = 0; i < w.length; i++) {
      if (isVowel(w[i]) && !inProtected(i)) vowelPos.push(i);
    }

    if (vowelPos.length === 0) return [w];
    if (vowelPos.length === 1) {
      // 单音节：末尾辅元？保持整体；这里整词一个音节
      return [w];
    }

    // 在元音之间按 V/CV 划分（取两个元音之间辅音的前一个元音后切）
    const cuts = [];
    for (let k = 0; k < vowelPos.length - 1; k++) {
      const a = vowelPos[k];
      const b = vowelPos[k + 1];
      const between = w.slice(a + 1, b);
      if (between.length === 0) {
        cuts.push(a + 1); // VV -> 在第一个元音后切（但双元音已被保护，故少见）
      } else if (between.length === 1) {
        cuts.push(a + 1); // VC V -> 元音后切（VC|V）
      } else if (between.length === 2) {
        // 两个辅音：VCCV，在两个辅音之间切，但若两个辅音相同则切开；否则按 VCC|V 倾向切在中间
        cuts.push(a + 2);
      } else {
        // 多个辅音：VCCC...V 在最后一个辅音前切（VCC|C V）
        cuts.push(b - 1);
      }
    }

    const result = [];
    let start = 0;
    cuts.sort((x, y) => x - y);
    for (const c of cuts) {
      if (c > start && c < w.length) {
        result.push(w.slice(start, c));
        start = c;
      }
    }
    result.push(w.slice(start));
    return result.filter(Boolean);
  }

  // 重音规则：默认多音节词倒数第二音节重读；单音节全部重读
  function stressIndex(syllables) {
    if (syllables.length <= 1) return 0;
    // 特例：以 -tion/-sion/-ic 等结尾，重音在前一音节（已纳入倒数第二）
    return syllables.length - 2;
  }

  // 不把单个元音字母单独拆成一个音节（尤其末尾 y/i/o 等）
  function mergeLonelyVowels(syls) {
    if (syls.length < 2) return syls;
    const res = syls.slice();
    function isLonely(s) { return s.length === 1 && isVowel(s[0]); }
    // 首音节孤立元音，并入下一个
    if (isLonely(res[0])) {
      res[1] = res[0] + res[1];
      res.shift();
    }
    // 尾音节孤立元音，并入前一个
    if (res.length >= 2 && isLonely(res[res.length - 1])) {
      res[res.length - 2] = res[res.length - 2] + res[res.length - 1];
      res.pop();
    }
    return res;
  }

  function render(word) {
    let syls = splitSyllables(word);
    if (syls.length === 0) return word;
    syls = mergeLonelyVowels(syls);
    const si = stressIndex(syls);
    const out = syls.map((s, i) => (i === si ? s.toUpperCase() : s));
    return out.join('-');
  }

  return { render, splitSyllables, stressIndex, isVowel, isConsonant };
});
