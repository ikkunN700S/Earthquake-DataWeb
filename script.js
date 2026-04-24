// ==========================================
// 1. 設定
// 事前準備でコピーした「カンマ区切り（.csv）」のURLを以下に貼り付けます
// ==========================================
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv'; 

// ==========================================
// 2. 地図の初期化 (Leaflet.jsを使用)
// ==========================================
// 日本全体が見えるように初期表示を設定 (緯度, 経度), ズームレベル
const map = L.map('map').setView([36.2048, 138.2529], 5); 

// OpenStreetMapのタイルを読み込む
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);


// ==========================================
// 3. メイン処理
// ==========================================
async function init() {
    // もしURLが書き換えられていなければ、サンプルの1行だけを実行してテスト表示します
    if (CSV_URL === 'YOUR_PUBLISHED_CSV_URL_HERE') {
        console.warn('CSV URLが設定されていません。テストデータを表示します。');
        await processData("2026-04-24T07:52:00+09:00, 4.7, 奄美大島, 1"); // ※APIの精度上「奄美大島」に簡略化
        return;
    }

    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        await processData(csvText);
    } catch (error) {
        console.error('データの取得に失敗しました:', error);
        alert('地震データの読み込みに失敗しました。');
    }
}


// ==========================================
// 4. データ解析とピン留め
// ==========================================
async function processData(csvText) {
    // 改行で分割し、空行を除外
    const lines = csvText.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
        // カンマで分割 (例: 2026-04-24T07:52..., 4.7, 奄美大島北東沖, 1)
        const [timeStr, magStr, locationStr, intensityStr] = line.split(',');

        if (!locationStr) continue;

        const time = timeStr.trim();
        const mag = magStr.trim();
        const location = locationStr.trim();
        const intensity = intensityStr.trim();

        // 地名から緯度経度を取得
        const coords = await getCoordinates(location);

        if (coords) {
            addMarker(coords.lat, coords.lon, { time, mag, location, intensity });
        }
    }
}


// ==========================================
// 5. ジオコーディング (地名 -> 座標)
// ==========================================
// 同じ地名を何度もAPIに投げないためのキャッシュ
const geoCache = {};

async function getCoordinates(locationName) {
    if (geoCache[locationName]) return geoCache[locationName];

    try {
        // OpenStreetMapのNominatim APIを使用 (1秒間に1リクエスト程度の制限あり)
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.length > 0) {
            // 見つかった最初の座標を採用
            geoCache[locationName] = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            
            // APIの利用規約(負荷軽減)を守るため1秒待機
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return geoCache[locationName];
        } else {
            console.warn(`「${locationName}」の座標が見つかりませんでした。`);
        }
    } catch (error) {
        console.error(`座標取得エラー (${locationName}):`, error);
    }
    return null;
}


// ==========================================
// 6. マーカーの配置とクリックイベント
// ==========================================
function addMarker(lat, lon, data) {
    // マーカーを作成し、サイズによる色の変化などのカスタマイズも可能
    const marker = L.marker([lat, lon]).addTo(map);

    // マーカーがクリックされた時の処理
    marker.on('click', () => {
        const detailsDiv = document.getElementById('details');
        
        // 日付を日本時間で見やすくフォーマット
        const dateObj = new Date(data.time);
        const formattedDate = dateObj.toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        // 案内文（プレースホルダー）を非表示にする
        document.querySelector('.placeholder').style.display = 'none';

        // パネルにHTMLを挿入
        detailsDiv.innerHTML = `
            <div class="detail-item">
                <span>発生時刻</span>
                <div class="value">${formattedDate}</div>
            </div>
            <div class="detail-item">
                <span>震源地</span>
                <div class="value">${data.location}</div>
            </div>
            <div class="detail-item">
                <span>マグニチュード</span>
                <div class="value">M ${data.mag}</div>
            </div>
            <div class="detail-item">
                <span>最大観測震度</span>
                <div class="value">${data.intensity}</div>
            </div>
        `;
    });
}

// 実行
init();