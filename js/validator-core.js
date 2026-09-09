/**
 * 数据校验清洗核心（UMD：Node 后端与浏览器前端共用）
 * 对应需求第三章：入库强校验体系，根治 OCR 三类通病（不完整/粘连/乱序脏数据）
 * 输出字段均带质检溯源：is_valid / check_error_type / check_time / review_status
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./phonics-core.js'));
  } else {
    root.ValidatorCore = factory(root.PhonicsCore);
  }
})(typeof self !== 'undefined' ? self : this, function (PhonicsCore) {
  // ── 内置合法词表（高中常见词兜底比对，不依赖被导入数据，避免鸡生蛋）──
  const COMMON = (
    'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been being am has had does did doing would should could may might must shall will do does done ' +
    'happy sadness angry fear love hate hope dream school student teacher book learn study exam test knowledge memory practice habit goal plan success failure confident brave clever smart kind honest lazy busy free quiet loud fast slow easy difficult important necessary useful useless beautiful ugly rich poor healthy sick strong weak ' +
    'water fire earth air sun moon star sky cloud rain snow wind tree flower grass animal bird fish bird dog cat horse cow sheep pig chicken duck ' +
    'family father mother brother sister son daughter uncle aunt cousin grandparent child parent baby boy girl man woman people baby ' +
    'house home room door window bed chair table kitchen garden street city town village country world ' +
    'food rice bread meat egg milk fruit vegetable apple banana orange potato tomato soup sugar salt ' +
    'time hour minute second day week month year morning evening night today tomorrow yesterday spring summer autumn winter season ' +
    'number one two three four five six seven eight nine ten hundred thousand million color red blue green yellow black white gray ' +
    'good bad big small long short tall high low open close start stop move walk run jump fly swim ' +
    'speak talk say tell listen hear see watch read write draw sing dance play work rest sleep eat drink ' +
    'help care share give take bring send receive build break find lose keep change grow develop improve become ' +
    'think know understand believe remember forget decide choose agree disagree accept refuse ' +
    'before after during between under over above below beside near far inside outside front back left right ' +
    'because although though if unless whether while until since when where why how what who which ' +
    'international communication information technology education government organization observation preparation consideration examination ' +
    'unhappy disable unexpected unusual react action active activity actor actual advice advise affect afford afraid agreement allow appear apply appreciate appropriate arrange arrive artist assist assume attack attend attract available avoid aware awful ' +
    'baby back bad bag ball bank base basic bath bear beat beauty bed beg begin behave behind belief belong besides better beyond bill bird birth bit black block blood blow blue board boat body bone book born borrow boss both bottle bottom bowl box boy brain branch brave bread break breath bright bring brother brown brush build burn bus business busy ' +
    'cake call calm camera camp can candle cap car card care careful carry case cat catch cause cell center cent chance change charge cheap check cheer cheese chemical child chimney choice choose circle city class clean clear clever climate climb clock close cloud club coal coast coat code cold collect college color combine come comfort common compare compete complete composition computer condition consider contact contain continue control cook cool copy corner correct cost cotton cough count country couple course cover cow crayon crazy cream create cross crowded cry culture cup cure curious current cut ' +
    'damage danger dare dark daughter dead deal dear death decide deep degree depend describe desk destroy develop diamond dictionary die diet difference different difficult dig dinner direction dirty discover discuss disease distance dive divide do doctor dog doll dollar door double doubt down draw dream dress drink drive drop dry duck dull during dust duty ' +
    'each ear early earth east easy eat edge education effect egg eight either electric else end enemy energy engine enough enter environment equal equip escape even evening event ever every exact exam example except excite excuse exercise expect experience explain explore express extra eye ' +
    'face fact fail fair fall family famous far farm fast fat fault fear feed feel female fence fetch fever field fight fill film final find fine finger finish fire fish fit five fix flag flat floor flow flower fly focus follow food foot for force forest forget fork form free freeze fresh friend frighten frog from front fruit full fun funny future ' +
    'game gap garden gate gather general gentle gift girl give glad glass go goat gold good goose govern grade grain grand grass great green ground group grow guard guess guest guide gun ' +
    'habit hair half hall hand happen happy hard hat hate have head health hear heart heat heavy height help hen her hero hers hide high hill him hip hire hit hold hole home hope horse hospital hot hotel hour house how however huge human hundred hunger hunt hurry hurt husband ' +
    'ice idea idle ill imagine import important improve in include increase indeed industry info insect instead intend interest interview introduce invent invite iron island it its ' +
    'jacket jam jar job join joke journey joy judge juice jump just ' +
    'keep key kill kind king kiss kitchen kite knee knife knock know knowledge ' +
    'lady lake land language large last late laugh law lay lead leaf learn least leave left leg lend length less let letter level lie life lift light like line lion list listen little live lock lonely long look lose lot loud love low luck lucky lunch ' +
    'machine mad magic mail main make male man manage many map mark market marry match matter may maybe me mean measure meat medical meet member memory mend mention message metal method middle mile milk mind mine minute miss mistake mix model modern moment money monkey month moon more morning most mother mountain mouth move movie much murder music must my ' +
    'name narrow nation natural nature near neck need needle neighbor neither nerve net never new news next nice night nine no noble noise none nor north nose not note nothing notice now number nurse nut ' +
    'object ocean of off offer office often oil old on once one only open operate opinion opposite or order other our out outside over own owner ' +
    'pack page pain paint pair pal paper pardon parent park part party pass past path pay peace pen pencil people percent perfect perhaps person pet phone photo piano pick picture piece pig pile pin pink pipe place plan plane planet plant play please plenty pocket poem point poison police polite poor pop popular position possible post pot potato pound power practice praise prepare present president press pretty prevent price pride primary print prison private prize probable problem produce promise proper protect proud prove provide public pull punish purpose push put ' +
    'quality quarter queen question quick quiet quite ' +
    'rabbit race radio rain raise rather reach read ready real reason receive record red reduce refuse regard region regret relation remain remember remove rent repair repeat reply report rest result return rich ride right ring rise risk river road rock roll room root rope rose round row rubber rude rule run rush ' +
    'sad safe sail salad salt same sand save say scale school science scissors score sea search season seat second secret see seed seek seem sell send sense serve seven several shake shall shame shape share sharp she sheep shine ship shirt shoe shoot shop short should shoulder shout show shower shut sick side sight sign silent silk silly silver similar simple since sing single sink sir sister sit six size skill skin sky sleep slow small smart smell smile smoke snake snow so soap soccer social sock soft soil soldier some son song soon sort soul sound soup south space speak special speed spell spend spirit sport spread spring square staff stage stair stamp stand star start state station stay steal steam steel step stick still stomach stone stop store storm story street strong student study stupid subject succeed such sudden sugar suit summer sun supply support suppose sure surface surprise surround swallow sweater sweep sweet swim ' +
    'table tail take talk tall tap tape task taste teach team tear technology telephone television tell ten term test text than thank that the their them then there these they thin thing think third this those though thought thousand thread three through throw thus ticket tide tie tight till time tiny tired title to today toe together toilet tomato tomorrow tone tongue tonight too tool tooth top total touch tour toward town toy trade train travel treat tree trip trouble truck true try tube turn twelve twenty two ' +
    'ugly uncle under understand unit until up upon us use useful usual ' +
    'valley value various very vessel victory view village visit voice vote ' +
    'wait wake walk wall want war warm warn wash waste watch water wave way we weak wear weather wedding week weight welcome well west wet what wheat wheel when where which while white who whole whose why wide wife wild will win wind window wine wing winter wire wise wish with within without woman wonder wood word work world worry worse worst worth would wound write wrong ' +
    'yard year yellow yes yet you young your youth ' +
    'able about above accept act add adopt adult advance affect afford afraid agree aid aim alarm album alcohol alive allow alone along aloud alphabet amaze amount amuse angel anger angle ankle apart apple April apt area arm army arrow art article aside ask assist assume assure attach attack attend attract author auto autumn avoid awake award aware awful ' +
    'baby bake balance banana bank bar basic bath battery beach bean bear beat beauty bed bee beef beg begin being bell belt bench bend best better beyond bike bill bind bird birth blame blanket blind block blood blow blue board boast boat body bold bone bonus book boost boot border born borrow boss both bowl box brain brand brave bread break breath breeze brick bridge bright broken broom brother brown brush build bun burn bush business busy ' +
    'cabin cable cake call calm camp canal candle cane cap caption car carbon card care cargo carpet carrot cart case cash cast catch cause cave cell cement cent chain chair chalk challenge chamber chance change chant chaos charge charm chart chase cheap cheat check cheek cheer cheese chemical chest chick chief child chin chip chocolate choice choose circle city civil claim class clean clear clerk click client cliff climb clock close cloth cloud club clue coal coast coat code coin cold collar colony color column comb come comedy comic comfort command comment common company compare compete complete compose computer concept concern concert condition connect consider consist contact contain content contest context continue control cook cool copy cord corn corner correct cost cottage cotton count country couple course court cover cow crack craft crash crayon crazy cream create credit crew crime crop cross crowd crown cruel crush cry culture cup cure curl curtain custom cut cute cycle ' +
    'daily damage damp dance danger dare dark data date dawn dead deaf deal dear death debate debt decade decide deck declare deep defeat defend degree delay delight deliver demand dense deny depend deposit depth desert design desire desk detail detect develop device devil devote dial diary dice diet differ dig dinner direct dirt dirty discover disease dish dismiss distance dive division dock doctor document dog doll dollar dome donate door dot double doubt dough draft drag drain drama draw dream dress drift drill drink drive drop drown drug drum dry duck dull dump duration dust duty ' +
    'each eager eagle ear early earth ease east easy echo edge edit educate effect effort egg eight either elbow elder elect electric element elephant elevator eleven else email embrace emit empty enable enemy energy engage engine enough ensure enter entire entry envelope environment equal equip era error erupt escape essay estate evaluate even event evil exact exam example excellent exchange excite excuse exhibit exit expand expect expert explain explore export express extend extra eye ' +
    'fable face fact fade fail fair faith fall false fame familiar fan fancy farm fast fat fatal fault favor fear feast feature fee feed feel female fence fetch fever fiction field fierce figure file fill film filter final finance find fine finger finish fire firm first fish fit fix flag flame flash flat flavor flee fleet flesh flight float flood floor flow flower fluent fly focus fog fold folk follow food foot for force forest forever forge fork form format former fort fortune forum forward foul found frame free freeze frequent fresh friend frighten frog front frost fruit fuel full fun funny fur furnace furniture further future ' +
    'gain galaxy gallery game gap garage garden garlic gas gate gather gauge gender gene general gentle genuine germ get ghost giant gift ginger girl give glad glance glass glide globe glory glove go goat gold golf good goose grace grade grain grand grant grape grass grave gravity great green greet grey grid grief grind grip ground group grow guard guess guest guide guilt gun gut ' +
    'habit hair half hall hammer hand handle hang happen happy hard harm harvest hat hate have hawk head health heap hear heart heat heel height hello helmet help hen herb herd here hero hide high hill hint hire hit hold hole holiday hollow holy home honest honey honor hook hope horn horse host hotel hour house hover huge human humble humor hunt hurry hurt husband ' +
    'ice idea ideal idle ill image imagine impact import impress inch include income increase indeed index indoor industry infant infect inform initial injure inner input insect inside insist install instant instead instrument insult insult insurance intend interest internal interval interview introduce invent invest invite iron island issue item ' +
    'jacket jam jar jaw jazz jealous jean jelly jet jewel job join joke journey joy judge juice jump jungle junior just ' +
    'keen keep kettle key kick kid kill kind king kiss kitchen kite knee knife knight knit knob knot know knowledge ' +
    'label labor ladder lady lake lamb lamp land lane language large laser last late later laugh launch law lawn layer lazy lead leaf leak lean leap learn lease least leave led legend leg lemon lend length lens less let letter level liberal liberty library license lid lie life lift light like limit line link lion lip liquid list listen literal little live load local lock lodge log lonely long look loose lord lose loss lot loud love low lower loyal lucky lump lung ' +
    'machine mad magic mail main major make male mall manage mane many map march margin mark market marry mask mass master material matter maximum may maybe maze me mean measure meat medal media medical meet member memory mend mental mention menu mere message metal method middle midnight might mild mile milk mill mind mine minimum minister minor minute mirror miss mistake mix mode model moderate modern modest moment money monitor monkey month mood moon moral more morning mortal most mother motion motor mount mountain mouse mouth move movie much mud mug multiple murder muscle museum music must myth ' +
    'nail name narrow nation native nature navy near neat neck need needle negotiate neighbor neither nerve nest net never new news next nice night nine noble nod noise none noodle normal north nose not note nothing notice noun novel now number nurse nut ' +
    'oak object ocean odd off offer office officer offset often oil okay old on once one onion online only open operate opinion optical orange orbit order organize orbit other otherwise ought our out outer outline output outside oven over overall owe own owner oxygen ' +
    'pace pack page pain paint pair pal palace pale palm pan panel panic pant paper parade parent park part party pass past path patient pattern pause pay peace peach peak pen penalty pencil people pepper percent perfect perform perhaps period person pet phase phone photo phrase physical pick picture piece pig pile pill pilot pin pink pipe pity place plain plan plane planet plant plastic plate play please plenty plot plug plus pocket poem point poison polar pole police polite pollute pond pool poor pop popular port pose position positive possible post pot potato pour power practical practice praise predict prefer prepare present president press pretty prevent price pride primary print prison private prize probable problem produce product profit program project promise promote proof proper property protect proud prove provide public publish pull pump punish puppet pure purple purpose pursue push put ' +
    'qualify quality quarter queen question quick quiet quit quite quote ' +
    'rabbit race rack radar radio rail rain raise random range rank rapid rare rat rate rather raw reach react read ready real reason rebel recall receive recent recite recognize record recover red reduce reflect reform refuse regard region regret regular reject relation relax release relevant relief rely remain remember remind remove rent repair repeat reply report represent request require rescue research reserve resign resist resolve respect respond rest result retire return reveal reverse review reward rhythm rib rice rich rid ride ring riot ripe rise risk river road roar roast rob rock rocket role roll roof room root rope rose rough round route routine row royal rubber rude ruin rule run rural rush ' +
    'sad safe sail salad salary sale salt same sand savage save say scale scan scare scene scent scheme school science scissors score scout screen sea search season seat second secret section secure see seed seek seem seize select sell send sense serious serve set seven several shade shadow shake shall shallow shame shape share sharp she sheep sheet shelf shell shield shine ship shirt shock shoe shoot shop short should shoulder shout show shower shrink shut sick side sight sign silent silk silly silver similar simple since sing single sink sir sister sit six size skill skin skirt sky sleep sleeve slice slide slight slip slow small smart smell smile smoke smooth snake snow so soap soccer social sock soft soil soldier some son song soon sort soul sound soup south space spare spark speak special speed spell spend sphere spirit splash split sport spread spring square squeeze stable staff stage stair stamp stand star start state station stay steal steam steel step stick still stomach stone stop store storm story stove straight strain strange street stretch strict strike string strip strong structure student study stupid subject succeed such sudden sugar suggest suit summer sun supply support suppose sure surface surprise surround swallow sweater sweep sweet swell swim ' +
    'table tail take talk tall tap tape target task taste tax tea teach team tear technology telephone television tell ten term test text than thank that the their them then there these they thin thing think third this those though thought thousand thread three through throw thus ticket tide tie tight till time tiny tired title to today toe together toilet tomato tomorrow tone tongue tonight too tool tooth top total touch tour toward town toy trade train traffic trait travel treat tree trip trouble truck true try tube turn twelve twenty two ' +
    'ugly uncle under understand unit until up upon us use useful usual ' +
    'vacant vacation vacuum valley value valve various vast vegetable vehicle velocity verb verse very vessel vest victim victory video view village violation virtue virus visit visual voice vote ' +
    'wage waist wait wake walk wall want war warm warn wash waste watch water wave way we weak wear weather wedding week weight welcome well west wet what wheat wheel when where which while white who whole whose why wide wife wild will win wind window wine wing winter wire wise wish with within without woman wonder wood word work world worry worse worst worth would wound write wrong ' +
    'yard yarn year yellow yes yet you young your youth ' +
    'zone zoom'
  ).split(/\s+/).filter(Boolean);

  const COMMON_SET = new Set(COMMON.map((w) => w.toLowerCase()));

  // 高频「相邻词合并」专用拦截表：OCR 把两个独立词连写，首字母小写相接、无空格。
  // 此类连写长度通常不大，用阈值(>18)无法覆盖，且纯分词检测会误杀 together 类合法词，故单独精准拦截。
  const STICK_MAP = {
    goodmorning: 'good morning', goodnight: 'good night', takecare: 'take care',
    inthe: 'in the', atthe: 'at the', ofthe: 'of the', tothe: 'to the', forthe: 'for the', andthe: 'and the',
    inthemorning: 'in the morning', inthenight: 'in the night', thankyou: 'thank you', goodluck: 'good luck',
    seeyou: 'see you', lookat: 'look at', listento: 'listen to', turnon: 'turn on', turnoff: 'turn off',
    puton: 'put on', takeoff: 'take off', getup: 'get up', wakeup: 'wake up', giveup: 'give up',
    hurryup: 'hurry up', standup: 'stand up', sitdown: 'sit down', comefrom: 'come from',
    goto: 'go to', wantto: 'want to', haveto: 'have to', needto: 'need to', usedto: 'used to',
    fora: 'for a', isa: 'is a', wasa: 'was a', ares: 'are s', ofcourse: 'of course',
  };

  function splitIntoValid(w) {
    // DP：能否把整词干净拆分为 >=2 个合法片段（每段在 COMMON_SET）
    const n = w.length;
    const dp = new Array(n + 1).fill(false); dp[0] = true;
    const cut = new Array(n + 1).fill(-1);
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < i; j++) {
        if (dp[j] && COMMON_SET.has(w.slice(j, i))) { dp[i] = true; cut[i] = j; break; }
      }
    }
    if (dp[n] && n > 0) {
      const parts = []; let i = n;
      while (i > 0) { const j = cut[i]; parts.push(w.slice(j, i)); i = j; }
      parts.reverse();
      if (parts.length >= 2 && parts.every((p) => p.length >= 2)) return parts.join(' ');
    }
    return null;
  }

  function normalizeWord(w) {
    return (w || '').toString().replace(/[\s　]+/g, '').replace(/[，。、；：,.!?;:'"()（）\[\]【】]/g, '');
  }

  // ── 规则1：单词粘连识别 ──
  function checkSticking(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return { stuck: false };
    // 1) 高频相邻词合并专用拦截（精准，不误杀正常短词）
    if (STICK_MAP[w]) return { stuck: true, suggestions: [STICK_MAP[w]] };
    // 2) 整词在合法词表 → 合法
    if (COMMON_SET.has(w)) return { stuck: false };
    // 3) 长度阈值：连续字母 > 18 判定大概率粘连
    if (w.length > 18) {
      const suggest = splitIntoValid(w);
      if (suggest) return { stuck: true, suggestions: [suggest] };
      return { stuck: true, suggestions: [] };
    }
    return { stuck: false };
  }

  // ── 规则2：内容完整性 ──
  function checkCompleteness(rec) {
    const issues = [];
    if (!rec.word || normalizeWord(rec.word).length < 1) issues.push('空单词');
    if (!rec.meaning || rec.meaning.trim().length < 1) issues.push('空释义');
    if (!rec.example || rec.example.trim().length < 3) issues.push('缺失例句');
    if (!rec.exampleCn || rec.exampleCn.trim().length < 1) issues.push('缺失例句翻译');
    // 例句截断判定：英例句末无标点且明显半截
    const ex = (rec.example || '').trim();
    if (ex && !/[.!?。！？]$/.test(ex) && ex.length < 6) issues.push('例句疑似截断');
    if (rec.meaning && rec.meaning.trim().length < 2 && /^[a-zA-Z一-龥]$/.test(rec.meaning.trim())) issues.push('释义过短/仅单字');
    return issues;
  }

  // ── 规则3：脏数据清洗 ──
  function cleanDirty(rec) {
    const reasons = [];
    let word = (rec.word || '').toString();
    // 清首尾空格/多余空格/换行/制表符
    word = word.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const meaning = (rec.meaning || '').toString().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const example = (rec.example || '').toString().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const exampleCn = (rec.exampleCn || '').toString().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // 过滤：纯符号、纯数字、空
    if (/^[\W_]+$/.test(word)) reasons.push('纯符号单词');
    if (/^\d+$/.test(word.replace(/[^\d]/g, '')) && word.replace(/[^\d]/g, '') === word) reasons.push('纯数字');
    if (!word) reasons.push('空白单词');
    if (reasons.length) return { ok: false, reasons, rec: rec };
    return { ok: true, rec: { ...rec, word, meaning, example, exampleCn } };
  }

  // 统计类：去重
  function run(raw) {
    const records = Array.isArray(raw) ? raw : (raw && raw.words ? raw.words : []);
    const report = {
      total: records.length,
      passed: [],
      rejected: [],
      stats: { stuck: 0, incomplete: 0, dirty: 0, duplicate: 0, passed: 0 },
      log: {
        normalCount: 0,
        stuckList: [],
        incompleteList: [],
        duplicateCount: 0,
        passedWords: [],
      },
      generatedAt: Date.now(),
    };
    const seen = new Set();
    for (const item of records) {
      // 结构容错：支持数组 [word, meaning, example, exampleCn] 或对象
      let rec = item;
      if (Array.isArray(item)) {
        rec = { word: item[0], meaning: item[1], example: item[2], exampleCn: item[3], category: item[4] || '' };
      }
      if (!rec || typeof rec !== 'object') continue;

      // 规则3 脏数据清洗（先清洗再判断）
      const cleaned = cleanDirty(rec);
      if (!cleaned.ok) {
        report.rejected.push({ word: rec.word || '', reason: cleaned.reasons.join('；'), type: 'dirty' });
        report.stats.dirty++;
        report.log.duplicateCount++;
        continue;
      }
      rec = cleaned.rec;

      // 去重
      const key = rec.word.toLowerCase();
      if (seen.has(key)) {
        report.rejected.push({ word: rec.word, reason: '重复单词', type: 'duplicate' });
        report.stats.duplicate++;
        continue;
      }
      seen.add(key);

      // 规则1 粘连
      const stick = checkSticking(rec.word);
      if (stick.stuck) {
        report.rejected.push({
          word: rec.word,
          reason: '疑似粘连错词' + (stick.suggestions.length ? '，建议拆分: ' + stick.suggestions.join(' / ') : '（无可拆分建议，需人工复核）'),
          type: 'stick',
        });
        report.stats.stuck++;
        report.log.stuckList.push(rec.word);
        continue;
      }

      // 规则2 完整性
      const incomp = checkCompleteness(rec);
      if (incomp.length) {
        report.rejected.push({ word: rec.word, reason: '字段残缺: ' + incomp.join('；'), type: 'incomplete' });
        report.stats.incomplete++;
        report.log.incompleteList.push(rec.word);
        continue;
      }

      // 规则4 结构化合规（英文在前释义在后由字段语义保证，这里补 phonetic 缺省与拼读重渲染）
      const word = normalizeWord(rec.word);
      const rec2 = {
        word,
        phoneticUk: rec.phoneticUk || rec.phonetic || '',
        phoneticUs: rec.phoneticUs || rec.phonetic || '',
        phonics: PhonicsCore ? PhonicsCore.render(word) : (rec.phonics || ''),
        meaning: rec.meaning,
        example: rec.example,
        exampleCn: rec.exampleCn,
        category: rec.category || rec.cat || '',
        articleId: rec.articleId || rec.article_id || '',
        is_valid: true,
        check_error_type: '',
        check_time: Date.now(),
        review_status: '已合规',
      };
      report.passed.push(rec2);
      report.stats.passed++;
      report.log.normalCount++;
      report.log.passedWords.push(word);
    }
    report.log.duplicateCount = report.stats.duplicate;
    return report;
  }

  return { run, checkSticking, checkCompleteness, cleanDirty, normalizeWord, COMMON };
});
