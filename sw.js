/*
 * Ai 绘图助手 - Service Worker (PWA)
 * 策略：
 *  - 预缓存首页壳与 manifest（任一失败不阻断安装）
 *  - /api/ 动态接口一律仅网络，绝不缓存
 *  - 静态资源缓存优先，miss 时请求并写入
 *  - 页面导航网络优先，离线回退缓存首页
 * 更新：修改本文件后浏览器自动安装新版本，activate 阶段清理旧缓存。
 */
const CACHE_NAME = 'ai-draw-v2';
const PRECACHE = [
  '/',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  // 动态 API 不缓存
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  // 页面导航：网络优先，离线回退首页壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  // 静态资源：缓存优先
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'default')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
