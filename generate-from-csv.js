const fs = require('fs');

// ==========================================
// 1. 設定
// ==========================================
// スプレッドシートの公開URL（カンマ区切りCSV形式）
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSn6ZKPAr4mlAX68W1UVmp8wchoAn2qz2yUhCuIop_oI015bBHQPRL9iqZvUB6fAfQbKwWQ5X0QVKYZ/pub?gid=1745802546&single=true&output=csv';
const OUTPUT_FILE = 'centers.json';

// 地図APIが苦手とする「海域」や「特殊な地名」の事前定義マスター
const PREDEFINED_CENTERS = {
    "三陸沖": { lat: 39.0, lon: 143.5 },
    "宮城県沖": { lat: 38.3, lon: 142.0 },
    "福島県沖": { lat: 37.5, lon: 141.5 },
    "岩手県沖": { lat: 39.5, lon: 142.5 },
    "青森県東方沖": { lat: 41.0, lon: 142.5 },
    "釧路沖": { lat: 42.5, lon: 144.5 },
    "十勝沖": { lat: 42.0, lon: 144.0 },
    "根室半島南東沖": { lat: 43.0, lon: 146.0 },
    "茨城県沖": { lat: 36.5, lon: 140.8 },
    "千葉県東方沖": { lat: 35.5, lon: 141.0 },
    "房総半島はるか沖": { lat: 34.5, lon: 141.5 },
    "鹿島灘": { lat: 36.1, lon: 140.7 },
    "相模湾": { lat: 35.0, lon: 139.3 },
    "東京湾": { lat: 35.5, lon: 139.8 },
    "駿河湾": { lat: 34.8, lon: 138.5 },
    "遠州灘": { lat: 34.2, lon: 137.5 },
    "伊豆大島近海": { lat: 34.7, lon: 139.4 },
    "紀伊水道": { lat: 34.0, lon: 134.9 },
    "大阪湾": { lat: 34.5, lon: 135.2 },
    "播磨灘": { lat: 34.6, lon: 134.6 },
    "伊予灘": { lat: 33.7, lon: 132.1 },
    "豊後水道": { lat: 33.0, lon: 132.0 },
    "日向灘": { lat: 32.0, lon: 131.8 },
    "薩摩半島西方沖": { lat: 31.4, lon: 129.8 },
    "大隅半島東方沖": { lat: 31.2, lon: 131.4 },
    "奄美大島近海": { lat: 28.3, lon: 129.5 },
    "奄美大島北東沖": { lat: 28.7, lon: 130.3 },
    "奄美大島北西沖": { lat: 28.8, lon: 128.8 },
    "トカラ列島近海": { lat: 29.5, lon: 129.5 },
    "沖縄本島近海": { lat: 26.5, lon: 128.0 },
    "宮古島近海": { lat: 24.8, lon: 125.3 },
    "石垣島近海": { lat: 24.3, lon: 124.2 },
    "台湾付近": { lat: 24.0, lon: 121.5 }
};

// ==========================================
// 2. メイン処理
// ==========================================
async function generateCenters() {
    console.log('スプレッドシートからデータを取得しています...');
    
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        
        // CSVから地名（3列目）を抽出し、重複を削除
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const uniqueLocations = new Set();
        
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 3) {
                uniqueLocations.add(parts[2].trim());
            }
        });

        console.log(`抽出された固有の地名: ${uniqueLocations.size}件`);

        // 既存のcenters.jsonがあれば読み込む（無駄なAPIリクエストを省くため）
        let finalCenters = {};
        if (fs.existsSync(OUTPUT_FILE)) {
            finalCenters = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
            console.log('既存の centers.json を読み込みました。');
        }

        // マスター辞書をマージ（上書き）
        finalCenters = { ...finalCenters, ...PREDEFINED_CENTERS };

        // 不足している地名を探してAPIで座標を取得
        let apiCallCount = 0;
        for (const location of uniqueLocations) {
            if (!finalCenters[location]) {
                process.stdout.write(`座標検索中: ${location} ... `);
                
                // OpenStreetMap Nominatim APIを使用
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
                // ヘッダーに User-Agent を追加して自分が何者かを名乗る
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'MyEarthquakeMapApp/1.0 (135494855+ikkunN700S@users.noreply.github.com)' 
                    }
                });

                // もしアクセス拒否(403等)をされたら、エラーで止めずにスキップする安全対策
                if (!res.ok) {
                    console.log(`アクセスエラー (${res.status}) - スキップします`);
                    continue; 
                }

                const data = await res.json();

                if (data && data.length > 0) {
                    finalCenters[location] = {
                        lat: parseFloat(data[0].lat),
                        lon: parseFloat(data[0].lon)
                    };
                    console.log(`OK (${data[0].lat}, ${data[0].lon})`);
                } else {
                    console.log(`見つかりませんでした (要手動追加)`);
                }

                // APIの利用制限（1秒1リクエスト）を厳守
                await new Promise(resolve => setTimeout(resolve, 1200));
                apiCallCount++;
            }
        }

        // ファイルに保存
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalCenters, null, 2), 'utf-8');
        
        console.log('\n==================================');
        console.log(`処理完了！`);
        console.log(`- APIを使用した新規検索: ${apiCallCount}件`);
        console.log(`- 保存された総地名数: ${Object.keys(finalCenters).length}件`);
        console.log(`'${OUTPUT_FILE}' を保存しました。このファイルを GitHub Pages にアップロードしてください。`);
        
    } catch (error) {
        console.error('エラーが発生しました:', error);
    }
}

// 実行
generateCenters();