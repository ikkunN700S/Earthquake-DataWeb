const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const JSON_URL = 'centers.json';

let map;
let centerCoordinates = {};
let allEarthquakes = []; // 全データを保持する配列
let currentMarkers = []; // 表示中のマーカーを管理

// 地図初期化
function initMap() {
    map = L.map('map').setView([36.2048, 138.2529], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

// 震度文字列を比較用の数値に変換する関数
function getIntensityLevel(intensityStr) {
    const scale = {
        '1': 1, '2': 2, '3': 3, '4': 4,
        '5弱': 4.5, '5強': 5.5,
        '6弱': 6.5, '6強': 7.5,
        '7': 8
    };
    return scale[intensityStr] || parseFloat(intensityStr) || 0;
}

// データの読み込み
async function loadData() {
    initMap();
    try {
        const [jsonRes, csvRes] = await Promise.all([fetch(JSON_URL), fetch(CSV_URL)]);
        centerCoordinates = await jsonRes.json();
        const csvText = await csvRes.text();
        
        // CSVをパースして配列に格納
        allEarthquakes = csvText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [time, mag, location, intensity] = line.split(',').map(s => s.trim());
                return { 
                    time, 
                    mag, 
                    location, 
                    // parseIntではなく、作った関数で数値化
                    intensityLevel: getIntensityLevel(intensity), 
                    rawIntensity: intensity // 表示用（「5弱」などのまま）
                };
            })
            .sort((a, b) => new Date(b.time) - new Date(a.time));

        // 初期表示：最新5件
        updateDisplay(allEarthquakes.slice(0, 5), "最新5件を表示中");

    } catch (e) {
        console.error("読み込みエラー:", e);
    }
}

// 表示の更新処理
function updateDisplay(dataList, message) {
    // 既存のマーカーを削除
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];

    dataList.forEach(data => {
        const coords = centerCoordinates[data.location];
        if (coords) {
            const marker = L.marker([coords.lat, coords.lon]).addTo(map);
            marker.on('click', () => showDetail(data));
            currentMarkers.push(marker);
        }
    });

    document.getElementById('result-count').textContent = `${message} (${dataList.length}件)`;
}

// 詳細表示
function showDetail(data) {
    const detailsDiv = document.getElementById('details');
    document.querySelector('.placeholder').style.display = 'none';
    detailsDiv.innerHTML = `
        <div class="detail-item"><span>発生時刻</span><div class="value">${new Date(data.time).toLocaleString('ja-JP')}</div></div>
        <div class="detail-item"><span>震源地</span><div class="value">${data.location}</div></div>
        <div class="detail-item"><span>マグニチュード</span><div class="value">M ${data.mag}</div></div>
        <div class="detail-item"><span>最大震度</span><div class="value">${data.rawIntensity}</div></div>
    `;
}

// 検索ボタンのイベント
document.getElementById('btn-search').addEventListener('click', () => {
    const locQuery = document.getElementById('search-location').value;
    // 比較用に parseFloat を使用
    const minIntensityLevel = parseFloat(document.getElementById('search-intensity').value);

    const filtered = allEarthquakes.filter(eq => {
        const matchLoc = eq.location.includes(locQuery);
        // 新しい intensityLevel で比較
        const matchInt = eq.intensityLevel >= minIntensityLevel;
        return matchLoc && matchInt;
    });

    updateDisplay(filtered, "検索結果");
});

loadData();