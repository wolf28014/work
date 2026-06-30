// 应用更新检查 + Capacitor Updater 热更新
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App } from '@capacitor/app';
import { showToast } from '../components/Toast';

const GITHUB_REPO = 'wolf28014/work';

// 当前版本（从 package.json 注入，这里硬编码）
export const CURRENT_VERSION = '1.9.0';

// 检查 GitHub Release 最新版本
export async function checkLatestVersion(): Promise<{ version: string; url: string; notes: string } | null> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const version = (data.tag_name || '').replace(/^v/, '');
    const url = data.assets?.find((a: any) => a.name.endsWith('.apk'))?.browser_download_url || data.html_url;
    const notes = data.body || '';
    return { version, url, notes };
  } catch {
    return null;
  }
}

// 比较版本号
export function isNewerVersion(remote: string, current: string): boolean {
  const r = remote.split('.').map(n => parseInt(n) || 0);
  const c = current.split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const ri = r[i] || 0;
    const ci = c[i] || 0;
    if (ri > ci) return true;
    if (ri < ci) return false;
  }
  return false;
}

// 启动时检查更新（不弹窗，只在后台拉取信息）
export async function checkUpdateOnLaunch() {
  // 1. 检查热更新（Capacitor Updater）
  try {
    // 注：需要在 Capgo 后台配置 channel 后才能使用
    // const latest = await CapacitorUpdater.getLatest();
    // if (latest.version && isNewerVersion(latest.version, CURRENT_VERSION)) {
    //   await CapacitorUpdater.download({ url: latest.url });
    //   await CapacitorUpdater.set({ version: latest.version });
    //   showToast('已更新到最新版', 'success');
    // }
  } catch (e) {
    console.log('Hot update skipped:', e);
  }

  // 2. 检查全量更新（GitHub Release）
  try {
    const latest = await checkLatestVersion();
    if (latest && isNewerVersion(latest.version, CURRENT_VERSION)) {
      // 缓存到 localStorage，让用户在设置页面看到提示
      localStorage.setItem('update-available', JSON.stringify({
        version: latest.version,
        url: latest.url,
        notes: latest.notes,
        checkedAt: Date.now(),
      }));
    } else {
      localStorage.removeItem('update-available');
    }
  } catch (e) {
    console.log('Update check failed:', e);
  }
}

// 手动检查更新（用户点击设置里的"检查更新"）
export async function checkUpdateManual(): Promise<{ hasUpdate: boolean; version?: string; url?: string; notes?: string }> {
  const latest = await checkLatestVersion();
  if (!latest) {
    showToast('检查失败，请稍后再试', 'error');
    return { hasUpdate: false };
  }
  if (isNewerVersion(latest.version, CURRENT_VERSION)) {
    localStorage.setItem('update-available', JSON.stringify({
      version: latest.version,
      url: latest.url,
      notes: latest.notes,
      checkedAt: Date.now(),
    }));
    return { hasUpdate: true, ...latest };
  } else {
    localStorage.removeItem('update-available');
    showToast(`当前已是最新版本 ${CURRENT_VERSION}`, 'success');
    return { hasUpdate: false };
  }
}

// 获取已缓存的更新信息
export function getCachedUpdateInfo(): { version: string; url: string; notes: string } | null {
  try {
    const raw = localStorage.getItem('update-available');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
