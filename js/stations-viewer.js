// ==========================================
// 震度観測点ビューアー (独立機能)
// ==========================================

// 観測点専用のクラスターグループ（地震ピンとは完全に独立させます）
let stationsClusterGroup = null;

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-stations-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('change', async (e) => {
        if (e.target.checked) {
            await showAllStations();
        } else {
            hideAllStations();
        }
    });
});

// 観測点を地図に表示する
async function showAllStations() {
    // 地図(map)が存在しない場合は処理を中断
    if (typeof map === 'undefined') return;

    // 初回表示時のみ、マーカーを生成する（2回目以降は一瞬で表示）
    if (!stationsClusterGroup) {
        // 観測点用のクラスター（色がグレーの独自デザイン）
        stationsClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 40,
            iconCreateFunction: function(cluster) {
                const childCount = cluster.getChildCount();
                return L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color: rgba(116, 125, 140, 0.9); color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 2px solid white; font-size: 12px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${childCount}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
            }
        });

        // データソースの決定
        // script.js で既に読み込んでいる `stationDataList` があればそれを再利用（高速化）
        let dataToRender = [];
        if (typeof stationDataList !== 'undefined' && stationDataList.length > 0) {
            dataToRender = stationDataList;
        } else {
            // 万が一script.js側で読み込まれていなければ、自分で読みに行く
            try {
                const res = await fetch('stations.json');
                dataToRender = await res.json();
            } catch (error) {
                console.error("観測点データの読み込みに失敗しました:", error);
                alert("データの読み込みに失敗しました。");
                return;
            }
        }

        // 全観測点（約1700〜4000点）のマーカーを生成
        dataToRender.forEach(station => {
            const lat = parseFloat(station.lat);
            const lon = parseFloat(station.lon);

            if (isNaN(lat) || isNaN(lon)) return;

            // 地震ピンと被らない、控えめなグレーのドットアイコン
            const dotIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="station-dot-marker"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5]
            });

            const marker = L.marker([lat, lon], { 
                icon: dotIcon,
                zIndexOffset: 100 // 地震ピン(0〜1000)より少し下に配置
            });

            // ポップアップの設定
            marker.bindPopup(`
                <div style="text-align: center; min-width: 150px;">
                    <strong style="display: block; font-size: 14px; color: #2f3542; margin-bottom: 8px; border-bottom: 2px solid #ced6e0; padding-bottom: 4px;">
                        ${station.name}
                    </strong>
                    <div style="font-size: 12px; color: #57606f; line-height: 1.5;">
                        <div>緯度: <strong>${lat.toFixed(2)}</strong></div>
                        <div>経度: <strong>${lon.toFixed(2)}</strong></div>
                    </div>
                </div>
            `);

            stationsClusterGroup.addLayer(marker);
        });
    }

    // クラスターグループを地図に追加
    if (!map.hasLayer(stationsClusterGroup)) {
        map.addLayer(stationsClusterGroup);
    }
}

// 観測点を地図から隠す
function hideAllStations() {
    if (typeof map !== 'undefined' && stationsClusterGroup) {
        if (map.hasLayer(stationsClusterGroup)) {
            map.removeLayer(stationsClusterGroup);
        }
    }
}

