import { useState } from 'react';
import { useTaskStore } from '../lib/store';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/ai-client';
import { exportAllData, importAllData } from '../lib/db';
import { tasksToCSV } from '../lib/task-utils';
import { showToast } from './Toast';

interface Props { onClose: () => void; }

export default function SettingsSheet({ onClose }: Props) {
  const { theme, toggleTheme, tasks, purgeTask, restoreTask } = useTaskStore();
  const [tab, setTab] = useState<'general' | 'ai' | 'data' | 'trash'>('general');
  const existingAI = getAISettings();
  const [baseURL, setBaseURL] = useState(existingAI?.baseURL || 'https://open.bigmodel.cn/api/paas/v4');
  const [apiKey, setApiKey] = useState(existingAI?.apiKey || '');
  const [model, setModel] = useState(existingAI?.model || 'glm-4-flash');

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

        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4">
          {([
            { id: 'general', label: '通用' },
            { id: 'ai', label: 'AI' },
            { id: 'data', label: '数据' },
            { id: 'trash', label: '回收站' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-sm font-medium relative ${tab === t.id ? 'text-emerald-500' : 'text-slate-500'}`}
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
