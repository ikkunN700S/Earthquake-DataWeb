const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const JSON_URL = 'centers.json';

let map;
let markerClusterGroup; // クラスタリング用のグループ
let centerCoordinates = {};
let allEarthquakes = []; 

let currentSelectedMarker = null; // 現在選択されているマーカーを記憶
let defaultMarkerIcon = null;     // 元の青いアイコンを記憶
let currentDataList = [];         // 現在絞り込み検索されているデータのリストを記憶

let markerMap = {}; // 時刻をキーにしてマーカーを保持する

let p2pApiDataList = [];     // API取得した100件のデータを丸ごと記憶
let p2pOldestTimeMs = null;  // APIが持っている一番古い地震の時刻

// 震度マーカーを管理する専用レイヤー
let intensityLayerGroup = L.layerGroup();

// --- 観測点JSONのデータを保持する変数 ---
let stationDataList = [];

// --- JIS都道府県コード表（インデックス番号＝コード番号） ---
// ※ 0番目は空にして、1番目を北海道にすることで番号を一致させます
const PREF_NAMES = [
    "", "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

// 選択した時に表示する「赤いピン」の定義（外部の無料アイコンを利用）
const selectedIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

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
            resetSelection();
        }
    });
}

function resetSelection() {
    // 震度マーカーを消す
    intensityLayerGroup.clearLayers();
    // 1. ピンの色を元の青に戻す
    if (currentSelectedMarker && defaultMarkerIcon) {
        currentSelectedMarker.setIcon(defaultMarkerIcon);
        currentSelectedMarker.setZIndexOffset(0);
        
        // 単独表示をやめて、クラスター管理に戻す
        map.removeLayer(currentSelectedMarker);
        markerClusterGroup.addLayer(currentSelectedMarker);

        currentSelectedMarker = null;
    }

    // 2. パネルを「現在検索で絞り込まれている中の最新10件」に戻す
    if (currentDataList.length > 0) {
        showDetail(currentDataList.slice(0, 10));
    } else {
        document.getElementById('details').innerHTML = ''; // 0件の場合は空にする
    }
}

function executeSearch() {
    const locQuery = document.getElementById('search-location').value;
    const minIntensity = parseFloat(document.getElementById('search-intensity').value);
    const minMag = parseFloat(document.getElementById('search-mag').value) || 0;
    
    const startDateStr = document.getElementById('search-date-start').value;
    const endDateStr = document.getElementById('search-date-end').value;
    const startMs = startDateStr ? new Date(startDateStr + "T00:00:00").getTime() : 0;
    const endMs = endDateStr ? new Date(endDateStr + "T23:59:59").getTime() : Infinity;

    // ★絞り込んだ結果を変数に保存（let filtered ではなく currentDataList に代入）
    currentDataList = allEarthquakes.filter(eq => {
        const matchLoc = eq.location.includes(locQuery);
        const matchInt = eq.intensityLevel >= minIntensity;
        const matchMag = eq.mag >= minMag;
        const matchDate = eq.timeMs >= startMs && eq.timeMs <= endMs;
        
        return matchLoc && matchInt && matchMag && matchDate;
    });

    // ピンを再配置
    updateDisplay(currentDataList, "検索結果");

    // ★検索した直後も「最新3件」を表示させるために呼び出す
    resetSelection();
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
    currentDataList = allEarthquakes.filter(eq => {
        const matchLoc = eq.location.includes(locQuery);
        const matchInt = eq.intensityLevel >= minIntensity;
        const matchMag = eq.mag >= minMag;
        const matchDate = eq.timeMs >= startMs && eq.timeMs <= endMs;
        
        return matchLoc && matchInt && matchMag && matchDate;
    });

    // ピンを再配置
    updateDisplay(currentDataList, "検索結果");
    // 検索後の最新3件表示呼び出し
    resetSelection();
}

// 検索ボタンのイベント
document.getElementById('btn-search').addEventListener('click', executeSearch);

// 検索条件のリセット機能
document.getElementById('btn-reset').addEventListener('click', () => {
    // 各入力項目を空、または初期値に戻す
    document.getElementById('search-location').value = '';
    document.getElementById('search-intensity').value = '0';
    document.getElementById('search-mag').value = '0';
    
    // 日付を「直近30日」に戻す（以前作った関数を再利用！）
    setDefaultDates();

    // 初期状態に戻した上で、自動的に検索を実行する
    executeSearch();
});

// データ手動更新（最新のCSVのみ再取得）機能
document.getElementById('btn-update').addEventListener('click', async (e) => {
    const btn = e.target;
    const originalText = btn.textContent;
    
    // ボタンの連打防止と、ユーザーへの「更新中」のアピール
    btn.textContent = '更新中...';
    btn.disabled = true;

    try {
        // スプレッドシート（CSV）から最新データだけを再ダウンロード
        const csvRes = await fetch(CSV_URL);
        const csvText = await csvRes.text();
        
        // データを解析して allEarthquakes を上書きする
        allEarthquakes = csvText.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [time, mag, location, intensity, lat, lon] = line.split(',').map(s => s.trim());
                return { 
                    time, mag: parseFloat(mag) || 0, location, 
                    intensityLevel: getIntensityLevel(intensity), rawIntensity: intensity,
                    csvLat: lat, csvLon: lon,
                    timeMs: new Date(time).getTime()
                };
            })
            .sort((a, b) => b.timeMs - a.timeMs);

        // ※JSON（代表座標）は変化しないので再取得不要です

        // 最新のデータを使って、現在の検索条件のまま画面を再描画する
        executeSearch();
        
    } catch (error) {
        console.error("更新エラー:", error);
        alert("データの更新に失敗しました。通信状況を確認してください。");
    } finally {
        // 処理が終わったらボタンを元の状態に戻す
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// ズームリセットボタン処理
document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    // 地図の初期位置（日本全体）とズームレベル（5）に、滑らかに戻す
    map.setView([36.2048, 138.2529], 5, { animate: true });
});

// 表示の更新処理（クラスタリング対応）
function updateDisplay(dataList, message) {
    // 震度マーカーを消す
    intensityLayerGroup.clearLayers();
    // 単独表示されている赤いピンがあれば消す
    if (currentSelectedMarker) {
        map.removeLayer(currentSelectedMarker);
    }
    // 既存のマーカーをすべてクリア
    markerClusterGroup.clearLayers();
    markerMap = {};
    currentSelectedMarker = null; // 画面更新時は選択をリセット
    // まとめて追加するための配列
    const markersToAdd = [];

    dataList.forEach(data => {
        let lat, lon;
        if (data.csvLat && data.csvLon && !isNaN(data.csvLat)) {
            lat = data.csvLat; lon = data.csvLon;
        } else if (centerCoordinates[data.location]) {
            lat = centerCoordinates[data.location].lat;
            lon = centerCoordinates[data.location].lon;
        }

        if (lat && lon) {
            const marker = L.marker([lat, lon]);

            // マーカーを管理用オブジェクトに保存
            markerMap[data.timeMs] = marker;
            
            // クリックした時の処理
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e); 

                selectMarker(data.timeMs, data, false);
            });
            
            markersToAdd.push(marker);
        }
    });

    markerClusterGroup.addLayers(markersToAdd);
    document.getElementById('result-count').textContent = `${message} (${dataList.length}件)`;
}

// マーカーを選択状態にする共通関数
function selectMarker(timeMs, data, fromPanel = false) {
    const marker = markerMap[timeMs];
    if (!marker) return;

    // ズームレベル設定
    const targetZoom = 10;

    // クラスター（円）の中に隠れている場合、そこまで自動でズームして展開する
    const performFocus = () => {
        // 既存の選択を解除
        if (currentSelectedMarker && defaultMarkerIcon) {
            currentSelectedMarker.setIcon(defaultMarkerIcon);
            currentSelectedMarker.setZIndexOffset(0); // 重なり順をリセット
            map.removeLayer(currentSelectedMarker); // 単独表示から外す
            markerClusterGroup.addLayer(currentSelectedMarker); // クラスターの群れに戻す
        }

        // 初回のみ：元のアイコンを記憶
        if (!defaultMarkerIcon) defaultMarkerIcon = marker.getIcon();

        // 選択されたマーカーを赤くし、地図を移動させる
        marker.setIcon(selectedIcon);
        marker.setZIndexOffset(1000); // 常に他のピンやクラスターより「最前面」に表示する

        // クラスターから引き抜き、地図に直接配置する
        if (markerClusterGroup.hasLayer(marker)) {
            markerClusterGroup.removeLayer(marker); 
            map.addLayer(marker);
        }

        currentSelectedMarker = marker;

        // 地図の移動（ズームレベルを少し上げて中心に）
        map.setView(marker.getLatLng(), targetZoom, { animate: true });
    };

    // --- 分岐処理 ---
    if (markerClusterGroup.hasLayer(marker)) {
        // A. ピンがクラスターに隠れている場合：展開してからズーム
        markerClusterGroup.zoomToShowLayer(marker, performFocus);
    } else {
        // B. すでに独立している、または単独で表示されている場合：即座にズーム
        performFocus();
    }

    // パネル表示も更新（引数のdataがあれば使用、なければ検索リストから探す）
    if (!fromPanel &&data) {
        showDetail([data]);
    }
}

// パネルのカードクリック時に呼ばれる関数
function handleCardClick(timeMs) {
    const data = currentDataList.find(eq => eq.timeMs === timeMs);
    if (data) {
        selectMarker(timeMs, data, true);
    }
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

        // ★Google検索用に綺麗な文字列を作る（例: "2026年4月24日"）
        const d = new Date(data.time);
        const searchDateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}時${d.getMinutes()}分`;
        // 検証用リンク（Google検索で「地震 発生日時 震源地」を検索）
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchDateStr + ' ' + data.location + ' 地震')}`;

        const isOutOfRange = p2pOldestTimeMs !== null && data.timeMs < p2pOldestTimeMs;
        // 範囲外なら disabled 属性付きのグレーアウトボタンにする
        const buttonHtml = isOutOfRange
            ? `<button class="intensity-btn" disabled>⚠️ API提供期間外（古いデータ）</button>`
            : `<button class="intensity-btn" onclick="showIntensityData(event, ${data.timeMs})">▼ 各地の震度詳細を表示</button>`;
            
        return `
            <div class="eq-card" onclick="handleCardClick(${data.timeMs})" style="cursor: pointer;">
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
                        <strong>M ${data.mag.toFixed(1)}</strong>
                    </div>
                    <div class="eq-info" style="margin-top: 5px; justify-content: flex-end;">
                        <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="footer-link" onclick="event.stopPropagation();" style="font-size: 0.8rem;">
                            情報を検索
                        </a>
                    </div>
                    ${buttonHtml}
                    <div id="intensity-box-${data.timeMs}" class="intensity-details-container"></div>
                </div>
            </div>
        `;
    }).join('');

    detailsDiv.innerHTML = titleHtml + cardsHtml;

    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) {
        // パネルのスクロール位置を一番上に戻す
        infoPanel.scrollTop = 0;
    }
}

// 観測点の震度を表示（事前取得済みのデータから検索）
function showIntensityData(event, timeMs) {
    event.stopPropagation();

    const box = document.getElementById(`intensity-box-${timeMs}`);
    const btn = event.target;

    if (box.style.display === 'block') {
        box.style.display = 'none';
        btn.textContent = '▼ 各地の震度詳細を表示';
        return;
    }

    box.style.display = 'block';
    btn.textContent = '▲ 閉じる';

    // 1. 表示中のリストから、対象の地震の「地名(location)」を取得
    const targetEq = currentDataList.find(eq => eq.timeMs === timeMs);
    if (!targetEq) return;
    const targetLocation = targetEq.location;

    // 2. 時間と地名の「複合条件」でAPIデータから検索する
    const targetTime = new Date(timeMs).getTime();
    const matchedData = p2pApiDataList.find(apiData => {
        // API側のデータがない場合はスキップ
        if (!apiData.earthquake || !apiData.earthquake.hypocenter) return false;
        
        const apiTime = new Date(apiData.earthquake.time).getTime();
        const timeDiff = Math.abs(apiTime - targetTime);

        // 条件A: 時間のズレが60秒（60,000ミリ秒）以内であること
        const isTimeMatch = timeDiff <= 60000;

        // 条件B: 震央地名が部分一致していること
        // （例: 元データが「奄美」でAPIが「奄美大島近海」などの表記揺れを吸収する）
        const apiLocation = apiData.earthquake.hypocenter.name || "";
        const isLocationMatch = apiLocation.includes(targetLocation) || targetLocation.includes(apiLocation);

        // 両方を満たした時だけ「正解」とする
        return isTimeMatch && isLocationMatch;
    });

    if (!matchedData || !matchedData.points || matchedData.points.length === 0) {
        box.innerHTML = '<div style="color: #ff4757;">⚠️ 詳細情報が見つかりませんでした。</div>';
        return;
    }

    // --- データの集計とHTML生成 ---
    const scaleMap = { 70:'7', 60:'6強', 55:'6弱', 50:'5強', 45:'5弱', 40:'4', 30:'3', 20:'2', 10:'1' };
    const intensityGroups = {};
    
    matchedData.points.forEach(point => {
        const scaleStr = scaleMap[point.scale];
        if (!scaleStr) return;
        if (!intensityGroups[scaleStr]) intensityGroups[scaleStr] = [];
        intensityGroups[scaleStr].push(`${point.pref} ${point.addr}`);
    });

    const scaleOrder = ['7', '6強', '6弱', '5強', '5弱', '4', '3', '2', '1'];
    let html = '';
    
    scaleOrder.forEach(scale => {
        if (intensityGroups[scale]) {
            const areas = intensityGroups[scale].join('、 ');
            html += `
                <div class="intensity-group">
                    <div class="intensity-group-title">震度 ${scale}</div>
                    <div class="intensity-group-areas">${areas}</div>
                </div>
            `;
        }
    });

    box.innerHTML = html;
    drawIntensityMarkersOnMap(matchedData.points);
}

// P2P地震情報APIのデータを裏側で事前取得する
async function prefetchApiData() {
    try {
        const res = await fetch('https://api.p2pquake.net/v2/jma/quake?limit=100');
        p2pApiDataList = await res.json();
        
        if (p2pApiDataList.length > 0) {
            // リストの一番最後（最も古いデータ）の時刻を取得
            const oldestApi = p2pApiDataList[p2pApiDataList.length - 1];
            // 検索時の「5分の遊び」を考慮して、ボーダーラインを設定
            p2pOldestTimeMs = new Date(oldestApi.earthquake.time).getTime() - 300000; 
        }

        // もしすでに画面にリストが表示されていたら、ボタン状態を反映させるために再描画する
        if (typeof currentDataList !== 'undefined' && currentDataList.length > 0) {
            renderDetails(currentDataList);
        }
    } catch (error) {
        console.error("APIの事前取得に失敗しました:", error);
    }
}

// 地図上に観測点ごとの震度マーカーを描画する
function drawIntensityMarkersOnMap(points) {
    // 1. まず古い震度マーカーをすべて消す
    intensityLayerGroup.clearLayers();
    
    // 2. レイヤーを地図に追加する（まだ追加されていなければ）
    if (!map.hasLayer(intensityLayerGroup)) {
        intensityLayerGroup.addTo(map);
    }

    // 震度変換マップ
    const scaleMap = { 70:'7', 60:'6強', 55:'6弱', 50:'5強', 45:'5弱', 40:'4', 30:'3', 20:'2', 10:'1' };
    const classMap = { 70:'scale-7', 60:'scale-6p', 55:'scale-6m', 50:'scale-5p', 45:'scale-5m', 40:'scale-4', 30:'scale-3', 20:'scale-2', 10:'scale-1' };

    points.forEach(point => {
        // ここで関数を呼び出して座標を取得
        const coords = getCoordinates(point.pref, point.addr);

        if (coords) {
            const scaleStr = scaleMap[point.scale];
            const cssClass = classMap[point.scale];

            const intensityIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="intensity-marker ${cssClass}">${scaleStr.replace('強','+').replace('弱','-')}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            L.marker(coords, { icon: intensityIcon, zIndexOffset: 500 }).addTo(intensityLayerGroup);
        }
    });
}

// 観測点JSONデータの読み込み
async function loadStationData() {
    try {
        // 保存したJSONファイルを読み込む（ファイル名は適宜合わせてください）
        const res = await fetch('stations.json');
        stationDataList = await res.json();
        console.log("📍 観測点データを読み込みました（計 " + stationDataList.length + " 件）");
    } catch (error) {
        console.error("観測点JSONの読み込みに失敗しました:", error);
    }
}

// APIの地名から、JSONの座標を探し出す魔法の関数
function getCoordinates(apiPref, apiAddr) {
    // 1. APIの「沖縄県」から、コード「47」を逆引きする
    const prefCodeNum = PREF_NAMES.indexOf(apiPref);
    if (prefCodeNum === -1) return null; // 見つからなければ中止
    
    // JSONの pref は文字列（"47"）の場合があるため、文字列に変換しておく
    const prefCodeStr = prefCodeNum.toString();

    // 2. 観測点リストからマッチするものを探す
    const matchedStation = stationDataList.find(station => {
        // 条件A: 都道府県コードが一致しているか（例: "47" === "47" または 47 === 47）
        const isPrefMatch = (station.pref == prefCodeStr);
        
        // 条件B: JSONの名前(石垣市真栄里)に、APIの地名(石垣市)が含まれているか（部分一致）
        const isNameMatch = station.name.includes(apiAddr);

        return isPrefMatch && isNameMatch;
    });

    // 3. 見つかったら、緯度経度を数値にして返す
    if (matchedStation) {
        return [parseFloat(matchedStation.lat), parseFloat(matchedStation.lon)];
    }
    
    return null; // 見つからなかった場合
}

async function initializeApp() {
    await loadStationData(); // 先にJSONを読み込む
    await prefetchApiData(); // 次にP2P地震履歴を読み込む
}

initializeApp();

loadData();