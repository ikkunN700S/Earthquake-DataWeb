self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// アクティベート時に、ブラウザに残っている過去のキャッシュを「すべて削除」する
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log('古いキャッシュを削除しました:', cacheName);
                    return caches.delete(cacheName); // 既存のキャッシュを全消去
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return new Response('Offline');
        })
    );
});