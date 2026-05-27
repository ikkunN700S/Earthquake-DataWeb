document.getElementById('share-link').addEventListener('click', async (e) => {
    e.preventDefault(); // リンクの通常の遷移を防ぐ

    // シェアデータ
    const shareData = {
        title: '地震データベースWeb',
        text: '地震データを検索・可視化し、閲覧できるWebアプリです',
        url: window.location.href
    };

    // ブラウザが Web Share API に対応しているかチェック
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            // 成功時の処理（何もしなくてもOK）
        } catch (error) {
            // ユーザーがシェアを途中でキャンセルした時のエラーなどは無視する
            console.log('シェアがキャンセルされました', error);
        }
    } else {
        // 非対応ブラウザの場合はURLをコピーさせる
        navigator.clipboard.writeText(shareData.url).then(() => {
            alert('URLをクリップボードにコピーしました！');
        }).catch(() => {
            alert('このブラウザはシェア機能に対応していません。URLを手動でコピーしてください。');
        });
    }
});