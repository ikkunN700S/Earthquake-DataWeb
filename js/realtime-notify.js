// ==========================================
// リアルタイム地震情報 受信・ポップアップ機能
// ==========================================

function connectRealtimeAPI() {
    // P2P地震情報の WebSocket API に接続
    const ws = new WebSocket('wss://api.p2pquake.net/v2/ws');

    ws.onopen = () => {
        console.log('📶 リアルタイム地震速報サーバーに接続しました');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // 551: 地震情報（発生直後）
        if (data.code === 551 && data.earthquake) {
            handleEarthquakeEvent(data.earthquake);
        }
        // 556: 緊急地震速報（EEW） - さらに速い警報
        else if (data.code === 556 && data.eew && !data.eew.isCancel) {
            handleEEWEvent(data.eew);
        }
    };

    ws.onclose = () => {
        console.warn('⚠️ リアルタイム接続が切断されました。5秒後に再接続します...');
        setTimeout(connectRealtimeAPI, 5000); // 切れっぱなしを防ぐ自動再接続ロジック
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket エラー:', error);
    };
}

// 画面上にポップアップを生成する関数
function showRealtimePopup(title, content, typeClass = '') {
    const container = document.getElementById('realtime-notification-container');
    if (!container) return;

    const popup = document.createElement('div');
    popup.className = `realtime-popup ${typeClass}`;
    
    popup.innerHTML = `
        <div class="popup-close-btn" onclick="this.parentElement.remove()">✖</div>
        <div class="realtime-popup-title">${title}</div>
        <div class="realtime-popup-content">${content}</div>
    `;

    // 新しい通知を一番上に追加
    container.prepend(popup);

    // 15秒後に自動でふわっと消す
    setTimeout(() => {
        if (popup.parentElement) {
            popup.style.opacity = '0';
            popup.style.transition = 'opacity 0.5s';
            setTimeout(() => popup.remove(), 500);
        }
    }, 15000);
}

// 地震情報を処理
function handleEarthquakeEvent(eq) {
    if (!eq.hypocenter || !eq.hypocenter.name) return;
    
    const time = eq.time;
    const name = eq.hypocenter.name;
    const scaleNum = eq.maxScale;
    
    // スケール変換
    const scaleMap = { 70:'7', 60:'6強', 55:'6弱', 50:'5強', 45:'5弱', 40:'4', 30:'3', 20:'2', 10:'1' };
    const scaleStr = scaleMap[scaleNum] || '調査中';
    
    const magnitude = eq.hypocenter.magnitude !== -1 ? `M${eq.hypocenter.magnitude.toFixed(1)}` : "不明";
    
    // 色分けの判定
    let typeClass = '';
    if (scaleNum >= 45) typeClass = 'intensity-high'; // 5弱以上
    else if (scaleNum >= 30) typeClass = 'intensity-mid'; // 3〜4
    
    const content = `
        <strong>${name}</strong> を震源とする地震がありました。<br>
        最大震度: <strong style="font-size: 18px;">${scaleStr}</strong> (規模: ${magnitude})<br>
        <span style="font-size: 11px; color: #a4b0be; margin-top: 4px; display: block;">発生時刻: ${time}</span>
    `;
    
    showRealtimePopup('🚨 地震情報 (速報)', content, typeClass);
}

// 緊急地震速報（EEW）を処理
function handleEEWEvent(eew) {
    const areaName = eew.earthquake?.hypocenter?.name || '不明な地域';
    
    const content = `
        <strong>${areaName}</strong> 付近で地震発生。<br>
        強い揺れに警戒してください！
    `;
    
    showRealtimePopup('⚠️ 緊急地震速報 (警報)', content, 'eew-alert');
}

// ページ読み込み時にセットアップ
document.addEventListener('DOMContentLoaded', () => {
    // 通知を格納する透明なコンテナをbodyの直下に作成
    if (!document.getElementById('realtime-notification-container')) {
        const container = document.createElement('div');
        container.id = 'realtime-notification-container';
        container.className = 'realtime-notification-container';
        document.body.appendChild(container);
    }
    
    // APIへ接続開始
    connectRealtimeAPI();
});