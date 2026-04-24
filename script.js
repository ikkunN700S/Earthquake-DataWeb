const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const JSON_URL = 'centers.json'; // 同一ディレクトリに配置

let map;
let centerCoordinates = {}; // JSONデータを格納する変数

// 地図の初期化
function initMap() {
    map = L.map('map').setView([36.2048, 138.2529], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
}

// メイン処理
async function loadApp() {
    initMap();

    try {
        // 1. まず地名対応JSONを読み込む
        const jsonRes = await fetch(JSON_URL);
        centerCoordinates = await jsonRes.json();

        // 2. 次にスプレッドシートのCSVを読み込む
        const csvRes = await fetch(CSV_URL);
        const csvText = await csvRes.text();
        
        processData(csvText);
    } catch (error) {
        console.error('データの読み込み失敗:', error);
    }
}

function processData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');

    lines.forEach(line => {
        const [time, mag, location, intensity] = line.split(',').map(s => s.trim());
        
        // JSONから座標を検索
        const coords = centerCoordinates[location];

        if (coords) {
            addMarker(coords.lat, coords.lon, { time, mag, location, intensity });
        } else {
            console.warn(`未登録の地名です: ${location}`);
            // 必要に応じてデフォルトの座標を表示するか、リストに記録する
        }
    });
}

function addMarker(lat, lon, data) {
    const marker = L.marker([lat, lon]).addTo(map);
    marker.on('click', () => {
        const detailsDiv = document.getElementById('details');
        document.querySelector('.placeholder').style.display = 'none';
        
        const date = new Date(data.time).toLocaleString('ja-JP');
        detailsDiv.innerHTML = `
            <div class="detail-item"><span>発生時刻</span><div class="value">${date}</div></div>
            <div class="detail-item"><span>震源地</span><div class="value">${data.location}</div></div>
            <div class="detail-item"><span>マグニチュード</span><div class="value">M ${data.mag}</div></div>
            <div class="detail-item"><span>最大震度</span><div class="value">${data.intensity}</div></div>
        `;
    });
}

loadApp();