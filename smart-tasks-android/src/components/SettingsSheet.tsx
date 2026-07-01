import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../lib/store';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/ai-client';
import { exportAllData, importAllData } from '../lib/db';
import { tasksToCSV, TAG_COLORS, TAG_COLOR_NAMES } from '../lib/task-utils';
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
import { useAuth, logout, mergeLocalToCloud, pullCloudToLocal, redeemCode } from '../lib/auth';
import { checkUpdateManual, getCachedUpdateInfo, CURRENT_VERSION } from '../lib/updater';
import SwipeableSheet from './SwipeableSheet';

interface Props {
  onClose: () => void;
  onOpenAuth?: () => void;
  onOpenLegal?: (type: 'privacy' | 'agreement' | 'about' | 'permissions') => void;
}

export default function SettingsSheet({ onClose, onOpenAuth, onOpenLegal }: Props) {
  const { theme, toggleTheme, tasks, purgeTask, restoreTask, tags, ensureTag, updateTagColor, deleteTag } = useTaskStore();
  const { user, pro, isConfigured } = useAuth();
  const [tab, setTab] = useState<'general' | 'background' | 'tags' | 'ai' | 'data' | 'trash'>('general');
  const existingAI = getAISettings();
  const [baseURL, setBaseURL] = useState(existingAI?.baseURL || 'https://open.bigmodel.cn/api/paas/v4');
  const [apiKey, setApiKey] = useState(existingAI?.apiKey || '');
  const [model, setModel] = useState(existingAI?.model || 'glm-4-flash');
  const [redeemInput, setRedeemInput] = useState('');
  const [updateInfo, setUpdateInfo] = useState(getCachedUpdateInfo());
  const [checking, setChecking] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('violet');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);

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
      applyBackground({ type: 'preset', presetId: 'linen' });
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
    <SwipeableSheet onClose={onClose}>
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={onClose} className="text-blue-500 text-[15px]">完成</button>
          <span className="text-[15px] font-semibold">设置</span>
          <span className="w-10" />
        </div>

        <div className="flex border-b border-[var(--border)] px-4 overflow-x-auto no-scrollbar mt-2">
          {([
            { id: 'general', label: '通用' },
            { id: 'background', label: '背景' },
            { id: 'tags', label: '标签' },
            { id: 'ai', label: 'AI' },
            { id: 'data', label: '数据' },
            { id: 'trash', label: '回收站' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[56px] py-2.5 text-sm font-medium relative ${tab === t.id ? 'text-[color:var(--primary)]' : 'text-[color:var(--text-secondary)]'}`}
            >
              {t.label}
              {tab === t.id && (<div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--primary)] rounded-full" />)}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'general' && (
            <div className="space-y-4">
              {/* 账号区 */}
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">账号</div>
                {isConfigured ? (
                  user ? (
                    <div className="ios-list-group">
                      <div className="ios-list-item">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center text-[color:#ffffff] font-bold flex-shrink-0">
                          {(user.email || user.phone || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{user.email || user.phone}</div>
                          <div className="text-[11px] mt-0.5">
                            {pro.isPro ? (
                              <span className="text-[color:var(--primary)] font-medium">⭐ Pro 会员{pro.expiresAt && pro.expiresAt < 9999999999999 ? ` · ${new Date(pro.expiresAt).toLocaleDateString('zh-CN')} 到期` : ' · 永久'}</span>
                            ) : (
                              <span className="text-[color:var(--text-tertiary)]">免费版</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('退出登录？本地数据保留，云端数据不变')) {
                            await logout();
                            showToast('已退出登录', 'info');
                          }
                        }}
                        className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                      >
                        <span className="text-sm flex-1 text-rose-500">退出登录</span>
                      </button>
                    </div>
                  ) : (
                    <div className="ios-list-group">
                      <button onClick={onOpenAuth} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                        <span className="text-2xl">👤</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">登录 / 注册</div>
                          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">登录后可云同步、多设备共享</div>
                        </div>
                        <span className="text-[color:var(--text-tertiary)]">›</span>
                      </button>
                    </div>
                  )
                ) : (
                  <div className="ios-card p-3 bg-[var(--card)]">
                    <div className="text-[11px] text-[color:var(--accent-amber)]">
                      ⚠️ 云服务未配置，账号功能不可用。本地数据仍可正常使用。
                    </div>
                  </div>
                )}
              </div>

              {/* Pro 会员区 */}
              {isConfigured && (
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">Pro 会员</div>
                  <div className="ios-list-group">
                    <div className="ios-list-item">
                      <span className="text-sm flex-1">当前状态</span>
                      <span className={`text-xs font-medium ${pro.isPro ? 'text-[color:var(--primary)]' : 'text-[color:var(--text-tertiary)]'}`}>
                        {pro.isPro ? '⭐ Pro 已激活' : '免费版'}
                      </span>
                    </div>
                    <div className="ios-list-item flex-col items-stretch !block">
                      <div className="text-[11px] text-[color:var(--text-secondary)] mb-1.5">兑换码</div>
                      <div className="flex gap-2">
                        <input
                          value={redeemInput}
                          onChange={e => setRedeemInput(e.target.value.toUpperCase())}
                          placeholder="SMART-XXXX-XXXX-XXXX"
                          className="ios-input flex-1 text-[12px] font-mono"
                          maxLength={19}
                        />
                        <button
                          onClick={async () => {
                            if (!redeemInput.trim()) { showToast('请输入兑换码', 'error'); return; }
                            try {
                              const result = await redeemCode(redeemInput.trim());
                              showToast(`激活成功！类型：${result.type}`, 'success');
                              setRedeemInput('');
                            } catch (e: any) {
                              showToast(e.message || '兑换失败', 'error');
                            }
                          }}
                          className="px-3 py-2 bg-[var(--primary)] text-[color:#ffffff] rounded-xl text-xs font-medium"
                        >兑换</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 同步区（已登录才显示） */}
              {isConfigured && user && (
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">数据同步</div>
                  <div className="ios-list-group">
                    <button
                      onClick={async () => {
                        try {
                          await mergeLocalToCloud();
                          showToast('本地数据已合并到云端', 'success');
                        } catch (e: any) { showToast(e.message || '同步失败', 'error'); }
                      }}
                      className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                    >
                      <span className="text-2xl">☁️</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">上传本地到云端</div>
                        <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">合并本地数据到云端（不覆盖）</div>
                      </div>
                      <span className="text-[color:var(--text-tertiary)]">›</span>
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('从云端拉取数据会覆盖本地，确定？')) return;
                        try {
                          await pullCloudToLocal();
                          showToast('已从云端拉取', 'success');
                          setTimeout(() => window.location.reload(), 800);
                        } catch (e: any) { showToast(e.message || '拉取失败', 'error'); }
                      }}
                      className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                    >
                      <span className="text-2xl">⬇️</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">从云端拉取</div>
                        <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">覆盖本地数据（慎用）</div>
                      </div>
                      <span className="text-[color:var(--text-tertiary)]">›</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 通用设置 */}
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">通用</div>
                <div className="ios-list-group">
                  <div className="ios-list-item">
                    <span className="text-sm flex-1">深色模式</span>
                    <button
                      onClick={toggleTheme}
                      className="w-12 h-7 rounded-full p-0.5 transition-colors"
                      style={{ background: theme === 'dark' ? 'var(--primary)' : 'var(--border-strong)' }}
                    >
                      <div className="w-6 h-6 bg-white rounded-full shadow transition-transform" style={{ transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      setChecking(true);
                      try {
                        const result = await checkUpdateManual();
                        if (result.hasUpdate) {
                          setUpdateInfo({ version: result.version!, url: result.url!, notes: result.notes! });
                        }
                      } finally { setChecking(false); }
                    }}
                    className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                  >
                    <span className="text-sm flex-1">检查更新</span>
                    {updateInfo ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(updateInfo.url, '_blank');
                          showToast('正在跳转浏览器下载…', 'info');
                        }}
                        className="px-3 py-1 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
                        style={{ background: 'var(--primary)', color: 'var(--bg)' }}
                      >📥 下载 v{updateInfo.version}</button>
                    ) : checking ? (
                      <span className="text-xs text-[color:var(--text-tertiary)]">检查中…</span>
                    ) : (
                      <span className="text-xs text-[color:var(--text-tertiary)]">v{CURRENT_VERSION} ›</span>
                    )}
                  </button>
                </div>
              </div>

              {/* 关于区 */}
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">关于</div>
                <div className="ios-list-group">
                  <button onClick={() => onOpenLegal?.('about')} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                    <span className="text-sm flex-1">关于智能待办</span>
                    <span className="text-[color:var(--text-tertiary)]">›</span>
                  </button>
                  <button onClick={() => onOpenLegal?.('privacy')} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                    <span className="text-sm flex-1">隐私政策</span>
                    <span className="text-[color:var(--text-tertiary)]">›</span>
                  </button>
                  <button onClick={() => onOpenLegal?.('agreement')} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                    <span className="text-sm flex-1">用户协议</span>
                    <span className="text-[color:var(--text-tertiary)]">›</span>
                  </button>
                  <button onClick={() => onOpenLegal?.('permissions')} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                    <span className="text-sm flex-1">权限说明</span>
                    <span className="text-[color:var(--text-tertiary)]">›</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'background' && (
            <div className="space-y-4">
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">预设背景</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESET_BACKGROUNDS.map(preset => {
                    const isActive = bgSettings.type === 'preset' && bgSettings.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => applyBackground({ type: 'preset', presetId: preset.id })}
                        className={`relative aspect-[3/4] rounded-2xl overflow-hidden transition-all active:scale-95 ${
                          isActive ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]' : ''
                        }`}
                        style={{ background: preset.cssBackground }}
                      >
                        <div className={`absolute inset-x-0 bottom-0 py-1.5 text-center text-[10px] font-medium ${
                          preset.textMode === 'light' ? 'text-[color:#ffffff] bg-black/30' : 'text-[color:var(--text-primary)] bg-white/60'
                        }`}>
                          {preset.name}
                        </div>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                            <span className="text-[color:#ffffff] text-xs">✓</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">自定义背景</div>
                <div className="ios-list-group">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                  >
                    <span className="text-2xl">🖼️</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">上传图片</div>
                      <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">JPG/PNG/WebP，最大 5MB</div>
                    </div>
                    <span className="text-[color:var(--text-tertiary)]">›</span>
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
                        className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                      >
                        <div
                          className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0"
                          style={{ backgroundImage: `url(${customImage})` }}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">使用自定义背景</div>
                          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
                            {bgSettings.type === 'custom' ? '当前应用中' : '点击应用'}
                          </div>
                        </div>
                        {bgSettings.type === 'custom' && <span className="text-[color:var(--primary)]">✓</span>}
                      </button>
                      <button
                        onClick={handleClearCustom}
                        className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]"
                      >
                        <span className="text-2xl">🗑️</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-rose-500">删除自定义图片</div>
                          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">从本地存储中移除</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="ios-card p-3 bg-[var(--card)]">
                <div className="text-[11px] text-[color:var(--accent-amber)] leading-relaxed">
                  💡 提示：浅色背景适合白天使用，深色背景护眼适合夜间。自定义图片会自动压缩存储在本地，不会上传到任何服务器。
                </div>
              </div>
            </div>
          )}

          {tab === 'tags' && (
            <div className="space-y-4">
              {/* 添加新标签 */}
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">添加新标签</div>
                <div className="ios-list-group">
                  <div className="ios-list-item flex-col items-stretch !block p-3">
                    <input
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      placeholder="标签名（如：工作、学习）"
                      className="ios-input mb-2"
                      maxLength={20}
                    />
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {TAG_COLOR_NAMES.map(c => (
                        <button
                          key={c}
                          onClick={() => setNewTagColor(c)}
                          className={`w-7 h-7 rounded-full ${TAG_COLORS[c]} ${newTagColor === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        if (!newTagName.trim()) { showToast('请输入标签名', 'error'); return; }
                        try {
                          await ensureTag(newTagName.trim(), newTagColor);
                          showToast('标签已添加', 'success');
                          setNewTagName('');
                        } catch (e: any) { showToast(e.message || '添加失败', 'error'); }
                      }}
                      className="btn-primary w-full"
                    >+ 添加标签</button>
                  </div>
                </div>
              </div>

              {/* 已有标签列表 */}
              <div>
                <div className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-2 px-1">
                  已有标签（{tags.length}）
                </div>
                {tags.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[color:var(--text-tertiary)]">
                    <div className="text-3xl mb-2">🏷️</div>
                    还没有标签，在上方添加一个吧
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tags.map(tag => {
                      const isEditing = editingTagId === tag.id;
                      // 统计使用此标签的任务数
                      const usageCount = tasks.filter(t => !t.deletedAt && t.tags.includes(tag.name)).length;
                      return (
                        <div key={tag.id} className="ios-card p-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${TAG_COLORS[tag.color] || TAG_COLORS.violet} flex items-center justify-center flex-shrink-0`}>
                              <span className="text-xs font-bold">#</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">#{tag.name}</div>
                              <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
                                {usageCount > 0 ? `${usageCount} 个任务使用` : '未被使用'}
                              </div>
                            </div>
                            <button
                              onClick={() => setEditingTagId(isEditing ? null : tag.id)}
                              className="px-2.5 py-1 bg-[var(--card)] text-xs font-medium rounded-lg active:scale-95 transition-transform"
                            >{isEditing ? '收起' : '编辑'}</button>
                            <button
                              onClick={async () => {
                                if (usageCount > 0) {
                                  if (!confirm(`标签 #${tag.name} 被 ${usageCount} 个任务使用，删除会从这些任务中移除该标签，确定？`)) return;
                                } else {
                                  if (!confirm(`确定删除标签 #${tag.name}？`)) return;
                                }
                                await deleteTag(tag.id);
                                showToast('标签已删除', 'info');
                              }}
                              className="px-2.5 py-1 bg-[var(--pri-high-soft)] text-[color:var(--pri-high)] text-xs font-medium rounded-lg active:scale-95 transition-transform"
                            >删除</button>
                          </div>
                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)] fade-in">
                              <div className="text-[11px] text-[color:var(--text-secondary)] mb-2">选择颜色</div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {TAG_COLOR_NAMES.map(c => (
                                  <button
                                    key={c}
                                    onClick={async () => {
                                      await updateTagColor(tag.id, c);
                                      showToast('颜色已更新', 'success');
                                    }}
                                    className={`w-8 h-8 rounded-full ${TAG_COLORS[c]} ${tag.color === c ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="ios-card p-3 bg-[var(--card)]">
                <div className="text-[11px] text-[color:var(--accent-amber)] leading-relaxed">
                  💡 标签用于分类任务，可在新建/编辑任务时选择。删除标签会从所有使用它的任务中移除，但不会删除任务本身。
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-3">
              <div className="text-[12px] text-[color:var(--text-secondary)] leading-relaxed">
                💡 支持 OpenAI 兼容接口，如 智谱 GLM、OpenAI、DeepSeek、Moonshot 等。
              </div>
              <div>
                <label className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-1.5 block">API Base URL</label>
                <input value={baseURL} onChange={e => setBaseURL(e.target.value)} className="ios-input" />
              </div>
              <div>
                <label className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-1.5 block">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." className="ios-input" />
              </div>
              <div>
                <label className="text-[13px] font-medium text-[color:var(--text-secondary)] mb-1.5 block">模型名</label>
                <input value={model} onChange={e => setModel(e.target.value)} className="ios-input" />
              </div>
              <button onClick={saveAI} className="btn-primary w-full">保存</button>
              {existingAI && (
                <button onClick={() => { clearAISettings(); setApiKey(''); showToast('已清除 AI 配置', 'info'); }} className="w-full py-2 text-[13px] text-rose-500">
                  清除 AI 配置
                </button>
              )}
              <div className="ios-card p-3 mt-2 bg-[var(--card)]">
                <div className="text-[12px] text-[color:var(--accent-amber)] font-medium mb-1">常见平台配置</div>
                <div className="text-[11px] text-[color:var(--accent-amber)] space-y-1">
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
                <button onClick={handleExportJSON} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                  <span className="text-sm flex-1">导出为 JSON（含回收站）</span>
                  <span className="text-[color:var(--text-tertiary)]">›</span>
                </button>
                <button onClick={handleExportCSV} className="ios-list-item w-full text-left active:active:bg-[var(--card-active)]">
                  <span className="text-sm flex-1">导出为 CSV（Excel 可打开）</span>
                  <span className="text-[color:var(--text-tertiary)]">›</span>
                </button>
                <label className="ios-list-item w-full text-left active:active:bg-[var(--card-active)] cursor-pointer">
                  <span className="text-sm flex-1">从 JSON 导入（覆盖现有数据）</span>
                  <span className="text-[color:var(--text-tertiary)]">›</span>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </div>
              <div className="text-[11px] text-[color:var(--text-tertiary)] px-2">
                💡 数据存储在手机本地 IndexedDB 中，卸载 App 会丢失。建议定期导出 JSON 备份。
              </div>
            </div>
          )}

          {tab === 'trash' && (
            <div>
              {trashedTasks.length === 0 ? (
                <div className="text-center py-10 text-sm text-[color:var(--text-tertiary)]">
                  <div className="text-3xl mb-2">🗑️</div>
                  回收站为空
                </div>
              ) : (
                <div className="ios-list-group">
                  {trashedTasks.map(t => (
                    <div key={t.id} className="ios-list-item">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{t.title}</div>
                        <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
                          删除于 {new Date(t.deletedAt!).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                      <button
                        onClick={() => { restoreTask(t.id); showToast('已恢复', 'success'); }}
                        className="text-xs px-3 py-1.5 bg-[var(--primary-soft)] text-[color:var(--primary)] rounded-lg font-medium"
                      >恢复</button>
                      <button
                        onClick={() => { if (confirm('永久删除？此操作不可撤销')) { purgeTask(t.id); showToast('已永久删除', 'info'); } }}
                        className="text-xs px-3 py-1.5 bg-[var(--pri-high-soft)] text-[color:var(--pri-high)] rounded-lg font-medium"
                      >删除</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-[color:var(--text-tertiary)] px-2 mt-3">
                💡 回收站中的任务 30 天后会自动永久删除
              </div>
            </div>
          )}
        </div>
    </SwipeableSheet>
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
