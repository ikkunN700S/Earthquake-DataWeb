const fs = require('fs');

// P2P地震情報API (地震情報のみ指定: code=551)
const API_BASE = 'https://api.p2pquake.net/v2/history?codes=551&limit=100';

// 100件 × 30ページ = 過去3000件の地震履歴をチェックし網羅性を高める
const PAGES_TO_FETCH = 30; 

async function generateCentersJson() {
    console.log('過去の地震データを取得し、地名辞書を作成しています...');
    const centers = {};

    try {
        for (let i = 0; i < PAGES_TO_FETCH; i++) {
            const offset = i * 100;
            const url = `${API_BASE}&offset=${offset}`;
            
            // 進捗をコンソールに表示
            process.stdout.write(`\rデータ取得中... ${i + 1}/${PAGES_TO_FETCH} ページ目`);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`APIレスポンスエラー: ${response.status}`);
            
            const data = await response.json();

            data.forEach(entry => {
                const hypo = entry.earthquake?.hypocenter;
                
                // 座標が -200（P2PQuakeAPIにおける「不明」の定義）でない、かつ地名が存在する場合
                if (hypo && hypo.name && hypo.latitude !== -200 && hypo.longitude !== -200) {
                    if (!centers[hypo.name]) {
                        // 未登録の地名なら辞書に追加
                        centers[hypo.name] = {
                            lat: hypo.latitude,
                            lon: hypo.longitude
                        };
                    }
                }
            });

            // API提供元のサーバーに負荷をかけないよう、1ページごとに1秒待機する（重要）
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\n\nデータ抽出完了！');
        
        // オブジェクトのキー（地名）で五十音順等にソートすると後で見やすいですが、
        // 今回はそのままJSON形式でファイルに書き出します
        fs.writeFileSync('centers.json', JSON.stringify(centers, null, 2), 'utf-8');
        console.log(`合計 ${Object.keys(centers).length} 箇所の震央座標を 'centers.json' に保存しました。`);

    } catch (error) {
        console.error('\nエラーが発生しました:', error.message);
        console.log('※ Node.js v18以上（組み込みのfetch API）を使用しているか確認してください。');
    }
}

// 実行
generateCentersJson();