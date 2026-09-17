/* 搞定英语 · Service Worker
 * 目的：GitHub Pages 强制 `Cache-Control: max-age=600`（仅 10 分钟），
 *       导致每次冷启动都要重新下载资源。SW 缓存不受 max-age 约束，
 *       命中后本地直读，二次进入近乎瞬开。
 *
 * 策略：
 *   - 导航请求（HTML）：network-first —— 保证发版后立即拿到新版本，离线回退缓存
 *   - 同源静态资源（js/css/img/data）：cache-first —— 这些 URL 都带 ?v= 版本号，
 *     发版换号即换 URL，天然不会读到旧内容
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hv-') && k !== CACHE).map((k) => caches.delete(k))))
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
  if (url.origin !== self.location.origin) return;          // 跨域（有道发音 / vxiaozhi 图片）不干预
  if (url.pathname.startsWith('/api/')) return;             // 后端接口不走缓存

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
