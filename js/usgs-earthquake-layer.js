/**
 * USGS GeoJSON API 過去30日間の世界の大きな地震 (M5.0以上)
 * Leaflet レイヤー管理・表示切り替え対応版
 */

let usgsEarthquakeLayer = null; 
let usgsSwitchState = true;     
let usgsMapRef = null;          

async function addUsgsEarthquakeLayer(map) {
    usgsMapRef = map;
    
    // 期間を「過去30日間」に変更
    const daysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startDateStr = daysAgo.toISOString().split('T')[0];
    
    // ★変更: 緯度経度の制限を外し、世界中を対象にする。代わりに minmagnitude=5.0 を指定
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDateStr}&minmagnitude=5.0`;

    try {
        const response = await fetch(usgsUrl);
        const geojsonData = await response.json();

        usgsEarthquakeLayer = L.geoJSON(geojsonData, {
            pointToLayer: function (feature, latlng) {
                const mag = feature.properties.mag;
                
                // M5.0以上のデータのみ取得されるため、M5〜M8クラスに応じたサイズに調整
                let radius = 6;
                if (mag >= 8.0) radius = 24;
                else if (mag >= 7.0) radius = 16;
                else if (mag >= 6.0) radius = 10;
                else if (mag >= 5.0) radius = 6;

                return L.circleMarker(latlng, {
                    radius: radius,
                    fillColor: "#9c88ff", // 色を紫に変更（日本の赤/青ピンと区別するため）
                    color: "rgba(156, 136, 255, 0.6)",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.4
                });
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const time = new Date(props.time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                const depth = feature.geometry.coordinates[2]; 

                layer.bindPopup(`
                    <div style="font-size: 12px; color: #333; min-width: 120px;">
                        <strong style="color: #9c88ff; font-size: 14px;">M${props.mag.toFixed(1)}</strong><br>
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

        updateUsgsVisibility();
        console.log("USGS 世界の地震レイヤーを正常に準備しました。");

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
    
    const toggleBtn = document.getElementById('toggle-usgs-btn');
    if (toggleBtn) {
        toggleBtn.checked = isTurnOn;
    }
    
    updateUsgsVisibility();
}

// 実際のマップへの追加・削除制御
function updateUsgsVisibility() {
    if (!usgsEarthquakeLayer || !usgsMapRef) return;
    
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