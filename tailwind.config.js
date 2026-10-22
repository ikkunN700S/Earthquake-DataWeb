/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./script.js",
    "./**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0f172a', // 全体背景・ヘッダー
          800: '#1e293b', // パネル・カード背景
          700: '#334155', // 境界線・ホバー色
          600: '#475569', // 入力枠など
        },
        accent: '#38bdf8' // アクセント水色
      }
    },
  },
  plugins: [],
}