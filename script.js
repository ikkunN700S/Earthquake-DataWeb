const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const JSON_URL = 'centers.json';

let map;
let centerCoordinates = {};
let allEarthquakes = []; 
let currentMarkers = []; 

// 地図初期化
function initMap() {
    map = L.map('map').setView([36.2048, 138.2529], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

// 震度文字列を比較用の数値に変換
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
        
        // CSVをパース（6列分取得するように変更）
        allEarthquakes = csvText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                // 列の分割（5列目：緯度、6列目：経度）
                const [time, mag, location, intensity, lat, lon] = line.split(',').map(s => s.trim());
                return { 
                    time, 
                    mag, 
                    location, 
                    intensityLevel: getIntensityLevel(intensity), 
                    rawIntensity: intensity,
                    csvLat: lat, // CSVに記録されている緯度
                    csvLon: lon  // CSVに記録されている経度
                };
            })
            .sort((a, b) => new Date(b.time) - new Date(a.time));

        // 初期表示：最新5件
        updateDisplay(allEarthquakes.slice(0, 5), "最新5件を表示中");

    } catch (e) {
        console.error("読み込みエラー:", e);
    }
}

// 表示の更新処理（ハイブリッド座標決定ロジック）
function updateDisplay(dataList, message) {
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];

    dataList.forEach(data => {
        let finalLat, finalLon;

        // 1. まずCSV側に有効な数値があるか確認
        if (data.csvLat && data.csvLon && !isNaN(data.csvLat) && !isNaN(data.csvLon)) {
            finalLat = parseFloat(data.csvLat);
            finalLon = parseFloat(data.csvLon);
        } 
        // 2. なければ centers.json から取得
        else {
            const fallback = centerCoordinates[data.location];
            if (fallback) {
                finalLat = fallback.lat;
                finalLon = fallback.lon;
            }
        }

        // 座標が確定できればマーカーを設置
        if (finalLat && finalLon) {
            const marker = L.marker([finalLat, finalLon]).addTo(map);
            marker.on('click', () => showDetail(data));
            currentMarkers.push(marker);
        }
    });

    document.getElementById('result-count').textContent = `${message} (${dataList.length}件)`;
}

// 詳細表示
function showDetail(data) {
    const detailsDiv = document.getElementById('details');
    const placeholder = document.querySelector('.placeholder');
    if (placeholder) placeholder.style.display = 'none';
    
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
    const minIntensityLevel = parseFloat(document.getElementById('search-intensity').value);

    const filtered = allEarthquakes.filter(eq => {
        const matchLoc = eq.location.includes(locQuery);
        const matchInt = eq.intensityLevel >= minIntensityLevel;
        return matchLoc && matchInt;
    });

    updateDisplay(filtered, "検索結果");
});

loadData();