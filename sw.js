/* 搞定英语 · Service Worker
 * 目的：GitHub Pages 强制 `Cache-Control: max-age=600`（仅 10 分钟），
 *       导致每次冷启动都要重新下载资源。SW 缓存不受 max-age 约束，
 *       命中后本地直读，二次进入近乎瞬开。
 *
 * 策略：
 *   - 导航请求（HTML）：network-first —— 保证发版后立即拿到新版本，离线回退缓存
 *   - 同源静态资源（js/css/img/data）：cache-first —— 这些 URL 都带 ?v= 版本号，
 *     发版换号即换 URL，天然不会读到旧内容
 *   - /audio/<word>.mp3：**同源音频代理** —— 内部 no-cors 取有道发音，把跨域音频
 *     伪装成本站同源资源（媒体元素能播 opaque 响应，Chromium 实测通过）。
 *     动机：夸克/UC 内核会本机直接拒绝加载「跨域远端媒体」（瞬间 mediaErr4，连请求都不发），
 *           同源 URL 不在其拦截范围内 → 这是夸克上唯一能出声的网络通道。
 *     顺带缓存这层 opaque 响应 → 同一个词再播零网络、离线也能重复听。
 *   - 其它（跨域 / 非 GET / /api/*）：直接放行，不干预
 *
 * 版本：注册时以 /sw.js?v=<版本> 传入，版本变化才会触发更新，
 *       激活时清掉旧版本缓存，避免词库缓存越积越多。
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'hv-' + VERSION;
const HTML_NET_TIMEOUT = 8000;

// 预缓存：启动骨架 + 词库「核心重字段」（功能页必需的释义/音标/分类/PEP）。
// 只放这两个，extra 层（搭配/例句，词卡专用）交给运行时按需缓存。
const PRECACHE = ['/index.html', '/css/style.css', '/js/lib-core.js?v=' + VERSION];

self.addEventListener('install', (e) => {
  // 逐个 add（不用 addAll）：单个失败不影响其它资源，避免整批回滚导致什么都没缓存
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // ⚠️ 别把发音缓存 hv-audio 一起清掉（它按词长期复用，与发版无关）
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hv-') && k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return /\.(?:js|css|png|jpe?g|webp|svg|gif|ico|json|woff2?|ttf|mp3|m4a)$/i.test(url.pathname);
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTML_NET_TIMEOUT);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    // 导航回退到缓存的首页（避免离线白屏）
    if (req.mode === 'navigate') {
      const home = await cache.match('/index.html');
      if (home) return home;
    }
    throw err;
  }
}

/* ---------- 同源音频代理：/audio/<word>.mp3?t=<1|2> → 有道发音 ---------- */
const AUDIO_CACHE = 'hv-audio';
const AUDIO_MAX = 600;        // 最多缓存多少个词的发音（每个约 10KB，量级 ~6MB 上限）
const AUDIO_TIMEOUT = 8000;

async function audioTrim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= AUDIO_MAX) return;
    for (let i = 0; i <= keys.length - AUDIO_MAX; i++) await cache.delete(keys[i]);
  } catch (e) { /* ignore */ }
}

async function audioProxy(req, url) {
  let cache = null;
  try { cache = await caches.open(AUDIO_CACHE); } catch (e) { cache = null; }
  if (cache) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
  }
  // 仓库里提交的静态对照文件（probe.mp3，用于「设置→通道诊断」的同源·静态对照组），
  // 直接走静态缓存，不经有道代理——用于验证「内核能否播放同源静态文件」这一维度。
  // 文件名必须以普通字母开头：GitHub Pages 默认跑 Jekyll，会静默丢弃 _ 开头的文件（_probe.mp3 曾因此 404）。
  const m = url.pathname.match(/^\/audio\/(.+)\.mp3$/);
  if (!m) return cacheFirst(req);
  const word = decodeURIComponent(m[1]);
  if (word === 'probe') return cacheFirst(req);   // 静态对照文件：同源、走 Pages，不经有道
  const type = url.searchParams.get('t') === '1' ? '1' : '2';
  const target = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + type;
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) { /* ignore */ } }, AUDIO_TIMEOUT);
  try {
    const res = await fetch(target, { mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(timer);
    if (cache && res && (res.ok || res.type === 'opaque')) {
      try { cache.put(req, res.clone()).then(() => audioTrim(cache)).catch(() => {}); } catch (e) { /* ignore */ }
    }
    return res;
  } catch (err) {
    clearTimeout(timer);
    return new Response('audio-proxy-fail', { status: 502, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // 只缓存成功的同源响应；opaque / 206 之类的跳过
  if (res && res.ok && res.status === 200) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;          // 跨域（vxiaozhi 图片等）不干预
  if (url.pathname.startsWith('/api/')) return;             // 后端接口不走缓存
  if (url.pathname.startsWith('/audio/')) {                 // 同源音频代理（夸克跨域媒体被拦的解法）
    e.respondWith(audioProxy(req, url));
    return;
  }

  if (req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname === '/') {
    e.respondWith(networkFirst(req));
    return;
  }
  if (isStatic(url)) {
    e.respondWith(cacheFirst(req));
  }
});

// 允许页面主动要求「立即用新版本」
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
