// 应用更新检查
// 优先从 Supabase 查询（私有仓库可用），失败时回退到 GitHub API（公开仓库可用）
import { getSupabase, isSupabaseConfigured } from './supabase';
import { showToast } from '../components/Toast';

const GITHUB_REPO = 'wolf28014/work';

// 当前版本 - 务必与 GitHub Release tag 保持一致
export const CURRENT_VERSION = '3.0.0';

// 从 Supabase 查询最新版本
async function checkFromSupabase(): Promise<{ version: string; url: string; notes: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('app_versions')
      .select('version, url, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      version: data.version,
      url: data.url,
      notes: data.notes || '',
    };
  } catch {
    return null;
  }
}

// 从 GitHub API 查询最新版本（仅当仓库公开时可用）
async function checkFromGitHub(): Promise<{ version: string; url: string; notes: string } | null> {
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

// 综合检查：先试 Supabase，失败再试 GitHub
export async function checkLatestVersion(): Promise<{ version: string; url: string; notes: string } | null> {
  // 1. 先从 Supabase 查
  const fromSupa = await checkFromSupabase();
  if (fromSupa) return fromSupa;

  // 2. 回退到 GitHub
  const fromGithub = await checkFromGitHub();
  if (fromGithub) return fromGithub;

  return null;
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

// 启动时检查更新（后台静默）
export async function checkUpdateOnLaunch() {
  try {
    const latest = await checkLatestVersion();
    if (latest && isNewerVersion(latest.version, CURRENT_VERSION)) {
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

// 手动检查更新
export async function checkUpdateManual(): Promise<{ hasUpdate: boolean; version?: string; url?: string; notes?: string }> {
  const latest = await checkLatestVersion();
  if (!latest) {
    showToast('检查失败，请检查网络或稍后再试', 'error');
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
    showToast(`当前已是最新版本 v${CURRENT_VERSION}`, 'success');
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
