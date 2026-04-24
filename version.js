fetch('/Earthquake-DataWeb/version.json?v=' + new Date().getTime())
  .then(res => res.json())
  .then(data => {
    const el = document.getElementById('site-version');
    if (el && data.version) {
      el.textContent = `${data.version}`;
    }
  })
  .catch(err => {
    console.error('バージョン情報の読み込みに失敗しました:', err);
  });
