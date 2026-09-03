// キャッシュの名前（バージョンを変えると古いキャッシュが破棄されます）
const CACHE_NAME = 'eq-app-v2';

// アプリの骨組みとなる静的ファイル（これらはインストール時に保存される）
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './js/script.js',
    './js/sharelink.js',
    './js/realtime-notify.js',
    './js/stations-viewer.js',
    './js/version.js',
    './centers.json',
    './stations.json',
    './version.json'
];

// 1. インストール時の処理（ファイルをキャッシュに保存）
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Service Worker: 静的ファイルをキャッシュしました');
            return cache.addAll(urlsToCache);
        })
    );
});

// 2. アクティベート時の処理（古いバージョンのキャッシュを削除）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: 古いキャッシュを削除しました', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// 3. 通信（fetch）を傍受した時の処理（Network First 戦略）
self.addEventListener('fetch', (event) => {
    // GASのCSVやP2PのAPIなど、動的なデータはキャッシュ処理から除外して常にネットワークへ
    if (event.request.url.includes('docs.google.com') || event.request.url.includes('api.p2pquake.net')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 通信成功：最新のデータをユーザーに返しつつ、裏でキャッシュも最新版に更新
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // 通信失敗（オフライン等）：保存しておいたキャッシュを返す
                return caches.match(event.request, { ignoreSearch: true });
            })
    );
});