import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// 从最近的 git tag 推导当前版本号，与 GitHub Release 保持一致
// 例如 tag = v6.4 → CURRENT_VERSION = '6.4'
//      tag = v6.3.2 → CURRENT_VERSION = '6.3.2'
// 没有 tag 时回退到 '0.0.0'
function getCurrentVersion(): string {
  try {
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf-8' }).trim();
    return tag.replace(/^v/, '');
  } catch {
    return '0.0.0';
  }
}

const APP_VERSION = getCurrentVersion();

export default defineConfig({
  plugins: [react()],
  base: './',  // 相对路径，APK 和 GitHub Pages 都能用
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: '0.0.0.0', port: 5173 },
  define: {
    // 在前端代码中可通过 __APP_VERSION__ 访问
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
})
