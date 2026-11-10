const fs = require('fs');
const DATA_FILE = 'advisory.json';

async function main() {
    try {
        const res = await fetch('https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml');
        const xml = await res.text();

        let nankai = { active: false, id: 'nankai' };
        let hokkaido = { active: false, id: 'hokkaido' };
        let nankaiFound = false;
        let hokkaidoFound = false;
        
        const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

        for (const entry of entries) {
            const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
            const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
            const timeMatch = entry.match(/<updated>([\s\S]*?)<\/updated>/);

            if (titleMatch && contentMatch && timeMatch) {
                const title = titleMatch[1].trim();
                const content = contentMatch[1].trim();
                const time = timeMatch[1].trim();

                // ① 南海トラフの判定（独立）
                if (title.includes('南海トラフ') && !nankaiFound) {
                    nankaiFound = true;
                    if (
                        title.includes('調査終了') ||
                        content.includes('呼びかけ等していました') ||
                        content.includes('通常どおりの生活')
                    ) {
                        nankai = { active: false, id: 'nankai' };
                    } else {
                        nankai = { active: true, id: 'nankai', title, content, time };
                    }
                }

                // ② 北海道・三陸沖の判定（独立）
                if (title.includes('北海道・三陸沖後発地震注意情報') && !hokkaidoFound) {
                    hokkaidoFound = true;
                    if (
                        title.includes('期間の終了') ||
                        content.match(/特別な注意(.*?)終了/) ||
                        content.includes('通常どおりの生活')
                    ) {
                        hokkaido = { active: false, id: 'hokkaido' };
                    } else {
                        hokkaido = { active: true, id: 'hokkaido', title, content, time };
                    }
                }

                // 両方の最新情報が見つかった時点で探索終了
                if (nankaiFound && hokkaidoFound) break;
            }
        }

        // XMLから情報が押し出された場合の保持処理（配列対応）
        if (fs.existsSync(DATA_FILE)) {
            const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            // 以前の単一オブジェクト形式からの移行対策として配列化
            const currentList = Array.isArray(currentData) ? currentData : [currentData];

            for (const current of currentList) {
                if (current && current.active) {
                    const infoTime = new Date(current.time).getTime();
                    if (Date.now() - infoTime < 7 * 24 * 60 * 60 * 1000) {
                        if (current.id === 'nankai' && !nankaiFound) nankai = current;
                        if (current.id === 'hokkaido' && !hokkaidoFound) hokkaido = current;
                    }
                }
            }
        }

        const newAdvisoryList = [nankai, hokkaido];

        let currentAdvisoryList = [];
        if (fs.existsSync(DATA_FILE)) {
            const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            currentAdvisoryList = Array.isArray(currentData) ? currentData : [currentData];
        }

        if (JSON.stringify(currentAdvisoryList) !== JSON.stringify(newAdvisoryList)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(newAdvisoryList, null, 2));
            console.log('Status changed. File updated.');
        } else {
            console.log('No changes detected.');
        }
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

main();