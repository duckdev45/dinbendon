import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 本機開發用 /；build 預設相對路徑，放哪個子路徑底下都能跑
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 }, // exceljs 只在匯出時延遲載入
  base: command === 'build' ? (process.env.BASE_PATH ?? './') : '/',
}))
