import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // 相对路径，APK 和 GitHub Pages 都能用
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: '0.0.0.0', port: 5173 },
})
