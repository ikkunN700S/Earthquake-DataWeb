// ==========================================
// リアルタイム地震情報 受信・ポップアップ機能
// ==========================================

let currentWs = null; 
let wsConnectionTimeoutId = null; // 接続タイムアウト用のタイマー
let lastWsReconnectTime = 0; 
let pollingIntervalId = null; 
let burstPollingIntervalId = null;
let burstTimeoutId = null;
let currentConnectionState = 'offline'; // 現在のステータスを管理
const processedEventIds = new Set(); 

// バックアップ通信が動いていなければ動かす補助関数
async function ensureFallbackRunning() {
    if (!pollingIntervalId && !burstPollingIntervalId) {
        const fetchPromise = fallbackPolling();
        pollingIntervalId = setInterval(fallbackPolling, 60000);
        await fetchPromise; 
    }
}

function updateWebSocketStatus(state) {
    currentConnectionState = state; // ステータスを保持
    let statusEl = document.getElementById('websocket-status-badge');
    
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'websocket-status-badge';
        statusEl.style.cssText = `
            position: fixed; top: 10px; right: 10px;
            padding: 6px 12px; border-radius: 20px;
            font-size: 12px; font-weight: bold; color: white;
            z-index: 10000; cursor: pointer; user-select: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            transition: background-color 0.3s;
        `;

        statusEl.onclick = () => {
            const now = Date.now();
            if (now - lastWsReconnectTime < 10000) {
                const timeLeft = Math.ceil((10000 - (now - lastWsReconnectTime)) / 1000);
                console.log(`短時間での連続アクセスはできません。あと ${timeLeft} 秒お待ちください。`);
                statusEl.style.transform = 'translateX(-5px)';
                setTimeout(() => statusEl.style.transform = 'translateX(5px)', 50);
                setTimeout(() => statusEl.style.transform = 'translateX(0)', 100);
                return;
            }
            lastWsReconnectTime = now;
            statusEl.style.transform = 'scale(0.95)';
            setTimeout(() => statusEl.style.transform = 'scale(1)', 100);

            // 接続試行中またはリアルタイム通信中なら「中断/切断」し、バックアップ通信に切り替える
            if (currentConnectionState === 'connecting' || currentConnectionState === 'realtime') {
                console.log('リアルタイム通信を停止し、手動でバックアップ通信に切り替えます');
                if (currentWs) {
                    currentWs.onclose = null;
                    currentWs.close();
                    currentWs = null;
                }
                if (wsConnectionTimeoutId) clearTimeout(wsConnectionTimeoutId);
                
                updateWebSocketStatus('fallback');
                ensureFallbackRunning();
            } else {
                console.log('WebSocketの再接続を手動実行します');
                connectRealtimeAPI();
            }
        };

        document.body.appendChild(statusEl);
    }

    if (state === 'realtime') {
        statusEl.textContent = '🟢 リアルタイム通信中';
        statusEl.style.backgroundColor = 'rgba(46, 213, 115, 0.9)';
    } else if (state === 'fallback') {
        statusEl.textContent = '🟠 バックアップ通信中';
        statusEl.style.backgroundColor = 'rgba(255, 165, 2, 0.9)';
    } else if (state === 'connecting') {
        statusEl.textContent = '🟡 接続試行中...';
        statusEl.style.backgroundColor = 'rgba(255, 211, 42, 0.9)';
    } else if (state === 'offline') {
        statusEl.textContent = '🔴 通信切断・オフライン';
        statusEl.style.backgroundColor = 'rgba(255, 71, 87, 0.9)';
    }
}

function processIncomingData(data) {
    if (processedEventIds.has(data.id)) return;

    if (typeof p2pApiDataList !== 'undefined' && p2pApiDataList.some(item => item.id === data.id)) {
        processedEventIds.add(data.id);
        return;
    }

    if (data.time) {
        const jstIso = data.time.replace(/\//g, '-').replace(' ', 'T') + '+09:00';
        const dataTimeMs = new Date(jstIso).getTime();
        const nowMs = Date.now();

        if (nowMs - dataTimeMs > 900000) {
            processedEventIds.add(data.id);
            return;
        }
    }

    processedEventIds.add(data.id);
    if (processedEventIds.size > 1000) {
        const firstItem = processedEventIds.values().next().value;
        processedEventIds.delete(firstItem);
    }

    if (data.code === 551 && data.earthquake) {
        handleEarthquakeEvent(data.earthquake);

        if (typeof p2pApiDataList !== 'undefined') {
            p2pApiDataList.unshift(data);
            if (p2pApiDataList.length > 100) p2pApiDataList.pop();
            const oldestApi = p2pApiDataList[p2pApiDataList.length - 1];
            if (oldestApi && oldestApi.earthquake && oldestApi.earthquake.time && typeof p2pOldestTimeMs !== 'undefined') {
                const jstOldest = oldestApi.earthquake.time.replace(/\//g, '-').replace(' ', 'T') + '+09:00';
                p2pOldestTimeMs = new Date(jstOldest).getTime() - 300000;
            }
        }
    } else if (data.code === 556 && !data.cancelled) {
        handleEEWEvent(data);
    } else if (data.code === 552) {
        handleTsunamiEvent(data);
    }
}

function showRealtimePopup(title, content, typeClass = '', duration = 60000) {
    const container = document.getElementById('realtime-notification-container');
    if (!container) return;

    container.style.zIndex = '20000';
    if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    const popup = document.createElement('div');
    popup.className = `realtime-popup ${typeClass}`;
    
    popup.style.position = 'relative';
    popup.style.zIndex = '20000';
    popup.style.userSelect = 'none';
    popup.style.touchAction = 'pan-y';
    
    popup.innerHTML = `
        <div class="popup-close-btn" style="position: absolute; top: 10px; right: 15px; z-index: 20001; cursor: pointer; font-size: 16px;">✖</div>
        <div class="realtime-popup-title" style="padding-right: 20px;">${title}</div>
        <div class="realtime-popup-content">${content}</div>
    `;

    const closePopupWithAnimation = () => {
        const currentTransform = popup.style.transform || 'translateX(0px)';
        const currentOpacity = popup.style.opacity || '1';

        const animation = popup.animate([
            { transform: currentTransform, opacity: currentOpacity },
            { transform: 'translateX(-100%)', opacity: 0 }
        ], {
            duration: 300,
            easing: 'ease-in-out',
            fill: 'forwards'
        });

        animation.onfinish = () => {
            if (popup.parentElement) popup.remove();
        };
    };

    const closeBtn = popup.querySelector('.popup-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopupWithAnimation();
    });

    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    popup.addEventListener('pointerdown', (e) => {
        if (e.target === closeBtn) return;
        startX = e.clientX;
        currentX = startX;
        isDragging = true;
        
        popup.style.transition = 'none'; 
        
        popup.setPointerCapture(e.pointerId); 
    });

    popup.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
        const deltaX = currentX - startX;

        if (deltaX < 0) {
            popup.style.transform = `translateX(${deltaX}px)`;
            popup.style.opacity = 1 - (Math.abs(deltaX) / 150); 
        }
    });

    const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        let deltaX = currentX - startX;

        if (deltaX < -50) {
            closePopupWithAnimation();
        } else {
            if (deltaX > 0) deltaX = 0;

            const snapBack = popup.animate([
                { transform: `translateX(${deltaX}px)`, opacity: popup.style.opacity || 1 },
                { transform: 'translateX(0px)', opacity: 1 }
            ], {
                duration: 200,
                easing: 'ease-out',
                fill: 'forwards'
            });
            
            snapBack.onfinish = () => {
                popup.style.transform = 'translateX(0px)';
                popup.style.opacity = '1';
                popup.style.transition = ''; 
            };
        }
        popup.releasePointerCapture(e.pointerId);
    };

    popup.addEventListener('pointerup', endDrag);
    popup.addEventListener('pointercancel', endDrag);

    container.prepend(popup);

    if (duration > 0) {
        setTimeout(() => {
            if (popup.parentElement) {
                closePopupWithAnimation();
            }
        }, duration);
    }
}

async function fallbackPolling() {
    try {
        const res = await fetch('https://api.p2pquake.net/v2/history?codes=551&codes=552&codes=556&limit=100');

        if (!res.ok) {
            if (pollingIntervalId || burstPollingIntervalId) updateWebSocketStatus('offline');
            return;
        }

        if (pollingIntervalId || burstPollingIntervalId) {
            if (currentConnectionState !== 'connecting') {
                updateWebSocketStatus('fallback');
            }
        }

        const dataList = await res.json();
        for (let i = dataList.length - 1; i >= 0; i--) {
            processIncomingData(dataList[i]);
        }
    } catch (error) {
        console.warn("バックアップAPIの取得に失敗しました", error);
        updateWebSocketStatus('offline');
    }
}

async function connectRealtimeAPI() {
    if (currentWs) {
        currentWs.onclose = null; 
        currentWs.close();
        currentWs = null;
    }
    if (wsConnectionTimeoutId) {
        clearTimeout(wsConnectionTimeoutId);
        wsConnectionTimeoutId = null;
    }

    updateWebSocketStatus('connecting');
    
    // 接続試行時、バックアップ通信（履歴取得）を完了させポップアップを出す
    await ensureFallbackRunning();

    // 履歴取得中にユーザーが手動でバックアップ通信に切り替えていた場合はWS接続を中断
    if (currentConnectionState === 'fallback') return;

    currentWs = new WebSocket('wss://api.p2pquake.net/v2/ws');

    // 5秒以内に接続が確立しなかった場合はタイムアウトとして切断
    wsConnectionTimeoutId = setTimeout(() => {
        if (currentWs && currentWs.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket接続タイムアウト。バックアップ通信へ切り替えます');
            currentWs.onclose = null; 
            currentWs.close();
            currentWs = null;
            
            updateWebSocketStatus('fallback');
            ensureFallbackRunning();
        }
    }, 5000);

    currentWs.onopen = () => {
        console.log('リアルタイム地震速報サーバーに接続しました');
        updateWebSocketStatus('realtime'); 
        
        if (wsConnectionTimeoutId) clearTimeout(wsConnectionTimeoutId);

        // 接続が完全に確立してはじめてバックアップ通信を停止する
        if (pollingIntervalId) { clearInterval(pollingIntervalId); pollingIntervalId = null; }
        if (burstPollingIntervalId) { clearInterval(burstPollingIntervalId); burstPollingIntervalId = null; }
        if (burstTimeoutId) { clearTimeout(burstTimeoutId); burstTimeoutId = null; }
    };

    currentWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processIncomingData(data); 
    };

    currentWs.onclose = () => {
        updateWebSocketStatus('fallback');
        if (wsConnectionTimeoutId) clearTimeout(wsConnectionTimeoutId);

        if (pollingIntervalId) { clearInterval(pollingIntervalId); pollingIntervalId = null; }
        if (burstPollingIntervalId) { clearInterval(burstPollingIntervalId); burstPollingIntervalId = null; }
        if (burstTimeoutId) { clearTimeout(burstTimeoutId); burstTimeoutId = null; }

        console.log('バックアップ通信を行います(3分間は10秒間隔)');

        fallbackPolling();
        burstPollingIntervalId = setInterval(fallbackPolling, 10000);

        burstTimeoutId = setTimeout(() => {
            console.log('通常バックアップ通信に切り替えます');
            clearInterval(burstPollingIntervalId);
            burstPollingIntervalId = null;
            pollingIntervalId = setInterval(fallbackPolling, 60000);
        }, 180000);
    };

    currentWs.onerror = (error) => {
        console.error('WebSocket エラー:', error);
    };
}

function handleEarthquakeEvent(eq) {
    if (!eq) return;

    const time = eq.time ? eq.time.replace(/:\d{2}$/, '') : '不明';
    const name = (eq.hypocenter && eq.hypocenter.name) ? eq.hypocenter.name : '震源調査中';
    const scaleNum = eq.maxScale;

    const scaleMap = { 70:'7', 60:'6強', 55:'6弱', 50:'5強', 45:'5弱', 40:'4', 30:'3', 20:'2', 10:'1' };
    const scaleStr = scaleMap[scaleNum] || (scaleNum === -1 ? '調査中' : '不明');

    let magnitude = "不明";
    if (eq.hypocenter && eq.hypocenter.magnitude !== -1) {
        magnitude = `M${eq.hypocenter.magnitude.toFixed(1)}`;
    } else if (eq.hypocenter && eq.hypocenter.magnitude === -1) {
        magnitude = "調査中";
    }

    let depthStr = "不明";
    if (eq.hypocenter) {
        if (eq.hypocenter.depth === 0) {
            depthStr = "ごく浅い";
        } else if (eq.hypocenter.depth > 0) {
            depthStr = `約${eq.hypocenter.depth}km`;
        } else if (eq.hypocenter.depth === -1) {
            depthStr = "調査中";
        }
    }

    let typeClass = '';
    if (scaleNum >= 45) typeClass = 'intensity-high';
    else if (scaleNum >= 30) typeClass = 'intensity-mid';

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

    let displayTime = 60000;
    if (scaleNum >= 45 || eq.domesticTsunami === 'Warning') {
        displayTime = 0;
    }

    showRealtimePopup('地震情報 (速報)', content, typeClass, displayTime);
}

function handleEEWEvent(eew) {
    const areaName = eew.earthquake?.hypocenter?.name || '不明な地域';
    const content = `
        <strong>${areaName}</strong> 付近で地震発生。<br>
        強い揺れに警戒してください！
    `;
    showRealtimePopup('⚠️ 緊急地震速報 (警報)', content, 'eew-alert', 0);
}

function handleTsunamiEvent(data) {
    if (data.cancelled) {
        showRealtimePopup('🌊 津波情報', '津波警報・注意報はすべて解除されました。', '', 0);
        return;
    }

    if (!data.areas || data.areas.length === 0) {
        const defaultContent = `
            <strong style="color: #ffda79; font-size: 16px;">津波警報・注意報が発表されました。</strong><br>
            海岸や川の河口付近から直ちに離れてください！
        `;
        showRealtimePopup('🌊 津波情報', defaultContent, 'tsunami-alert', 0);
        return;
    }

    const gradeMap = {
        'MajorWarning': { label: '大津波警報', color: '#da0eb5', bg: 'rgba(255, 71, 87, 0.2)' },
        'Warning':      { label: '津波警報', color: '#ff556f', bg: 'rgba(255, 107, 129, 0.2)' },
        'Advisory':     { label: '津波注意報', color: '#ffa502', bg: 'rgba(255, 165, 2, 0.2)' },
        'Watch':        { label: '津波予報', color: '#2ed573', bg: 'rgba(46, 213, 115, 0.2)' }
    };

    let areaHtml = '<div style="margin-top: 10px; font-size: 13px;">';

    data.areas.forEach(area => {
        const gradeInfo = gradeMap[area.grade] || { label: '不明', color: '#fff', bg: 'transparent' };
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

    showRealtimePopup('🌊 津波警報・注意報', content, 'tsunami-alert', 0);
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('realtime-notification-container')) {
        const container = document.createElement('div');
        container.id = 'realtime-notification-container';
        container.className = 'realtime-notification-container';
        document.body.appendChild(container);
    }

    connectRealtimeAPI();

    checkSpecialAdvisoriesOnLoad();
});

async function checkSpecialAdvisoriesOnLoad() {
    try {
        const res = await fetch(`advisory.json?_=${Date.now()}`);
        if (!res.ok) return;

        const rawData = await res.json();
        
        // 取得したデータが単一のオブジェクトだった場合も配列に変換する安全対策
        const dataList = Array.isArray(rawData) ? rawData : [rawData];
        
        // 配列をループして、activeな臨時情報があればすべて表示する
        dataList.forEach(data => {
            if (data && data.active) {
                const formattedContent = data.content.replace(/\r?\n/g, '<br>');
                const formattedTime = data.time.substring(0, 16).replace('T', ' ');

                const contentHtml = `
                    <strong style="color: #ff4757; font-size: 15px;">⚠️ 地震に関する重大な情報が発表されています</strong><br>
                    <span style="font-size: 14px; font-weight: bold; margin-top: 5px; display: block;">${data.title}</span>
                    
                    <div style="font-size: 12px; color: #f1f2f6; margin-top: 6px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; line-height: 1.5; max-height: 150px; overflow-y: auto; border: 1px solid rgba(255, 71, 87, 0.3);">
                        ${formattedContent}
                    </div>
                    
                    <span style="font-size: 11px; color: #ced6e0; display: block; margin-top: 8px;">
                        発表: 気象庁 (${formattedTime})
                    </span>
                `;
                
                showRealtimePopup('🚨 地震に関する臨時情報', contentHtml, 'nankai-alert', 0);
            }
        });
    } catch (error) {
        console.warn("臨時情報の確認に失敗しました", error);
    }
}