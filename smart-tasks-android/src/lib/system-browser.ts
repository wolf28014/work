// v6.10.3 — 跨平台「用系统默认浏览器打开 URL」工具
// ============================================================
// 问题：Capacitor 中 window.open(url, '_blank') 默认会在 In-App WebView
//       或 Chrome Custom Tab 中打开，导致：
//   - GitHub release 下载链接可能不触发 APK 下载
//   - 某些设备上跳转到 Google 网页而非系统浏览器
//   - 用户无法返回到 App
//
// 解决：在 Android 原生层注册 SystemBrowser 插件，通过 Intent.ACTION_VIEW
//       强制用系统默认浏览器（Chrome/Edge/Firefox/Brave 等）打开。
//       iOS / Web 端 fallback 到 window.open（iOS 用 Safari，Web 直接打开）。
// ============================================================

import { Capacitor } from '@capacitor/core';

/**
 * 用系统默认浏览器打开 URL
 * - Android: 调用原生 SystemBrowser 插件
 * - iOS / Web: fallback 到 window.open
 */
export async function openInSystemBrowser(url: string): Promise<void> {
  if (!url) return;

  // 仅 Android 走原生插件
  if (Capacitor.getPlatform() === 'android') {
    try {
      // 动态访问原生插件（避免 TS 类型问题）
      const bridge = (Capacitor as any).Plugins;
      if (bridge?.SystemBrowser?.open) {
        await bridge.SystemBrowser.open({ url });
        return;
      }
    } catch (e) {
      console.warn('[openInSystemBrowser] native plugin failed, fallback to window.open:', e);
    }
  }

  // Fallback: iOS / Web / 插件未注册
  try {
    window.open(url, '_blank');
  } catch (e) {
    console.error('[openInSystemBrowser] window.open failed:', e);
  }
}
