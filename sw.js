const CACHE_NAME = 'petri-editor-v1.01'; // МЕНЯЙТЕ ВЕРСИЮ ДЛЯ ОБНОВЛЕНИЯ (v2, v3...)
const ASSETS = [
  './',
  './index.html',
  './editor.js',
  './manifest.json'
];

// Установка: кэшируем все ресурсы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting()) // Активируем сразу
  );
});

// Активация: удаляем старые версии кэша, если они были
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Перехватываем управление вкладками мгновенно
  );
});

// Перехват запросов: отдаем файлы из кэша, если сети нет
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

