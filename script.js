const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const JSON_URL = 'centers.json';

let map;
let markerClusterGroup; // クラスタリング用のグループ
let centerCoordinates = {};
let allEarthquakes = []; 

// 地図初期化
function initMap() {
    map = L.map('map').setView([36.2048, 138.2529], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // クラスタリンググループの初期化
    markerClusterGroup = L.markerClusterGroup({
        chunkedLoading: true, // 大量データ読み込み時のフリーズを防ぐ

        // まとまる範囲（半径ピクセル数）デフォルトは 80
        // この数値減らすと、まとまらなくなる
        maxClusterRadius: 40, 

        // 指定したズームレベル（地図の拡大率）以上で強制的にクラスターを解除して個別のピンを表示
        // 目安: 10〜12くらい
        disableClusteringAtZoom: 10
    });
    map.addLayer(markerClusterGroup);

    // 何もない地図上をクリックされた場合
    map.on('click', (e) => {
        // もしクリックされたターゲットが地図であればリセット
        if (e.originalEvent.target.id === 'map' || e.originalEvent.target.classList.contains('leaflet-container')) {
            resetPanel();
        }
    });
}

function resetPanel() {
    const detailsDiv = document.getElementById('details');
    const placeholder = document.querySelector('.placeholder');
    detailsDiv.innerHTML = ''; // 内容をクリア
    if (placeholder) placeholder.style.display = 'block'; // 案内文を表示
}

// 震度文字列の数値化
function getIntensityLevel(intensityStr) {
    const scale = { '1': 1, '2': 2, '3': 3, '4': 4, '5-': 4.5, '5+': 5.0, '6-': 5.5, '6+': 6.0, '7': 7 };
    return scale[intensityStr] || parseFloat(intensityStr) || 0;
}

// デフォルトの日付をセットする関数（今日と30日前）
function setDefaultDates() {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 30); // 30日前

    // YYYY-MM-DD形式に変換
    const formatYMD = (date) => {
        const y = date.getFullYear();
        const m = ("0" + (date.getMonth() + 1)).slice(-2);
        const d = ("0" + date.getDate()).slice(-2);
        return `${y}-${m}-${d}`;
    };

    document.getElementById('search-date-start').value = formatYMD(past);
    document.getElementById('search-date-end').value = formatYMD(today);
}

// データの読み込み
async function loadData() {
    setDefaultDates(); // 日付の初期値をセット
    initMap();
    try {
        const [jsonRes, csvRes] = await Promise.all([fetch(JSON_URL), fetch(CSV_URL)]);
        centerCoordinates = await jsonRes.json();
        const csvText = await csvRes.text();
        
        allEarthquakes = csvText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [time, mag, location, intensity, lat, lon] = line.split(',').map(s => s.trim());
                return { 
                    time, mag: parseFloat(mag) || 0, location, 
                    intensityLevel: getIntensityLevel(intensity), rawIntensity: intensity,
                    csvLat: lat, csvLon: lon,
                    // 検索用にDateオブジェクト（タイムスタンプ）を持つ
                    timeMs: new Date(time).getTime()
                };
            })
            .sort((a, b) => b.timeMs - a.timeMs);

        // 初期表示は「検索ボタンを押した場合と同じ挙動」
        executeSearch();

        // 読み込み直後は直近3件表示
        if (allEarthquakes.length > 0) {
            showDetail(allEarthquakes.slice(0, 3));
        }

    } catch (e) {
        console.error("読み込みエラー:", e);
    }
}

// 検索実行ロジック
function executeSearch() {
    const locQuery = document.getElementById('search-location').value;
    const minIntensity = parseFloat(document.getElementById('search-intensity').value);
    const minMag = parseFloat(document.getElementById('search-mag').value) || 0;
    
    // 日付の取得（未入力の場合は極端な日付を入れる）
    const startDateStr = document.getElementById('search-date-start').value;
    const endDateStr = document.getElementById('search-date-end').value;
    const startMs = startDateStr ? new Date(startDateStr + "T00:00:00").getTime() : 0;
    const endMs = endDateStr ? new Date(endDateStr + "T23:59:59").getTime() : Infinity;

    // フィルター処理
    const filtered = allEarthquakes.filter(eq => {
        const matchLoc = eq.location.includes(locQuery);
        const matchInt = eq.intensityLevel >= minIntensity;
        const matchMag = eq.mag >= minMag;
        const matchDate = eq.timeMs >= startMs && eq.timeMs <= endMs;
        
        return matchLoc && matchInt && matchMag && matchDate;
    });

    updateDisplay(filtered, "検索結果");
}

// 検索ボタンのイベント
document.getElementById('btn-search').addEventListener('click', executeSearch);

// 表示の更新処理（クラスタリング対応）
function updateDisplay(dataList, message) {
    // 既存のマーカーをすべてクリア
    markerClusterGroup.clearLayers();
    
    // まとめて追加するための配列
    const markersToAdd = [];

    dataList.forEach(data => {
        let finalLat, finalLon;
        if (data.csvLat && data.csvLon && !isNaN(data.csvLat) && !isNaN(data.csvLon)) {
            finalLat = parseFloat(data.csvLat);
            finalLon = parseFloat(data.csvLon);
        } else {
            const fallback = centerCoordinates[data.location];
            if (fallback) {
                finalLat = fallback.lat;
                finalLon = fallback.lon;
            }
        }

        if (finalLat && finalLon) {
            const marker = L.marker([finalLat, finalLon]);
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e); 
                showDetail([data]); // クリックした1件のみ表示
            });
            markersToAdd.push(marker);
        }
    });

    // クラスタリンググループに一括追加
    markerClusterGroup.addLayers(markersToAdd);

    // 最大表示件数の警告
    let countText = `${message} (${dataList.length}件)`;
    if (dataList.length > 5000) {
        countText += ` ※件数が多いため、条件を絞ることをお勧めします`;
    }
    document.getElementById('result-count').textContent = countText;
}

// 震度に応じたCSSクラスを返すヘルパー関数
function getIntensityClass(rawIntensity) {
    const classMap = {
        '1': 'bg-shindo-1',
        '2': 'bg-shindo-2',
        '3': 'bg-shindo-3',
        '4': 'bg-shindo-4',
        '5-': 'bg-shindo-5-low',
        '5+': 'bg-shindo-5-high',
        '6-': 'bg-shindo-6-low',
        '6+': 'bg-shindo-6-high',
        '7': 'bg-shindo-7'
    };
    return classMap[rawIntensity] || '';
}

// 詳細表示
function showDetail(data) {
    const detailsDiv = document.getElementById('details');
    const placeholder = document.querySelector('.placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const titleHtml = data.length > 1 ? '<h3 style="font-size:0.9rem; color:#666;">直近の地震情報</h3>' : '';

    const cardsHtml = data.map(data => {
        // ここで震度に基づいたクラスを取得
        const intensityClass = getIntensityClass(data.rawIntensity);

        // 画面表示用に表記を変換
        const displayIntensity = data.rawIntensity
            .replace('5-', '5弱').replace('5+', '5強')
            .replace('6-', '6弱').replace('6+', '6強');
            
        return `
            <div class="eq-card">
                <div class="eq-card-header ${intensityClass}">
                    <span class="eq-intensity">震度 ${displayIntensity}</span>
                    <span class="eq-location">${data.location}</span>
                </div>
                
                <div class="eq-card-body">
                    <div class="eq-info">
                        <span>発生時刻</span>
                        <strong>${new Date(data.time).toLocaleString('ja-JP', { 
                            year: 'numeric', 
                            month: 'numeric', 
                            day: 'numeric', 
                            hour: 'numeric', 
                            minute: 'numeric' 
                        })}</strong>
                    </div>
                    <div class="eq-info">
                        <span>マグニチュード</span>
                        <strong>M ${data.mag}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    detailsDiv.innerHTML = titleHtml + cardsHtml;
}

loadData();