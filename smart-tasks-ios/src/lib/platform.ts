// v6.9.7 — iOS 平台检测和适配
import { Capacitor } from '@capacitor/core';

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function isWeb(): boolean {
  return Capacitor.getPlatform() === 'web';
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// iOS 是否有刘海/ Dynamic Island（iPhone X 及以上）
export function hasNotch(): boolean {
  if (!isIOS()) return false;
  // 通过安全区域高度判断
  const safeTop = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--safe-top') || '0', 10);
  return safeTop > 20;
}

// iOS 底部 Home Indicator 高度
export function getHomeIndicatorHeight(): number {
  if (!isIOS()) return 0;
  const safeBottom = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--safe-bottom') || '0', 10);
  return Math.max(0, safeBottom - 8);
}

// iOS 系统版本
export function getIOSVersion(): number {
  if (!isIOS()) return 0;
  try {
    const ua = navigator.userAgent;
    const match = ua.match(/OS (\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
  } catch { return 0; }
}
