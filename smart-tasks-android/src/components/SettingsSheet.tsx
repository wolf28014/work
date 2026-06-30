import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../lib/store';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/ai-client';
import { exportAllData, importAllData } from '../lib/db';
import { tasksToCSV } from '../lib/task-utils';
import { showToast } from './Toast';
import {
  PRESET_BACKGROUNDS,
  getBackgroundSettings,
  saveBackgroundSettings,
  saveCustomImage,
  getCustomImage,
  clearCustomImage,
  type BackgroundSettings,
} from '../lib/background';

interface Props { onClose: () => void; }

export default function SettingsSheet({ onClose }: Props) {
  const { theme, toggleTheme, tasks, purgeTask, restoreTask } = useTaskStore();
  const [tab, setTab] = useState<'general' | 'background' | 'ai' | 'data' | 'trash'>('general');
  const existingAI = getAISettings();
  const [baseURL, setBaseURL] = useState(existingAI?.baseURL || 'https://open.bigmodel.cn/api/paas/v4');
  const [apiKey, setApiKey] = useState(existingAI?.apiKey || '');
  const [model, setModel] = useState(existingAI?.model || 'glm-4-flash');

  // 背景设置
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(getBackgroundSettings);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCustomImage().then(setCustomImage).catch(() => {});
  }, []);

  function applyBackground(s: BackgroundSettings) {
    setBgSettings(s);
    saveBackgroundSettings(s);
    // 触发全局事件让 App 重新读取
    window.dispatchEvent(new CustomEvent('background-changed'));
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB', 'error');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      e.target.value = '';
      return;
    }
    try {
      // 压缩图片：用 canvas 缩放到最大 1920px
      const compressed = await compressImage(file, 1920, 0.85);
      await saveCustomImage(compressed);
      setCustomImage(compressed);
      applyBackground({ type: 'custom', customImageId: 'custom-bg' });
      showToast('背景已应用', 'success');
    } catch (err: any) {
      showToast('上传失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function handleClearCustom() {
    await clearCustomImage();
    setCustomImage(null);
    if (bgSettings.type === 'custom') {
      applyBackground({ type: 'preset', presetId: 'pearl' });
    }
    showToast('已清除自定义背景', 'info');
  }

  function saveAI() {
    if (!baseURL || !apiKey || !model) { showToast('请填写完整', 'error'); return; }
    saveAISettings({ baseURL, apiKey, model });
    showToast('AI 设置已保存', 'success');
  }

  async function handleExportJSON() {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出 JSON', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  }

  async function handleExportCSV() {
    try {
      const csv = tasksToCSV(tasks.filter(t => !t.deletedAt));
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出 CSV', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAllData(data, true);
      showToast('导入成功，刷新中…', 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) { showToast('导入失败：' + e.message, 'error'); }
  }

  const trashedTasks = tasks.filter(t => t.deletedAt);

  return (
    <div className="fixed inset-0 z-50 modal-mask flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white dark:bg-black slide-up max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-3xl"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={onClose} className="text-blue-500 text-[15px]">完成</button>
          <span className="text-[15px] font-semibold">设置</span>
          <span className="w-10" />
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 overflow-x-auto no-scrollbar">
          {([
            { id: 'general', label: '通用' },
            { id: 'background', label: '背景' },
            { id: 'ai', label: 'AI' },
            { id: 'data', label: '数据' },
            { id: 'trash', label: '回收站' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[56px] py-2.5 text-sm font-medium relative ${tab === t.id ? 'text-emerald-500' : 'text-slate-500'}`}
            >
              {t.label}
              {tab === t.id && (<div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-emerald-500 rounded-full" />)}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'general' && (
            <div className="ios-list-group">
              <div className="ios-list-item">
                <span className="text-sm flex-1">深色模式</span>
                <button
                  onClick={toggleTheme}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors ${theme === 'dark' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="ios-list-item">
                <span className="text-sm flex-1">版本</span>
                <span className="text-xs text-slate-400">v1.0.0</span>
              </div>
              <div className="ios-list-item">
                <span className="text-sm flex-1">项目</span>
                <span className="text-xs text-slate-400">Smart-Tasks Android</span>
              </div>
            </div>
          )}

          {tab === 'background' && (
            <div className="space-y-4">
              <div>
                <div className="text-[13px] font-medium text-slate-500 mb-2 px-1">预设背景</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESET_BACKGROUNDS.map(preset => {
                    const isActive = bgSettings.type === 'preset' && bgSettings.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => applyBackground({ type: 'preset', presetId: preset.id })}
                        className={`relative aspect-[3/4] rounded-2xl overflow-hidden transition-all active:scale-95 ${
                          isActive ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-black' : ''
                        }`}
                        style={{ background: preset.cssBackground }}
                      >
                        <div className={`absolute inset-x-0 bottom-0 py-1.5 text-center text-[10px] font-medium ${
                          preset.textMode === 'light' ? 'text-white bg-black/30' : 'text-slate-700 bg-white/60'
                        }`}>
                          {preset.name}
                        </div>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[13px] font-medium text-slate-500 mb-2 px-1">自定义背景</div>
                <div className="ios-list-group">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800"
                  >
                    <span className="text-2xl">🖼️</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">上传图片</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">JPG/PNG/WebP，最大 5MB</div>
                    </div>
                    <span className="text-slate-400">›</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    className="hidden"
                  />
                  {customImage && (
                    <>
                      <button
                        onClick={() => applyBackground({ type: 'custom', customImageId: 'custom-bg' })}
                        className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800"
                      >
                        <div
                          className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0"
                          style={{ backgroundImage: `url(${customImage})` }}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">使用自定义背景</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {bgSettings.type === 'custom' ? '当前应用中' : '点击应用'}
                          </div>
                        </div>
                        {bgSettings.type === 'custom' && <span className="text-emerald-500">✓</span>}
                      </button>
                      <button
                        onClick={handleClearCustom}
                        className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800"
                      >
                        <span className="text-2xl">🗑️</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-rose-500">删除自定义图片</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">从本地存储中移除</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="ios-card p-3 bg-amber-50 dark:bg-amber-900/20">
                <div className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  💡 提示：浅色背景适合白天使用，深色背景护眼适合夜间。自定义图片会自动压缩存储在本地，不会上传到任何服务器。
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-3">
              <div className="text-[12px] text-slate-500 leading-relaxed">
                💡 支持 OpenAI 兼容接口，如 智谱 GLM、OpenAI、DeepSeek、Moonshot 等。
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">API Base URL</label>
                <input value={baseURL} onChange={e => setBaseURL(e.target.value)} className="ios-input" />
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." className="ios-input" />
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-500 mb-1.5 block">模型名</label>
                <input value={model} onChange={e => setModel(e.target.value)} className="ios-input" />
              </div>
              <button onClick={saveAI} className="btn-primary w-full">保存</button>
              {existingAI && (
                <button onClick={() => { clearAISettings(); setApiKey(''); showToast('已清除 AI 配置', 'info'); }} className="w-full py-2 text-[13px] text-rose-500">
                  清除 AI 配置
                </button>
              )}
              <div className="ios-card p-3 mt-2 bg-amber-50 dark:bg-amber-900/20">
                <div className="text-[12px] text-amber-700 dark:text-amber-300 font-medium mb-1">常见平台配置</div>
                <div className="text-[11px] text-amber-600 dark:text-amber-400 space-y-1">
                  <div>• 智谱 GLM: https://open.bigmodel.cn/api/paas/v4 · glm-4-flash（免费）</div>
                  <div>• OpenAI: https://api.openai.com/v1 · gpt-4o-mini</div>
                  <div>• DeepSeek: https://api.deepseek.com/v1 · deepseek-chat</div>
                  <div>• Moonshot: https://api.moonshot.cn/v1 · moonshot-v1-8k</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="space-y-3">
              <div className="ios-list-group">
                <button onClick={handleExportJSON} className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800">
                  <span className="text-sm flex-1">导出为 JSON（含回收站）</span>
                  <span className="text-slate-400">›</span>
                </button>
                <button onClick={handleExportCSV} className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800">
                  <span className="text-sm flex-1">导出为 CSV（Excel 可打开）</span>
                  <span className="text-slate-400">›</span>
                </button>
                <label className="ios-list-item w-full text-left active:bg-slate-50 dark:active:bg-slate-800 cursor-pointer">
                  <span className="text-sm flex-1">从 JSON 导入（覆盖现有数据）</span>
                  <span className="text-slate-400">›</span>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </div>
              <div className="text-[11px] text-slate-400 px-2">
                💡 数据存储在手机本地 IndexedDB 中，卸载 App 会丢失。建议定期导出 JSON 备份。
              </div>
            </div>
          )}

          {tab === 'trash' && (
            <div>
              {trashedTasks.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">
                  <div className="text-3xl mb-2">🗑️</div>
                  回收站为空
                </div>
              ) : (
                <div className="ios-list-group">
                  {trashedTasks.map(t => (
                    <div key={t.id} className="ios-list-item">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{t.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          删除于 {new Date(t.deletedAt!).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                      <button
                        onClick={() => { restoreTask(t.id); showToast('已恢复', 'success'); }}
                        className="text-xs px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg font-medium"
                      >恢复</button>
                      <button
                        onClick={() => { if (confirm('永久删除？此操作不可撤销')) { purgeTask(t.id); showToast('已永久删除', 'info'); } }}
                        className="text-xs px-3 py-1.5 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-lg font-medium"
                      >删除</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-slate-400 px-2 mt-3">
                💡 回收站中的任务 30 天后会自动永久删除
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 图片压缩：缩放到 maxSize 内，转 JPEG base64
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 不支持'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
