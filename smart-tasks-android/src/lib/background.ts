// 背景设置 - 5 个预设纯色 + 自定义图片
// 数据存 localStorage（小） + IndexedDB（图片 base64，可能较大）

const STORAGE_KEY = 'app-background';
const DB_NAME = 'smart-tasks-bg';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const IMAGE_RECORD_ID = 'custom-bg';

export type BackgroundType = 'preset' | 'custom' | 'none';

export interface BackgroundSettings {
  type: BackgroundType;
  presetId?: string;     // 预设背景 id
  customImageId?: string; // 自定义图片记录 id
  blur?: number;         // 模糊度 0-20
  dim?: number;          // 暗化 0-1（让任务卡片更突出）
}

// 5 个高级纯色背景（从浅到深）
export interface PresetBackground {
  id: string;
  name: string;
  // 渐变背景：linear-gradient 角度 + 起止颜色
  gradient: string;
  // 用于 CSS 变量
  cssBackground: string;
  // 缩略图颜色（用于选择器小方块）
  thumb: string;
  // 文字色（深色或浅色）
  textMode: 'light' | 'dark';
}

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  {
    id: 'pearl',
    name: '珠光白',
    gradient: 'linear-gradient(135deg, #fafafa 0%, #f0f0f3 50%, #e8e8ed 100%)',
    cssBackground: 'linear-gradient(135deg, #fafafa 0%, #f0f0f3 50%, #e8e8ed 100%)',
    thumb: 'linear-gradient(135deg, #fafafa, #e8e8ed)',
    textMode: 'dark',
  },
  {
    id: 'mist',
    name: '雾霭灰',
    gradient: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)',
    cssBackground: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)',
    thumb: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
    textMode: 'dark',
  },
  {
    id: 'aurora',
    name: '极光绿',
    gradient: 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 50%, #10b981 100%)',
    cssBackground: 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 50%, #10b981 100%)',
    thumb: 'linear-gradient(135deg, #d1fae5, #10b981)',
    textMode: 'dark',
  },
  {
    id: 'twilight',
    name: '暮光紫',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
    cssBackground: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
    thumb: 'linear-gradient(135deg, #6366f1, #a855f7)',
    textMode: 'light',
  },
  {
    id: 'midnight',
    name: '子夜黑',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
    cssBackground: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
    thumb: 'linear-gradient(135deg, #1e293b, #020617)',
    textMode: 'light',
  },
];

// IndexedDB 操作
let dbInstance: IDBDatabase | null = null;

function openBgDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveCustomImage(base64: string): Promise<void> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).put({ id: IMAGE_RECORD_ID, data: base64, savedAt: Date.now() });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getCustomImage(): Promise<string | null> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readonly');
    const req = t.objectStore(STORE_NAME).get(IMAGE_RECORD_ID);
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearCustomImage(): Promise<void> {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).delete(IMAGE_RECORD_ID);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// 设置读写
export function getBackgroundSettings(): BackgroundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: 'preset', presetId: 'pearl' }; // 默认珠光白
    return JSON.parse(raw);
  } catch {
    return { type: 'preset', presetId: 'pearl' };
  }
}

export function saveBackgroundSettings(s: BackgroundSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// 计算最终应用的背景 CSS
export function resolveBackgroundCss(settings: BackgroundSettings, customImage?: string | null): {
  css: string;
  textMode: 'light' | 'dark';
} | null {
  if (settings.type === 'none') return null;
  if (settings.type === 'preset') {
    const preset = PRESET_BACKGROUNDS.find(p => p.id === settings.presetId);
    if (!preset) return null;
    return { css: preset.cssBackground, textMode: preset.textMode };
  }
  if (settings.type === 'custom' && customImage) {
    return { css: `url(${customImage}) center/cover no-repeat fixed`, textMode: 'light' };
  }
  return null;
}
