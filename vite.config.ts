import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitLab Pages 會放在 /dinbendon/ 底下；本機開發用 /
export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 }, // exceljs 只在匯出時延遲載入
  base: command === 'build' ? (process.env.BASE_PATH ?? './') : '/',
}))
