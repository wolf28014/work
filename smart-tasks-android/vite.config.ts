import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/work/',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: '0.0.0.0', port: 5173 },
})
