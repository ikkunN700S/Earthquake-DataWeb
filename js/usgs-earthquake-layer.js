/**
 * USGS GeoJSON API 過去30日間の世界の大きな地震 (M5.0以上)
 */

let usgsEarthquakeLayer = null; 
let usgsSwitchState = true;     
let usgsMapRef = null;          

// マグニチュードに応じて滑らかに円の半径（メートル単位）を計算
// M5.0 = 25km / M6.0 = 55km / M7.0 = 120km / M8.0 = 265km
function calcUsgsRadiusMeters(mag) {
    const baseMag = Math.max(5.0, mag);
    return Math.round(25000 * Math.pow(2.2, baseMag - 5.0));
}

async function addUsgsEarthquakeLayer(map) {
    usgsMapRef = map;
    
    const daysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startDateStr = daysAgo.toISOString().split('T')[0];
    
    // M5.0以上の世界の地震を取得
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDateStr}&minmagnitude=5.0`;

    try {
        const response = await fetch(usgsUrl);
        const geojsonData = await response.json();

        usgsEarthquakeLayer = L.geoJSON(geojsonData, {
            pointToLayer: function (feature, latlng) {
                // 日付変更線をまたいで環太平洋造山帯を繋げるための座標シフト
                let lng = latlng.lng;
                if (lng < -30) {
                    lng += 360;
                }
                const shiftedLatLng = L.latLng(latlng.lat, lng);

                const mag = feature.properties.mag;

                return L.circle(shiftedLatLng, {
                    radius: calcUsgsRadiusMeters(mag),
                    fillColor: "#ff4757",
                    color: "rgba(255, 71, 87, 0.6)",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.35
                });
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const time = new Date(props.time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                const depth = feature.geometry.coordinates[2]; 

                layer.bindPopup(`
                    <div style="font-size: 12px; color: #333; min-width: 120px;">
                        <strong style="color: #ff4757; font-size: 14px;">M${props.mag.toFixed(1)}</strong><br>
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