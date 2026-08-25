// ==========================================
// リアルタイム地震情報 受信・ポップアップ機能
// ==========================================

// 再接続の試行回数を記録する変数
let reconnectAttempts = 0;
let currentWs = null; // 現在のWebSocket接続を保持
let reconnectTimeoutId = null; // 再接続タイマーを保持
let pollingIntervalId = null; // REST API定期取得のタイマーID
const processedEventIds = new Set(); // 処理済みのデータIDを記録して重複を防ぐ

// ステータス表示を更新する関数
function updateWebSocketStatus(state) {
    let statusEl = document.getElementById('websocket-status-badge');
    
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'websocket-status-badge';
        statusEl.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            padding: 6px 12px; border-radius: 20px;
            font-size: 12px; font-weight: bold; color: white;
            z-index: 10000; cursor: pointer; user-select: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            transition: background-color 0.3s;
        `;

        // バッジをクリックした時の手動再接続処理
        statusEl.onclick = () => {
            // クリックアニメーション
            statusEl.style.transform = 'scale(0.95)';
            setTimeout(() => statusEl.style.transform = 'scale(1)', 100);
            
            console.log('🔄 WebSocketの再接続を強制実行します');
            connectRealtimeAPI(); // 強制再接続
        };

        document.body.appendChild(statusEl);
    }

    if (state === 'realtime') {
        statusEl.textContent = '🟢 リアルタイム通信中';
        statusEl.style.backgroundColor = 'rgba(46, 213, 115, 0.9)'; // 緑
    } else if (state === 'fallback') {
        statusEl.textContent = '🟠 バックアップ通信中 (1分間隔)';
        statusEl.style.backgroundColor = 'rgba(255, 165, 2, 0.9)'; // オレンジ
    } else if (state === 'connecting') {
        statusEl.textContent = '🟡 接続試行中...';
        statusEl.style.backgroundColor = 'rgba(255, 211, 42, 0.9)'; // 黄色
    } else if (state === 'offline') {
        statusEl.textContent = '🔴 通信切断・オフライン';
        statusEl.style.backgroundColor = 'rgba(255, 71, 87, 0.9)'; // 赤
    }
}

// データ処理の共通関数（WebSocketからでもREST APIからでもここを通す）
function processIncomingData(data) {
    // すでに処理した情報（同じID）なら何もしない
    if (processedEventIds.has(data.id)) return;

    // 過去のデータなら無視
    if (typeof p2pApiDataList !== 'undefined' && p2pApiDataList.some(item => item.id === data.id)) {
        processedEventIds.add(data.id); // 次から弾くために記録だけしておく
        return;
    }

    // 5分以上前の情報なら無視
    if (data.time) {
        const dataTimeMs = new Date(data.time).getTime();
        const nowMs = Date.now();
        // 5分 (300000ミリ秒) 以上前のデータは過去とみなす
        if (nowMs - dataTimeMs > 300000) {
            processedEventIds.add(data.id);
            return;
        }
    }
    
    // 新規の情報としてIDを記録
    processedEventIds.add(data.id);
    // メモリ節約のため、履歴が1000件を超えたら古いものを消す
    if (processedEventIds.size > 1000) {
        const firstItem = processedEventIds.values().next().value;
        processedEventIds.delete(firstItem);
    }

    if (data.code === 551 && data.earthquake) {
        handleEarthquakeEvent(data.earthquake);
        
        // p2pApiDataList へのローカル追加と更新
        if (typeof p2pApiDataList !== 'undefined') {
            p2pApiDataList.unshift(data);
            if (p2pApiDataList.length > 100) p2pApiDataList.pop();
            const oldestApi = p2pApiDataList[p2pApiDataList.length - 1];
            if (oldestApi && oldestApi.earthquake && typeof p2pOldestTimeMs !== 'undefined') {
                p2pOldestTimeMs = new Date(oldestApi.earthquake.time).getTime() - 300000;
            }
        }
    } else if (data.code === 556 && data.eew && !data.eew.isCancel) {
        handleEEWEvent(data.eew);
    } else if (data.code === 552 && data.tsunami) {
        handleTsunamiEvent(data.tsunami);
    }
}

// 画面上にポップアップを生成する関数
function showRealtimePopup(title, content, typeClass = '', duration = 60000) {
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

    // durationが0より大きい場合はタイマーセット
    if(duration > 0) {
        // 60秒後に自動でふわっと消す
        setTimeout(() => {
            if (popup.parentElement) {
                popup.style.opacity = '0';
                popup.style.transition = 'opacity 0.5s';
                setTimeout(() => popup.remove(), 500);
            }
        }, duration);
    }
}

// REST APIによる定期取得（フォールバック）
async function fallbackPolling() {
    try {
        const res = await fetch('https://api.p2pquake.net/v2/jma/quake?limit=10');
        
        // もしAPIサーバーからの返答がエラーだった場合
        if (!res.ok) {
            // WebSocketが未接続でかつエラーならoffline
            if (pollingIntervalId) updateWebSocketStatus('offline');
            return;
        }
        
        // 取得に成功かつWebSocket未接続なら「バックアップ稼働中」の表示
        if (pollingIntervalId) {
            updateWebSocketStatus('fallback');
        }
        
        const dataList = await res.json();
        
        for (let i = dataList.length - 1; i >= 0; i--) {
            processIncomingData(dataList[i]);
        }
    } catch (error) {
        console.warn("バックアップAPIの取得に失敗しました", error);
        // Wi-Fiが切れたり、サーバーが完全に落ちている場合
        updateWebSocketStatus('offline');
    }
}

// WebSocket接続開始関数
function connectRealtimeAPI() {
    // 最初の起動時や、バックアップすら動いていない時だけ「接続試行中」にする
    if (!pollingIntervalId) {
        updateWebSocketStatus('connecting');
    }

    const ws = new WebSocket('wss://api.p2pquake.net/v2/ws');

    ws.onopen = () => {
        console.log('📶 リアルタイム地震速報サーバーに接続しました');
        updateWebSocketStatus('realtime'); // 🟢 リアルタイム通信中に変更
        reconnectAttempts = 0; // 成功したらリセット
        
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            console.log('🛑 バックアップ定期取得を停止しました');
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processIncomingData(data); 
    };

    ws.onclose = () => {
        // 切断された直後は「🟠 バックアップ通信中」のステータスにする
        updateWebSocketStatus('fallback');
        
        if (!pollingIntervalId) {
            console.log('🔄 バックアップ定期取得（1分間隔）を開始します');
            pollingIntervalId = setInterval(fallbackPolling, 60000);
            fallbackPolling();
        }

        const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
        console.warn(`⚠️ ${delay / 1000}秒後にWebSocket再接続を試みます...`);
        
        reconnectAttempts++;
        setTimeout(connectRealtimeAPI, delay);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket エラー:', error);
    };
}

// 地震情報を処理
function handleEarthquakeEvent(eq) {
    if (!eq.hypocenter || !eq.hypocenter.name) return;
    
    const time = eq.time ? eq.time.replace(/:\d{2}$/, '') : '不明';
    const name = eq.hypocenter.name;
    const scaleNum = eq.maxScale;
    
    // スケール変換
    const scaleMap = { 70:'7', 60:'6強', 55:'6弱', 50:'5強', 45:'5弱', 40:'4', 30:'3', 20:'2', 10:'1' };
    const scaleStr = scaleMap[scaleNum] || (scaleNum === -1 ? '調査中' : '不明');
    
    const magnitude = eq.hypocenter.magnitude !== -1 ? `M${eq.hypocenter.magnitude.toFixed(1)}` : "不明";
    
    // 深さ
    let depthStr = "不明";
    if (eq.hypocenter.depth === 0) {
        depthStr = "ごく浅い";
    } else if (eq.hypocenter.depth > 0) {
        depthStr = `約${eq.hypocenter.depth}km`;
    }

    // 色分けの判定
    let typeClass = '';
    if (scaleNum >= 45) typeClass = 'intensity-high'; // 5弱以上
    else if (scaleNum >= 30) typeClass = 'intensity-mid'; // 3〜4
    
    // 津波情報の判定
    let tsunamiInfo = '';
    switch (eq.domesticTsunami) {
        case 'Warning': tsunamiInfo = '<div class="tsunami-warning-text">⚠️ 津波警報等発表中</div>'; break;
        case 'Checking': tsunamiInfo = '<div style="color: #ffa502; margin-top: 5px;">⚠️ 津波の有無を調査中</div>'; break;
        case 'NonDestructive': tsunamiInfo = '<div style="color: #2ed573; margin-top: 5px;">若干の海面変動あり（被害なし）</div>'; break;
        case 'None': tsunamiInfo = '<div style="color: #a4b0be; margin-top: 5px;">津波の心配なし</div>'; break;
        case 'Unknown': tsunamiInfo = '<div style="color: #a4b0be; margin-top: 5px;">津波の影響は不明</div>'; break;
    }

    const content = `
        <strong>${name}</strong> を震源とする地震がありました。<br>
        最大震度: <strong style="font-size: 18px;">${scaleStr}</strong> (規模: ${magnitude}， 深さ: ${depthStr})<br>
        ${tsunamiInfo}
        <span style="font-size: 11px; color: #a4b0be; margin-top: 4px; display: block;">発生時刻: ${time}</span>
    `;
    
    // 震度5弱以上または津波警報発表なら自動で消さない
    let displayTime = 60000;
    if (scaleNum >= 45 || eq.domesticTsunami === 'Warning') {
        displayTime = 0;
    }

    showRealtimePopup('地震情報 (速報)', content, typeClass, displayTime);
}

// 緊急地震速報（EEW）を処理
function handleEEWEvent(eew) {
    const areaName = eew.earthquake?.hypocenter?.name || '不明な地域';
    
    const content = `
        <strong>${areaName}</strong> 付近で地震発生。<br>
        強い揺れに警戒してください！
    `;
    
    showRealtimePopup('⚠️ 緊急地震速報 (警報)', content, 'eew-alert', 0);
}

// 津波情報を処理
function handleTsunamiEvent(data) {
    // もし津波警報が解除された場合（cancelled: true）
    if (data.cancelled) {
        showRealtimePopup('🌊 津波情報', '津波警報・注意報はすべて解除されました。', '', 0);
        return;
    }

    // エリア情報がない場合はデフォルトメッセージ
    if (!data.areas || data.areas.length === 0) {
        const defaultContent = `
            <strong style="color: #ffda79; font-size: 16px;">津波警報・注意報が発表されました。</strong><br>
            海岸や川の河口付近から直ちに離れてください！
        `;
        showRealtimePopup('🌊 津波情報', defaultContent, 'tsunami-alert', 0);
        return;
    }

    // 警報レベルごとに地域を分類・色分け
    const gradeMap = {
        'MajorWarning': { label: '大津波警報', color: '#da0eb5', bg: 'rgba(255, 71, 87, 0.2)' },
        'Warning':      { label: '津波警報', color: '#ff556f', bg: 'rgba(255, 107, 129, 0.2)' },
        'Advisory':     { label: '津波注意報', color: '#ffa502', bg: 'rgba(255, 165, 2, 0.2)' },
        'Watch':        { label: '津波予報', color: '#2ed573', bg: 'rgba(46, 213, 115, 0.2)' }
    };

    let areaHtml = '<div style="margin-top: 10px; font-size: 13px;">';

    data.areas.forEach(area => {
        const gradeInfo = gradeMap[area.grade] || { label: '不明', color: '#fff', bg: 'transparent' };
        // immediate（すぐに津波が来るか）が true の場合は強調
        const immediateMark = area.immediate ? '<span style="color:#ff4757; font-weight:bold;">[到達中]</span> ' : '';
        
        areaHtml += `
            <div style="margin-bottom: 4px; padding: 4px; background: ${gradeInfo.bg}; border-left: 3px solid ${gradeInfo.color};">
                <strong style="color: ${gradeInfo.color}; display: inline-block; width: 80px;">${gradeInfo.label}</strong>
                ${immediateMark}${area.name}
            </div>
        `;
    });
    areaHtml += '</div>';

    const content = `
        海岸や川の河口付近から直ちに離れてください！<br>
        ${areaHtml}
        <span style="font-size: 11px; color: #ced6e0; display: block; margin-top: 8px;">
            発表: ${data.issue.source} (${data.time.replace(/:\d{2}$/, '')})
        </span>
    `;

    // 0を指定して、手動で閉じるまで消さない
    showRealtimePopup('🌊 津波警報・注意報', content, 'tsunami-alert', 0);
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