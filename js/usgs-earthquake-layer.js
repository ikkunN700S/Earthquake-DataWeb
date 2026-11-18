/**
 * USGS GeoJSON API 過去7日間の日本周辺地震
 * Leaflet レイヤー管理・表示切り替え対応版
 */

let usgsEarthquakeLayer = null; // 生成したレイヤーを保持
let usgsSwitchState = true;     // ユーザーのスイッチON/OFF状態
let usgsMapRef = null;          // Mapオブジェクトの参照

async function addUsgsEarthquakeLayer(map) {
    usgsMapRef = map;
    const aWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startDateStr = aWeekAgo.toISOString().split('T')[0];
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDateStr}&minlatitude=24&maxlatitude=46&minlongitude=122&maxlongitude=154`;

    try {
        const response = await fetch(usgsUrl);
        const geojsonData = await response.json();

        usgsEarthquakeLayer = L.geoJSON(geojsonData, {
            pointToLayer: function (feature, latlng) {
                const mag = feature.properties.mag;
                let radius = 3;
                if (mag >= 8) radius = 20;
                else if (mag >= 6) radius = 12;
                else if (mag >= 4) radius = 6;
                else if (mag > 0) radius = mag * 1.5;

                return L.circleMarker(latlng, {
                    radius: radius,
                    fillColor: "#ff4757",
                    color: "rgba(255, 71, 87, 0.6)",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.3
                });
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const time = new Date(props.time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                const depth = feature.geometry.coordinates[2]; 

                layer.bindPopup(`
                    <div style="font-size: 12px; color: #333; min-width: 120px;">
                        <strong style="color: #ff4757;">M${props.mag.toFixed(1)}</strong><br>
                        深さ: ${depth.toFixed(1)} km<br>
                        ${time}<br>
                        <span style="font-size: 10px; color: #666;">${props.place}</span>
                    </div>
                `);

                layer.on('mouseover', function () {
                    this._path.style.cursor = 'pointer';
                });
            }
        });

        updateUsgsVisibility(); // 初回描画の判定
        console.log("USGS地震分布レイヤーを正常に準備しました。");

    } catch (error) {
        console.error("USGSレイヤーの追加に失敗しました:", error);
    }
}

// ユーザーが手動でトグルを操作した時の切り替え
function toggleUsgsSwitch(isVisible) {
    usgsSwitchState = isVisible;
    updateUsgsVisibility();
}

// 検索やリセット時に、システム側から強制的にON/OFFを切り替える関数
function forceUsgsState(isTurnOn) {
    usgsSwitchState = isTurnOn;
    
    // UI上のチェックボックスの見た目も連動してチェックを入れる/外す
    const toggleBtn = document.getElementById('toggle-usgs-btn');
    if (toggleBtn) {
        toggleBtn.checked = isTurnOn;
    }
    
    updateUsgsVisibility();
}

// 実際のマップへの追加・削除制御
function updateUsgsVisibility() {
    if (!usgsEarthquakeLayer || !usgsMapRef) return;
    
    // スイッチの状態だけを見てシンプルに表示・非表示を切り替える
    if (usgsSwitchState) {
        if (!usgsMapRef.hasLayer(usgsEarthquakeLayer)) {
            usgsEarthquakeLayer.addTo(usgsMapRef);
        }
    } else {
        if (usgsMapRef.hasLayer(usgsEarthquakeLayer)) {
            usgsMapRef.removeLayer(usgsEarthquakeLayer);
        }
    }
}