const fs = require('fs');
const DATA_FILE = 'advisory.json';

async function main() {
    try {
        const res = await fetch('https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml');
        const xml = await res.text();

        let newAdvisory = { active: false };
        
        // <entry>タグのブロックをすべて配列として抽出
        const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

        for (const entry of entries) {
            const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
            const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
            const timeMatch = entry.match(/<updated>([\s\S]*?)<\/updated>/);

            if (titleMatch && contentMatch && timeMatch) {
                const title = titleMatch[1].trim();
                const content = contentMatch[1].trim();
                const time = timeMatch[1].trim();

                // 「南海トラフ」または「北海道・三陸沖後発地震注意情報」を検知
                if (title.includes('南海トラフ') || title.includes('北海道・三陸沖後発地震注意情報')) {
                    
                    if (
                        title.includes('調査終了') ||                     // 臨時情報（調査終了）を検知
                        content.includes('呼びかけ等していました') ||       // 解説情報での期間終了（過去形）を検知
                        content.includes('特別な注意の呼びかけは終了') || // 北海道三陸沖などでの明確な終了フレーズ
                        content.includes('通常どおりの生活')              // 平常復帰フレーズ
                    ) {
                        newAdvisory = { active: false };
                    } else {
                        // 発表中（調査中・警戒・注意など）ならそのまま保存
                        newAdvisory = { active: true, title: title, content: content, time: time };
                    }
                    break; // 最新の1件で判定を確定させる
                }
            }
        }

        // XMLから情報が押し出されて見つからなかった場合の保持処理
        if (!newAdvisory.active && entries.length > 0) {
            if (fs.existsSync(DATA_FILE)) {
                const current = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
                if (current.active) {
                    const infoTime = new Date(current.time).getTime();
                    // 発表から1週間 (604800000ms) 経過していなければ状態を保持
                    if (Date.now() - infoTime < 7 * 24 * 60 * 60 * 1000) {
                        newAdvisory = current;
                    }
                }
            }
        }

        let currentAdvisory = { active: false };
        if (fs.existsSync(DATA_FILE)) {
            currentAdvisory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }

        if (JSON.stringify(currentAdvisory) !== JSON.stringify(newAdvisory)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(newAdvisory, null, 2));
            console.log('Status changed. File updated.');
        } else {
            console.log('No changes detected.');
        }
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

main();